/**
 * DOM HUD and panels. Pure presentation: it renders view models and reports
 * clicks back to the game controller, which turns them into intents.
 */
export interface Choice {
  label: string;
  detail?: string;
  disabled?: boolean;
  onChoose: () => void;
}

export interface DialogueView {
  name: string;
  title?: string;
  line: string;
  sections: { heading: string; choices: Choice[] }[];
  onMore?: () => void;
}

const CSS = `
#hud-root { position: fixed; inset: 0; pointer-events: none; font-family: Georgia, 'Times New Roman', serif; color: #f3e6d0; }
#hud-root .panel { pointer-events: auto; background: rgba(18,12,12,0.86); border: 2px solid #d9642b; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,0.5); }
#hud-status { position: absolute; left: 16px; top: 14px; padding: 10px 14px; min-width: 240px; max-width: calc(100vw - 32px); box-sizing: border-box; }
#hud-status h1 { margin: 0 0 2px; font-size: 15px; letter-spacing: 0.12em; color: #e8b04a; }
#hud-status .loc { font-size: 18px; margin: 2px 0; }
#hud-status .meta { font-size: 12px; opacity: 0.85; }
#hud-modes { position: absolute; right: 16px; top: 14px; display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; max-width: 60vw; }
#hud-modes button { pointer-events: auto; }
#hud-prompt { position: absolute; left: 50%; bottom: 90px; transform: translateX(-50%); padding: 8px 16px; font-size: 15px; display: none; white-space: nowrap; }
#hud-help { position: absolute; left: 16px; bottom: 14px; font-size: 12px; opacity: 0.75; text-shadow: 0 1px 2px #000; }
#hud-toasts { position: absolute; left: 50%; top: 16px; transform: translateX(-50%); display: flex; flex-direction: column; gap: 6px; align-items: center; width: min(520px, calc(100vw - 32px)); }
#hud-toasts .toast { padding: 8px 14px; font-size: 14px; animation: toastIn 0.25s ease-out; }
#hud-toasts .toast.bad { border-color: #a3302a; }
@keyframes toastIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
#hud-panel { position: absolute; right: 16px; bottom: 16px; width: min(420px, calc(100vw - 32px)); max-height: min(70vh, 640px); overflow: auto; padding: 14px 16px; display: none; box-sizing: border-box; }
#hud-panel h2 { margin: 0; font-size: 19px; color: #e8b04a; }
#hud-panel .sub { font-size: 12px; opacity: 0.8; margin-bottom: 8px; }
#hud-panel .line { font-style: italic; margin: 8px 0 12px; line-height: 1.4; }
#hud-panel h3 { font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: #d9642b; margin: 12px 0 6px; }
#hud-panel .row { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid rgba(255,217,168,0.12); font-size: 14px; }
#hud-panel .row small { opacity: 0.75; display: block; }
#hud-panel .entry { font-size: 13px; padding: 4px 0; border-bottom: 1px solid rgba(255,217,168,0.1); }
#hud-root button { font: inherit; font-size: 13px; color: #120c0c; background: #e8b04a; border: 0; border-radius: 6px; padding: 5px 10px; cursor: pointer; }
#hud-root button:hover { background: #ffd9a8; }
#hud-root button:disabled { opacity: 0.45; cursor: default; }
#hud-root button.active { background: #d9642b; color: #fff; }
#hud-labels { position: absolute; inset: 0; overflow: hidden; }
#hud-labels .label { position: absolute; transform: translate(-50%, -100%); font-size: 13px; white-space: nowrap; text-shadow: 0 1px 3px #000, 0 0 2px #000; }
#hud-labels .label.place { color: #e8b04a; font-size: 14px; letter-spacing: 0.06em; }
#hud-labels .label.sign { color: #ffd9a8; font-size: 11px; }
@media (max-width: 640px) { #hud-modes { top: auto; bottom: 46px; right: 16px; max-width: calc(100vw - 32px); } #hud-help { display: none; } }
`;

export class Hud {
  readonly root: HTMLElement;
  readonly labels: HTMLElement;
  private readonly status: HTMLElement;
  private readonly modes: HTMLElement;
  private readonly promptEl: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly panel: HTMLElement;
  private panelKind: string | null = null;

  constructor(parent: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = el('div', { id: 'hud-root' });
    this.labels = el('div', { id: 'hud-labels' });
    this.status = el('div', { id: 'hud-status', className: 'panel' });
    this.modes = el('div', { id: 'hud-modes' });
    this.promptEl = el('div', { id: 'hud-prompt', className: 'panel' });
    this.toasts = el('div', { id: 'hud-toasts' });
    this.panel = el('div', { id: 'hud-panel', className: 'panel' });
    const help = el('div', { id: 'hud-help' });
    help.textContent = 'WASD / arrows move · Shift run · E interact · F search · I inventory · J journal · C companions · 1–6 modes · K save · L load · N new · Esc close';
    this.root.append(this.labels, this.status, this.modes, this.promptEl, this.toasts, this.panel, help);
    parent.appendChild(this.root);
  }

  setStatus(s: { title: string; location: string; coin: string; mode: string; rules: string }): void {
    this.status.innerHTML = '';
    this.status.append(
      el('h1', { textContent: s.title }),
      el('div', { className: 'loc', textContent: s.location }),
      el('div', { className: 'meta', textContent: `${s.coin} · Mode: ${s.mode}` }),
      el('div', { className: 'meta', textContent: s.rules }),
    );
  }

  setModes(modes: { key: string; label: string; active: boolean; onChoose: () => void }[]): void {
    this.modes.innerHTML = '';
    for (const m of modes) {
      const b = el('button', { textContent: m.label, className: m.active ? 'active' : '' }) as HTMLButtonElement;
      b.onclick = m.onChoose;
      this.modes.appendChild(b);
    }
  }

  prompt(text: string | null): void {
    this.promptEl.style.display = text ? 'block' : 'none';
    if (text) this.promptEl.textContent = text;
  }

  toast(text: string, bad = false): void {
    const t = el('div', { className: `panel toast${bad ? ' bad' : ''}`, textContent: text });
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 4) this.toasts.firstChild?.remove();
    setTimeout(() => t.remove(), 4200);
  }

  get openPanel(): string | null {
    return this.panelKind;
  }

  close(): void {
    this.panel.style.display = 'none';
    this.panel.innerHTML = '';
    this.panelKind = null;
  }

  dialogue(v: DialogueView): void {
    this.show('dialogue');
    this.panel.append(el('h2', { textContent: v.name }));
    if (v.title) this.panel.append(el('div', { className: 'sub', textContent: v.title }));
    this.panel.append(el('div', { className: 'line', textContent: `“${v.line}”` }));
    for (const s of v.sections) {
      if (!s.choices.length) continue;
      this.panel.append(el('h3', { textContent: s.heading }));
      for (const c of s.choices) this.panel.append(this.choiceRow(c));
    }
    const actions = el('div', { className: 'row' });
    if (v.onMore) actions.append(button('Ask more', v.onMore));
    actions.append(button('Goodbye (Esc)', () => this.close()));
    this.panel.append(actions);
  }

  list(kind: string, title: string, sub: string, sections: { heading: string; rows: (string | Choice)[] }[]): void {
    this.show(kind);
    this.panel.append(el('h2', { textContent: title }), el('div', { className: 'sub', textContent: sub }));
    for (const s of sections) {
      this.panel.append(el('h3', { textContent: s.heading }));
      if (!s.rows.length) this.panel.append(el('div', { className: 'entry', textContent: '—' }));
      for (const r of s.rows) this.panel.append(typeof r === 'string' ? el('div', { className: 'entry', textContent: r }) : this.choiceRow(r));
    }
    this.panel.append(button('Close (Esc)', () => this.close()));
  }

  private show(kind: string): void {
    this.panel.innerHTML = '';
    this.panel.style.display = 'block';
    this.panelKind = kind;
  }

  private choiceRow(c: Choice): HTMLElement {
    const row = el('div', { className: 'row' });
    const text = el('div', { textContent: c.label });
    if (c.detail) text.append(el('small', { textContent: c.detail }));
    const b = button('Do it', c.onChoose);
    b.disabled = !!c.disabled;
    row.append(text, b);
    return row;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}): HTMLElementTagNameMap[K] {
  return Object.assign(document.createElement(tag), props);
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', { textContent: label });
  b.onclick = onClick;
  return b;
}
