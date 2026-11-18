/**
 * Interface HTML — menu, HUD, journal, dialogues, modales (plan archi. « UI »).
 */
import type { JournalSection } from '../game/mission';

export interface DialogAction {
  label: string;
  primary?: boolean;
  cb: () => void;
}

export interface ModalButton {
  label: string;
  primary?: boolean;
  danger?: boolean;
  cb: () => void;
}

type PressHandler = (a: 'interact' | 'journal' | 'pause') => void;

export class Hud {
  private el = (id: string) => document.getElementById(id)!;
  private onDialogAdvance: (() => void) | null = null;
  pressHandler: PressHandler | null = null;

  constructor() {
    this.el('journal-close').addEventListener('click', () => this.pressHandler?.('journal'));
    this.el('dlg-more').addEventListener('click', () => this.onDialogAdvance?.());
    this.el('dlg-accept').addEventListener('click', () => this.onDialogAdvance?.());
    this.el('dlg-decline').addEventListener('click', () => this.onDialogAdvance?.());
    this.el('dlg-close').addEventListener('click', () => this.onDialogAdvance?.());
  }

  // ---------------------------------------------------------------- menu
  setMenuStatus(text: string) { this.el('menu-status').textContent = text; }
  enableNewGame() { (this.el('btn-new') as HTMLButtonElement).disabled = false; }
  enableContinue() {
    const b = this.el('btn-continue') as HTMLButtonElement;
    b.disabled = false;
    b.classList.remove('hidden');
  }
  hideMenu() { this.el('menu').classList.add('hidden'); }
  showMenu() { this.el('menu').classList.remove('hidden'); }

  // ---------------------------------------------------------------- HUD
  showHud() { this.el('hud').classList.remove('hidden'); }
  hideHud() { this.el('hud').classList.add('hidden'); }

  updateHud(d: {
    hp: number; maxHp: number; money: number; ammo: number; reserve: number; reloading: boolean;
    cd1: number; cd2: number; maxCd1: number; maxCd2: number;
  }) {
    (document.querySelector('#hud-hp') as HTMLElement).style.width = `${Math.max(0, (d.hp / d.maxHp) * 100)}%`;
    this.el('hud-money').textContent = `¤ ${d.money}`;
    this.el('hud-ammo').textContent = d.reloading ? 'RECHARGE…' : `${d.ammo} / ${d.reserve}`;
    this.setCd('imp-1', d.cd1, d.maxCd1);
    this.setCd('imp-2', d.cd2, d.maxCd2);
  }

  private setCd(id: string, cd: number, max: number) {
    const box = this.el(id);
    const fill = this.el(`${id}-cd`) as HTMLElement;
    const f = max > 0 ? 1 - cd / max : 1;
    fill.style.width = `${Math.max(0, Math.min(1, f)) * 100}%`;
    box.classList.toggle('ready', cd <= 0);
  }

  objective(text: string, sub: string) {
    this.el('hud-objective').textContent = text;
    this.el('hud-subobjective').textContent = sub;
  }

  alert(level: string) {
    const chip = this.el('hud-alert');
    const map: Record<string, [string, string]> = {
      calme: ['RAS', 'calm'],
      'observé': ['OBSERVÉ', 'seen'],
      'confirmé': ['CONFIRMÉ', 'confirmed'],
      'recherche': ['RECHERCHE', 'search'],
    };
    const [label, cls] = map[level] ?? ['RAS', 'calm'];
    chip.textContent = label;
    chip.className = `alert-chip ${cls}`;
  }

  zone(name: string) { this.el('hud-zone').textContent = name; }

  prompt(text: string | null) {
    const p = this.el('hud-prompt');
    if (text) {
      p.innerHTML = text;
      p.classList.remove('hidden');
    } else {
      p.textContent = '';
      p.classList.add('hidden');
    }
  }

  targetLabel(text: string | null) {
    const t = this.el('hud-target');
    if (text) { t.textContent = text; t.classList.remove('hidden'); }
    else t.classList.add('hidden');
  }

  crosshair(x: number, y: number, valid: boolean) {
    const c = this.el('hud-crosshair');
    c.style.left = `${x}px`;
    c.style.top = `${y}px`;
    c.classList.toggle('valid', valid);
    c.style.display = 'block';
  }
  hideCrosshair() { (this.el('hud-crosshair') as HTMLElement).style.display = 'none'; }

  delivery(visible: boolean, fill01: number, state: string) {
    const d = this.el('hud-delivery');
    if (!visible) { d.classList.add('hidden'); return; }
    d.classList.remove('hidden');
    (document.querySelector('#hud-delivery-fill') as HTMLElement).style.width = `${Math.max(0, Math.min(1, fill01)) * 100}%`;
    this.el('hud-delivery-state').textContent = state;
  }

  marker(visible: boolean, x?: number, y?: number, distText?: string, angleDeg?: number) {
    const m = this.el('hud-marker');
    if (!visible || x === undefined || y === undefined) { m.classList.add('hidden'); return; }
    m.classList.remove('hidden');
    m.style.left = `${x}px`;
    m.style.top = `${y}px`;
    m.querySelector('.marker-dist')!.textContent = distText ?? '';
    (m.querySelector('.marker-arrow') as HTMLElement).style.transform = angleDeg === undefined ? '' : `rotate(${angleDeg}deg)`;
  }

  toast(text: string, kind: 'info' | 'reward' | 'warn' = 'info') {
    const box = this.el('hud-toasts');
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = text;
    box.appendChild(t);
    setTimeout(() => t.classList.add('out'), 3200);
    setTimeout(() => t.remove(), 3900);
    while (box.children.length > 4) box.firstChild?.remove();
  }

  damageFlash() {
    const d = this.el('hud-damage');
    d.classList.add('hit');
    setTimeout(() => d.classList.remove('hit'), 60);
  }

  // ---------------------------------------------------------------- journal
  journalOpen(sections: JournalSection[]) {
    const body = this.el('journal-body');
    body.innerHTML = '';
    for (const s of sections) {
      const div = document.createElement('div');
      div.className = 'j-section';
      const h = document.createElement('h3');
      h.textContent = s.title;
      div.appendChild(h);
      for (const e of s.entries) {
        const entry = document.createElement('div');
        entry.className = `j-entry ${e.kind}`;
        const t = document.createElement('h4');
        t.textContent = e.title;
        entry.appendChild(t);
        if (e.body) {
          const p = document.createElement('p');
          p.textContent = e.body;
          entry.appendChild(p);
        }
        if (e.status) {
          const st = document.createElement('div');
          st.className = 'j-status';
          st.textContent = e.status;
          entry.appendChild(st);
        }
        div.appendChild(entry);
      }
      body.appendChild(div);
    }
    this.el('journal').classList.remove('hidden');
  }
  journalClose() { this.el('journal').classList.add('hidden'); }
  get journalVisible() { return !this.el('journal').classList.contains('hidden'); }

  // ---------------------------------------------------------------- pause
  showPause(canAbandon: boolean) {
    this.el('pause').classList.remove('hidden');
    this.el('btn-abandon').classList.toggle('hidden', !canAbandon);
  }
  hidePause() { this.el('pause').classList.add('hidden'); }

  // ---------------------------------------------------------------- dialogue
  dialogueActive() { return !this.el('dialogue').classList.contains('hidden'); }

  startDialogue(speaker: string, lines: readonly string[], actions: DialogAction[] = [], onDone?: () => void) {
    this.el('dialogue').classList.remove('hidden');
    this.el('dlg-name').textContent = speaker;
    let i = 0;
    const more = this.el('dlg-more');
    const accept = this.el('dlg-accept');
    const decline = this.el('dlg-decline');
    const close = this.el('dlg-close');
    const showLine = () => {
      this.el('dlg-text').textContent = lines[i];
      const last = i >= lines.length - 1;
      // boutons : continuer au milieu ; actions à la fin
      more.classList.toggle('hidden', last);
      if (last) {
        if (actions.length > 0) {
          accept.textContent = actions[0].label;
          accept.classList.remove('hidden');
          decline.textContent = actions[1]?.label ?? 'Fermer';
          decline.classList.toggle('hidden', actions.length < 2);
          close.classList.add('hidden');
        } else {
          close.classList.remove('hidden');
          accept.classList.add('hidden');
          decline.classList.add('hidden');
        }
      } else {
        accept.classList.add('hidden');
        decline.classList.add('hidden');
        close.classList.add('hidden');
      }
    };
    const advance = () => {
      if (i < lines.length - 1) { i++; showLine(); return; }
      // fin : action principale ou fermeture
      if (actions.length > 0) {
        this.endDialogue();
        actions[0].cb();
      } else {
        this.endDialogue();
        onDone?.();
      }
    };
    this.onDialogAdvance = () => advance();
    // les boutons d'action mappent directement
    accept.onclick = () => { this.endDialogue(); actions[0]?.cb(); };
    decline.onclick = () => { this.endDialogue(); actions[1]?.cb(); };
    close.onclick = () => { this.endDialogue(); onDone?.(); };
    showLine();
  }

  /** Avance le dialogue (touche E). Retourne false si aucun dialogue actif. */
  advanceDialogue(): boolean {
    if (!this.dialogueActive()) return false;
    // le clic « continuer » au milieu ; en fin de dialogue sans action, E ferme
    this.onDialogAdvance?.();
    return true;
  }

  endDialogue() {
    this.el('dialogue').classList.add('hidden');
    this.onDialogAdvance = null;
  }

  // ---------------------------------------------------------------- modale
  modal(title: string, text: string, buttons: ModalButton[]) {
    this.el('modal-title').textContent = title;
    this.el('modal-text').textContent = text;
    const box = this.el('modal-buttons');
    box.innerHTML = '';
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.className = `btn ${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''}`;
      btn.textContent = b.label;
      btn.addEventListener('click', () => {
        this.hideModal();
        b.cb();
      });
      box.appendChild(btn);
    }
    this.el('modal').classList.remove('hidden');
  }
  hideModal() { this.el('modal').classList.add('hidden'); }
  get modalVisible() { return !this.el('modal').classList.contains('hidden'); }
}
