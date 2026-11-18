/**
 * Entrées clavier/souris — Lot 1.
 *
 * On utilise `event.code` (position physique des touches) : KeyW/KeyA/KeyS/KeyD
 * correspondent à ZQSD sur un clavier AZERTY sans configuration particulière.
 */

export type ActionKey =
  | 'forward' | 'back' | 'left' | 'right'
  | 'interact' | 'reload' | 'sprint'
  | 'implant1' | 'implant2' | 'journal' | 'pause';

const KEYMAP: Record<string, ActionKey> = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyE: 'interact',
  KeyR: 'reload',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  Digit1: 'implant1',
  Digit2: 'implant2',
  KeyJ: 'journal', Tab: 'journal',
  Escape: 'pause',
};

export class Input {
  private down = new Set<ActionKey>();
  private pressedQueue: ActionKey[] = [];
  mouse = { x: 0, y: 0, ndcX: 0, ndcY: 0, left: false, right: false };
  private leftClicks = 0;
  private rightClicks = 0;
  /** Vrai quand un clic a eu lieu depuis la dernière lecture (tir semi-auto). */
  private enabled = true;

  attach(canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const a = KEYMAP[e.code];
      if (!a) return;
      if (e.code === 'Tab') e.preventDefault();
      if (!this.down.has(a)) this.pressedQueue.push(a);
      this.down.add(a);
    });
    window.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (a) this.down.delete(a);
    });
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0) { this.mouse.left = true; this.leftClicks++; }
      if (e.button === 2) { this.mouse.right = true; this.rightClicks++; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => this.releaseAll());
  }

  setEnabled(v: boolean) { this.enabled = v; if (!v) this.releaseAll(); }

  isDown(a: ActionKey) { return this.down.has(a); }

  /** Consomme les appuis de touche survenus depuis le dernier appel. */
  consumePresses(): ActionKey[] {
    const q = this.pressedQueue;
    this.pressedQueue = [];
    return q;
  }

  /** Nombre de clics gauches depuis la dernière consommation. */
  consumeLeftClicks(): number { const n = this.leftClicks; this.leftClicks = 0; return n; }
  consumeRightClicks(): number { const n = this.rightClicks; this.rightClicks = 0; return n; }

  releaseAll() {
    this.down.clear();
    this.pressedQueue.length = 0;
    this.mouse.left = false;
    this.mouse.right = false;
    this.leftClicks = 0;
    this.rightClicks = 0;
  }

  /** Recalcule les coordonnées normalisées après un redimensionnement. */
  updateNdc(w: number, h: number) {
    this.mouse.ndcX = (this.mouse.x / w) * 2 - 1;
    this.mouse.ndcY = -(this.mouse.y / h) * 2 + 1;
  }
}
