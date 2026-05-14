import {
  Component, NgZone, ChangeDetectorRef, OnDestroy,
  ViewChild, ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type Choice = 'Камень' | 'Ножницы' | 'Бумага' | 'Ящерица' | 'Спок';
type GameMode = 'manual' | 'auto';

interface GameResult {
  player: Choice;
  computer: Choice;
  winner: 'Игрок' | 'Компьютер' | 'Ничья';
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnDestroy {
  @ViewChild('playerStrip')   playerStripEl!:   ElementRef<HTMLElement>;
  @ViewChild('computerStrip') computerStripEl!: ElementRef<HTMLElement>;

  mode: GameMode = 'manual';

  choices: Choice[] = ['Камень', 'Ножницы', 'Бумага', 'Ящерица', 'Спок'];

  choiceImage: Record<Choice, string> = {
    'Камень':  'rock.png',
    'Ножницы': 'scissors.png',
    'Бумага':  'paper.png',
    'Ящерица': 'lizard.png',
    'Спок':    'spock.png'
  };

  wins: Record<Choice, Choice[]> = {
    'Камень':  ['Ножницы', 'Ящерица'],
    'Ножницы': ['Бумага',  'Ящерица'],
    'Бумага':  ['Камень',  'Спок'],
    'Ящерица': ['Бумага',  'Спок'],
    'Спок':    ['Камень',  'Ножницы']
  };

  playerChoice:   Choice | null = null;
  computerChoice: Choice | null = null;
  roundResult = '';
  animating   = false;
  history: GameResult[] = [];
  scores = { player: 0, computer: 0, draw: 0 };

  readonly ITEM_H = 120;
  reel: Choice[] = [...this.choices, ...this.choices, ...this.choices]; // 15 штук

  autoRunning      = false;
  autoSpeed        = 800;
  autoRoundsTotal  = 10;
  autoRoundsPlayed = 0;
  autoFinished     = false;

  private stopTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private autoStepTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(private zone: NgZone, private cdr: ChangeDetectorRef) {}

  ngOnDestroy(): void { this.clearTimers(); }

  setMode(m: GameMode): void {
    if (this.autoRunning) this.stopAuto();
    this.mode = m;
    this.resetGame();
  }

  private startReel(el: HTMLElement): void {
    const m = el.style.transform.match(/translateY\(([-\d.]+)px\)/);
    let y = m ? parseFloat(m[1]) : 0;

    const oneLoop = this.choices.length * this.ITEM_H;
    y = y % -oneLoop;
    if (y > 0)
    {
      y -= oneLoop
    }

    el.style.transition = 'none';
    el.style.transform  = `translateY(${y}px)`;
    void el.offsetHeight;

    el.style.animation = `reelSpin 0.4s linear infinite`;
  }

  private stopReel(el: HTMLElement, finalChoice: Choice, onDone: () => void): void {
    const idx = this.choices.indexOf(finalChoice) + 5;
    const targetY = -(idx * this.ITEM_H) + (0);

    const computed = window.getComputedStyle(el).transform;
    let currentY = 0;
    if (computed && computed !== 'none') {
      const match = computed.match(/matrix\(.*,\s*([-\d.]+)\)$/);
      if (match) currentY = parseFloat(match[1]);
    }

    el.style.animation  = 'none';
    el.style.transform  = `translateY(${currentY}px)`;

    void el.offsetHeight;

    let fromY = currentY;
    while (targetY > fromY - this.ITEM_H) {
      break;
    }

    let finalY = targetY;
    if (finalY > fromY) {
      finalY -= this.choices.length * this.ITEM_H * Math.ceil((finalY - fromY) / (this.choices.length * this.ITEM_H) + 1);
    }
    if (fromY - finalY < this.ITEM_H * 2) {
      finalY -= this.choices.length * this.ITEM_H;
    }

    const distance = Math.abs(fromY - finalY);
    const duration = Math.max(400, Math.min(900, distance * 1.5));

    el.style.transition = `transform ${duration}ms cubic-bezier(0.25, 0.1, 0.1, 1)`;
    el.style.transform  = `translateY(${finalY}px)`;

    setTimeout(() => onDone(), duration + 50);
  }


  private runRound(playerChoice: Choice, compChoice: Choice, onDone: () => void): void {
    this.animating   = true;
    this.roundResult = '';
    this.playerChoice   = null;
    this.computerChoice = null;
    this.cdr.detectChanges();

    const pEl = this.playerStripEl.nativeElement;
    const cEl = this.computerStripEl.nativeElement;

    void pEl.offsetHeight;

    setTimeout(() => {
      this.startReel(pEl);
      this.startReel(cEl);

      const spinTime = 1400;
      this.stopTimeoutId = setTimeout(() => {
        this.zone.run(() => {
          let pDone = false, cDone = false;
          const checkDone = () => {
            if (pDone && cDone) {
              this.playerChoice   = playerChoice;
              this.computerChoice = compChoice;
              this.resolveRound();
              this.animating = false;
              this.cdr.detectChanges();
              onDone();
            }
          };
          this.stopReel(pEl, playerChoice, () => { pDone = true; checkDone(); });
          this.stopReel(cEl, compChoice,   () => { cDone = true; checkDone(); });
        });
      }, spinTime);
    }, 30);
  }


  play(playerChoice: Choice): void {
    if (this.animating) return;
    const compChoice = this.choices[Math.floor(Math.random() * 5)];
    this.runRound(playerChoice, compChoice, () => {});
  }


  startAuto(): void {
    if (this.autoRunning) return;
    this.autoRunning      = true;
    this.autoFinished     = false;
    this.autoRoundsPlayed = 0;
    this.resetScoresAndHistory();
    this.cdr.detectChanges();
    this.runAutoStep();
  }

  private runAutoStep(): void {
    if (!this.autoRunning) return;
    if (this.autoRoundsPlayed >= this.autoRoundsTotal) {
      this.autoRunning  = false;
      this.autoFinished = true;
      this.cdr.detectChanges();
      return;
    }

    const p = this.choices[Math.floor(Math.random() * 5)];
    const c = this.choices[Math.floor(Math.random() * 5)];

    this.runRound(p, c, () => {
      this.autoRoundsPlayed++;
      this.cdr.detectChanges();
      this.autoStepTimeoutId = setTimeout(() => {
        this.zone.run(() => this.runAutoStep());
      }, 300);
    });
  }

  stopAuto(): void {
    this.clearTimers();
    this.autoRunning = false;
    this.animating   = false;
    this.cdr.detectChanges();
  }

  get autoLeader(): string {
    if (this.scores.player > this.scores.computer) return 'Игрок лидирует';
    if (this.scores.computer > this.scores.player) return 'Компьютер лидирует';
    return 'Счёт равный';
  }

  get autoWinner(): string {
    if (this.scores.player > this.scores.computer) return 'Победа игрока!';
    if (this.scores.computer > this.scores.player) return 'Победа компьютера!';
    return 'Ничья!';
  }

  get autoProgress(): number {
    return this.autoRoundsTotal > 0 ? (this.autoRoundsPlayed / this.autoRoundsTotal) * 100 : 0;
  }


  private resolveRound(): void {
    if (!this.playerChoice || !this.computerChoice) return;
    let winner: 'Игрок' | 'Компьютер' | 'Ничья';
    if (this.playerChoice === this.computerChoice) {
      winner = 'Ничья'; this.roundResult = 'Ничья!'; this.scores.draw++;
    } else if (this.wins[this.playerChoice].includes(this.computerChoice)) {
      winner = 'Игрок'; this.roundResult = 'Вы победили!'; this.scores.player++;
    } else {
      winner = 'Компьютер'; this.roundResult = 'Компьютер победил!'; this.scores.computer++;
    }
    this.history.unshift({ player: this.playerChoice!, computer: this.computerChoice!, winner });
  }

  private resetScoresAndHistory(): void {
    this.playerChoice   = null;
    this.computerChoice = null;
    this.roundResult    = '';
    this.history        = [];
    this.scores         = { player: 0, computer: 0, draw: 0 };
  }

  resetGame(): void {
    this.clearTimers();
    this.autoRunning      = false;
    this.autoFinished     = false;
    this.autoRoundsPlayed = 0;
    this.animating        = false;
    this.resetScoresAndHistory();
    setTimeout(() => {
      if (this.playerStripEl) {
        const p = this.playerStripEl.nativeElement;
        const c = this.computerStripEl.nativeElement;
        p.style.animation = 'none'; p.style.transform = 'translateY(0)';
        c.style.animation = 'none'; c.style.transform = 'translateY(0)';
      }
    }, 0);
  }

  private clearTimers(): void {
    if (this.stopTimeoutId)     { clearTimeout(this.stopTimeoutId);     this.stopTimeoutId     = null; }
    if (this.autoStepTimeoutId) { clearTimeout(this.autoStepTimeoutId); this.autoStepTimeoutId = null; }
  }
}
