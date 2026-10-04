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
  /** How this person regards the player, in words (never a rank). */
  relation?: { label: string; tone: 'cold' | 'neutral' | 'warm' };
  /** What they are doing right now. */
  activity?: string;
}

export interface StatusView {
  title: string;
  location: string;
  coin: string;
  mode: string;
  rules: string;
  clock?: string;
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
#hud-guide { position: absolute; left: 16px; top: 132px; max-width: min(360px, calc(100vw - 32px)); padding: 8px 12px; font-size: 13px; display: none; }
#hud-guide b { color: #e8b04a; }
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
#hud-status .clock { font-size: 12px; color: #ffd9a8; margin-top: 2px; }
#hud-panel .tag { display: inline-block; font-size: 11px; padding: 1px 7px; border-radius: 9px; margin-left: 6px; vertical-align: middle; font-style: normal; }
#hud-panel .tag.warm { background: #e8b04a; color: #120c0c; }
#hud-panel .tag.neutral { background: rgba(255,217,168,0.2); }
#hud-panel .tag.cold { background: #5a3a5e; color: #fff; }
#hud-panel .doing { font-size: 12px; opacity: 0.8; font-style: italic; }
#hud-panel .readable { font-size: 14px; line-height: 1.5; padding: 6px 0; border-bottom: 1px dashed rgba(255,217,168,0.18); }
#hud-objectives { position: absolute; right: 16px; top: 60px; max-width: min(300px, calc(100vw - 32px)); padding: 8px 12px; font-size: 12px; display: none; }
#hud-objectives h4 { margin: 0 0 4px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #d9642b; }
#hud-objectives .ob { padding: 2px 0; }
#hud-objectives .ob.ready { color: #e8b04a; }
#hud-objectives .ob small { display: block; opacity: 0.7; }
#hud-map { position: absolute; right: 16px; bottom: 16px; border-radius: 10px; overflow: hidden; border: 2px solid #d9642b; pointer-events: none; line-height: 0; }
#hud-sound { position: absolute; right: 16px; bottom: 180px; pointer-events: auto; }
#hud-labels .bubble { position: absolute; transform: translate(-50%, -100%); max-width: 220px; white-space: normal; text-align: center; font-size: 12px; padding: 5px 9px; background: rgba(255,246,228,0.95); color: #2a1a12; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.4); }
#hud-labels .float { position: absolute; transform: translate(-50%, -100%); font-size: 16px; font-weight: bold; color: #e8b04a; text-shadow: 0 1px 3px #000; pointer-events: none; }
#hud-labels .float.neg { color: #ff8a6a; }
#hud-labels .label .doing { display: block; font-size: 10px; opacity: 0.75; font-style: italic; text-align: center; }
#hud-labels .label.asleep { opacity: 0.6; }
#hud-touch { display: none; }
#hud-root.touch #hud-touch { display: block; }
#hud-touch .pad { position: absolute; left: 22px; bottom: 22px; width: 120px; height: 120px; border-radius: 50%; background: rgba(18,12,12,0.45); border: 2px solid rgba(232,176,74,0.6); pointer-events: auto; touch-action: none; }
#hud-touch .knob { position: absolute; left: 38px; top: 38px; width: 44px; height: 44px; border-radius: 50%; background: rgba(232,176,74,0.85); pointer-events: none; }
#hud-touch .acts { position: absolute; right: 18px; bottom: 22px; display: grid; grid-template-columns: repeat(3, 56px); gap: 8px; pointer-events: auto; }
#hud-touch .acts button { height: 48px; padding: 0; font-size: 12px; border-radius: 12px; touch-action: manipulation; }
#hud-touch .acts button.big { grid-column: span 3; height: 56px; font-size: 16px; }
#hud-root.touch #hud-help { display: none; }
#hud-root.touch #hud-map { bottom: auto; top: 14px; right: 16px; }
#hud-root.touch #hud-objectives { top: 130px; }
#hud-root.touch #hud-sound { bottom: auto; top: 120px; right: 136px; }
#hud-root.touch #hud-prompt { bottom: 200px; }
@media (max-width: 640px) {
  #hud-modes { top: auto; bottom: 168px; right: 16px; left: 16px; max-width: none; justify-content: center; }
  #hud-modes button { padding: 4px 7px; font-size: 11px; }
  #hud-help { display: none; }
  #hud-status { min-width: 0; padding: 6px 10px; max-width: calc(100vw - 150px); }
  #hud-status h1 { font-size: 11px; }
  #hud-status .loc { font-size: 15px; }
  #hud-status .meta:last-child { display: none; }
  #hud-guide { top: auto; bottom: 210px; font-size: 12px; }
  #hud-objectives { display: none !important; }
  #hud-panel { left: 0; right: 0; bottom: 0; width: 100%; max-height: 62vh; border-radius: 14px 14px 0 0; border-width: 2px 0 0; background: rgba(18,12,12,0.97); }
  #hud-root.panel-open #hud-touch, #hud-root.panel-open #hud-modes, #hud-root.panel-open #hud-guide, #hud-root.panel-open #hud-prompt { display: none !important; }
  #hud-prompt { bottom: 200px; font-size: 13px; white-space: normal; max-width: 80vw; text-align: center; }
  #hud-map canvas { width: 104px !important; height: 104px !important; }
}
`;

export class Hud {
  readonly root: HTMLElement;
  readonly labels: HTMLElement;
  private readonly status: HTMLElement;
  private readonly modes: HTMLElement;
  private readonly promptEl: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly guideEl: HTMLElement;
  private readonly objectivesEl: HTMLElement;
  readonly map: HTMLElement;
  readonly touch: HTMLElement;
  readonly soundButton: HTMLButtonElement;
  private guideText = '';
  private objectivesKey = '';
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
    this.guideEl = el('div', { id: 'hud-guide', className: 'panel' });
    this.objectivesEl = el('div', { id: 'hud-objectives', className: 'panel' });
    this.map = el('div', { id: 'hud-map' });
    this.soundButton = el('button', { id: 'hud-sound', textContent: '♪ off', title: 'Sound (M)' });
    this.touch = el('div', { id: 'hud-touch' });
    const help = el('div', { id: 'hud-help' });
    help.textContent = 'WASD / arrows or click to move · Shift run · E interact · F search · I inventory · J journal · C companions · 1–6 modes · M sound · K save · L load · N new · Esc close';
    this.root.append(this.labels, this.status, this.guideEl, this.objectivesEl, this.modes, this.map, this.soundButton, this.promptEl, this.toasts, this.touch, this.panel, help);
    parent.appendChild(this.root);
  }

  setStatus(s: StatusView): void {
    this.status.innerHTML = '';
    this.status.append(
      el('h1', { textContent: s.title }),
      el('div', { className: 'loc', textContent: s.location }),
      ...(s.clock ? [el('div', { className: 'clock', textContent: s.clock })] : []),
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

  guide(text: string | null): void {
    if ((text ?? '') === this.guideText) return;
    this.guideText = text ?? '';
    this.guideEl.style.display = text ? 'block' : 'none';
    this.guideEl.innerHTML = '';
    if (text) this.guideEl.append(el('b', { textContent: 'Next: ' }), document.createTextNode(text));
  }

  /** Open contract tasks, always visible so the player knows what they are doing. */
  objectives(list: { task: string; contract: string; ready: boolean; hint: string }[]): void {
    const key = JSON.stringify(list);
    if (key === this.objectivesKey) return;
    this.objectivesKey = key;
    this.objectivesEl.innerHTML = '';
    this.objectivesEl.style.display = list.length ? 'block' : 'none';
    if (!list.length) return;
    this.objectivesEl.append(el('h4', { textContent: 'Objectives' }));
    for (const o of list.slice(0, 4)) {
      const row = el('div', { className: `ob${o.ready ? ' ready' : ''}`, textContent: `${o.ready ? '◆' : '○'} ${o.task}` });
      row.append(el('small', { textContent: `${o.contract} — ${o.hint}` }));
      this.objectivesEl.append(row);
    }
  }

  /** Show or hide the on-screen joystick and action buttons. */
  setTouch(on: boolean): void {
    this.root.classList.toggle('touch', on);
  }

  setMuted(muted: boolean): void {
    this.soundButton.textContent = muted ? '♪ off' : '♪ on';
  }

  /** A speech bubble or floating number anchored to the world; the caller positions it. */
  worldText(text: string, className: 'bubble' | 'float' | 'float neg'): HTMLElement {
    const e = el('div', { className, textContent: text });
    this.labels.appendChild(e);
    return e;
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
    this.root.classList.remove('panel-open');
  }

  dialogue(v: DialogueView): void {
    this.show('dialogue');
    const h = el('h2', { textContent: v.name });
    if (v.relation) h.append(el('span', { className: `tag ${v.relation.tone}`, textContent: v.relation.label }));
    this.panel.append(h);
    if (v.title) this.panel.append(el('div', { className: 'sub', textContent: v.title }));
    if (v.activity) this.panel.append(el('div', { className: 'doing', textContent: v.activity }));
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

  /** A sign, notice board or deed. */
  read(title: string, lines: string[], extra: Choice[] = []): void {
    this.show('readable');
    this.panel.append(el('h2', { textContent: title }));
    for (const l of lines) this.panel.append(el('div', { className: 'readable', textContent: l }));
    for (const c of extra) this.panel.append(this.choiceRow(c));
    this.panel.append(button('Close (Esc)', () => this.close()));
  }

  private show(kind: string): void {
    this.panel.innerHTML = '';
    this.panel.style.display = 'block';
    this.panelKind = kind;
    this.root.classList.add('panel-open');
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
