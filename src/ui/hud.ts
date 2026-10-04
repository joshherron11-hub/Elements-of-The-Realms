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
:root {
  --ink: #120c0c; --ink2: #24161a; --gold: #e8b04a; --ember: #d9642b; --cream: #f6ead6; --muted: rgba(246,234,214,0.72);
  --line: rgba(232,176,74,0.5); --safe-t: env(safe-area-inset-top, 0px); --safe-b: env(safe-area-inset-bottom, 0px);
  --safe-l: env(safe-area-inset-left, 0px); --safe-r: env(safe-area-inset-right, 0px);
  --serif: 'Alegreya', 'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif;
  --display: 'Cinzel', 'Trajan Pro', 'Palatino Linotype', Georgia, serif;
}
#hud-root { position: fixed; inset: 0; pointer-events: none; font-family: var(--serif); color: var(--cream); -webkit-font-smoothing: antialiased; }
#hud-vignette { position: absolute; inset: 0; background: radial-gradient(ellipse 85% 75% at 50% 46%, rgba(0,0,0,0) 58%, rgba(14,6,10,0.55) 100%), linear-gradient(to bottom, rgba(42,18,12,0.28), rgba(0,0,0,0) 22%); }
#hud-root .panel { pointer-events: auto; position: absolute; background: linear-gradient(180deg, rgba(40,25,22,0.93), rgba(20,12,13,0.94)); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 10px 28px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,217,168,0.05); }
#hud-root .panel::before { content: ''; position: absolute; left: 14px; right: 14px; top: -1px; height: 2px; border-radius: 2px; background: linear-gradient(90deg, rgba(217,100,43,0), var(--ember), var(--gold), var(--ember), rgba(217,100,43,0)); }
#hud-status { left: calc(14px + var(--safe-l)); top: calc(12px + var(--safe-t)); padding: 10px 14px 10px; min-width: 230px; max-width: min(340px, calc(100vw - 28px)); box-sizing: border-box; }
#hud-status h1 { margin: 0; font: 600 11px/1.3 var(--display); letter-spacing: 0.16em; color: var(--gold); text-transform: uppercase; }
#hud-status .loc { font: 700 20px/1.2 var(--serif); margin: 3px 0 4px; }
#hud-status .clock { font-size: 13px; color: #ffd9a8; }
#hud-status .chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
#hud-status .chip { font-size: 12px; padding: 2px 9px; border-radius: 10px; background: rgba(232,176,74,0.14); border: 1px solid rgba(232,176,74,0.3); }
#hud-status .chip.coin { color: var(--gold); font-weight: 700; }
#hud-status .meta { font-size: 11px; color: var(--muted); margin-top: 6px; }
#hud-modes { position: absolute; right: calc(14px + var(--safe-r)); top: calc(12px + var(--safe-t)); display: flex; gap: 2px; padding: 3px; border-radius: 12px; background: rgba(18,12,12,0.72); border: 1px solid var(--line); pointer-events: auto; max-width: 62vw; overflow-x: auto; scrollbar-width: none; }
#hud-modes::-webkit-scrollbar { display: none; }
#hud-root #hud-modes button { background: transparent; color: var(--cream); border-radius: 9px; padding: 6px 11px; white-space: nowrap; font-weight: 500; }
#hud-root #hud-modes button:hover { background: rgba(232,176,74,0.18); }
#hud-root #hud-modes button.active { background: linear-gradient(180deg, #f0c060, #d9942e); color: var(--ink); font-weight: 700; }
#hud-tools { position: absolute; right: calc(14px + var(--safe-r)); top: calc(58px + var(--safe-t)); display: flex; gap: 6px; pointer-events: auto; }
#hud-root #hud-tools button { background: rgba(18,12,12,0.78); color: var(--cream); border: 1px solid var(--line); border-radius: 18px; padding: 5px 12px; font-size: 12px; }
#hud-prompt { left: 50%; bottom: calc(104px + var(--safe-b)); transform: translateX(-50%); padding: 9px 18px; font-size: 16px; display: none; white-space: nowrap; }
#hud-prompt b { color: var(--gold); font-family: var(--display); font-size: 13px; letter-spacing: 0.08em; margin-right: 6px; }
#hud-guide { left: calc(14px + var(--safe-l)); top: calc(150px + var(--safe-t)); max-width: min(340px, calc(100vw - 28px)); padding: 9px 13px; font-size: 14px; line-height: 1.35; display: none; box-sizing: border-box; }
#hud-guide b { color: var(--gold); font-family: var(--display); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; display: block; margin-bottom: 2px; }
#hud-help { position: absolute; left: calc(14px + var(--safe-l)); bottom: calc(12px + var(--safe-b)); font-size: 12px; color: var(--muted); text-shadow: 0 1px 2px #000; max-width: calc(100vw - 230px); }
#hud-help { display: flex; align-items: center; gap: 10px; pointer-events: auto; }
#hud-help .keys { display: none; }
#hud-help.open .keys { display: block; }
#hud-root #hud-help .help-toggle { background: rgba(18,12,12,0.72); color: var(--cream); border: 1px solid var(--line); border-radius: 16px; padding: 4px 11px; font-size: 12px; box-shadow: none; flex: none; }
#hud-help span { margin-right: 10px; white-space: nowrap; display: inline-block; }
#hud-root #hud-modes button kbd { font: 600 10px var(--serif); opacity: 0.7; margin-right: 5px; padding: 0 4px; border-radius: 4px; border: 1px solid currentColor; }
#hud-root.touch #hud-modes button kbd { display: none; }
#hud-prompt { animation: promptIn 0.22s ease-out; }
@keyframes promptIn { from { opacity: 0; transform: translate(-50%, 6px); } to { opacity: 1; transform: translate(-50%, 0); } }
#hud-prompt b { display: inline-block; min-width: 22px; padding: 1px 7px; margin-right: 9px; border-radius: 6px; text-align: center; background: linear-gradient(180deg, #f2c463, #d99a34); color: var(--ink) !important; box-shadow: 0 2px 0 rgba(0,0,0,0.45); }
#hud-help kbd { font-family: var(--serif); font-size: 11px; padding: 0 5px; border-radius: 4px; border: 1px solid rgba(246,234,214,0.35); background: rgba(18,12,12,0.55); color: var(--cream); }
#hud-toasts { position: absolute; left: 50%; top: calc(14px + var(--safe-t)); transform: translateX(-50%); display: flex; flex-direction: column; gap: 6px; align-items: center; width: min(460px, calc(100vw - 32px)); }
#hud-toasts .toast { position: relative; padding: 8px 16px; font-size: 15px; text-align: center; animation: toastIn 0.25s ease-out; }
#hud-toasts .toast.bad { border-color: #c0452f; }
#hud-toasts .toast.bad::before { background: linear-gradient(90deg, rgba(0,0,0,0), #c0452f, rgba(0,0,0,0)); }
@keyframes toastIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
#hud-panel { right: calc(14px + var(--safe-r)); bottom: calc(14px + var(--safe-b)); width: min(440px, calc(100vw - 28px)); max-height: min(72vh, 680px); overflow: auto; padding: 16px 18px 14px; display: none; box-sizing: border-box; overscroll-behavior: contain; }
#hud-panel h2 { margin: 0; font: 600 21px/1.25 var(--display); color: var(--gold); letter-spacing: 0.03em; }
#hud-panel .sub { font-size: 13px; color: var(--muted); margin: 2px 0 8px; }
#hud-panel .line { font-style: italic; font-size: 16px; margin: 10px 0 12px; line-height: 1.45; padding: 10px 12px; border-left: 3px solid var(--ember); background: rgba(255,217,168,0.05); border-radius: 0 8px 8px 0; }
#hud-panel h3 { font: 600 11px/1.2 var(--display); letter-spacing: 0.14em; text-transform: uppercase; color: var(--ember); margin: 14px 0 6px; }
#hud-panel .row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid rgba(255,217,168,0.1); font-size: 15px; }
#hud-panel .row small { color: var(--muted); display: block; font-size: 12px; margin-top: 1px; }
#hud-panel .entry { font-size: 14px; line-height: 1.4; padding: 5px 0; border-bottom: 1px solid rgba(255,217,168,0.08); }
#hud-root button { font: inherit; font-size: 14px; color: var(--ink); background: linear-gradient(180deg, #f2c463, #d99a34); border: 0; border-radius: 8px; padding: 6px 12px; cursor: pointer; box-shadow: 0 2px 0 rgba(0,0,0,0.35); }
#hud-root button:hover { filter: brightness(1.08); }
#hud-root button:active { transform: translateY(1px); box-shadow: none; }
#hud-root button:disabled { opacity: 0.4; cursor: default; filter: grayscale(0.5); }
#hud-root button.active { background: linear-gradient(180deg, #e8763a, #c4521f); color: #fff; }
#hud-labels { position: absolute; inset: 0; overflow: hidden; }
#hud-labels .label { position: absolute; transform: translate(-50%, -100%); font-size: 13px; font-weight: 700; white-space: nowrap; padding: 1px 9px 2px; border-radius: 10px; background: rgba(18,12,12,0.58); text-shadow: 0 1px 2px #000; }
#hud-labels .label.place { background: none; color: var(--gold); font: 600 14px/1.2 var(--display); letter-spacing: 0.1em; text-shadow: 0 2px 4px #000, 0 0 2px #000; }
#hud-labels .label.sign { background: none; color: #ffd9a8; font-size: 11px; font-weight: 500; }
#hud-labels .label.pet { color: #ffd9a8; font-size: 12px; }
#hud-labels .label .doing { display: block; font-size: 10px; font-weight: 400; color: var(--muted); font-style: italic; text-align: center; }
#hud-labels .label.asleep { opacity: 0.6; }
#hud-labels .bubble { position: absolute; transform: translate(-50%, -100%); max-width: 230px; white-space: normal; text-align: center; font-size: 13px; line-height: 1.3; padding: 6px 10px; background: rgba(255,246,228,0.96); color: #2a1a12; border-radius: 12px; box-shadow: 0 3px 10px rgba(0,0,0,0.4); }
#hud-labels .bubble::after { content: ''; position: absolute; left: 50%; bottom: -6px; margin-left: -6px; border: 6px solid transparent; border-bottom: 0; border-top-color: rgba(255,246,228,0.96); }
#hud-labels .float { position: absolute; transform: translate(-50%, -100%); font: 700 18px var(--display); color: var(--gold); text-shadow: 0 2px 3px #000; pointer-events: none; }
#hud-labels .float.neg { color: #ff8a6a; }
#hud-panel .tag { display: inline-block; font: 600 11px/1.5 var(--serif); padding: 0 8px; border-radius: 9px; margin-left: 8px; vertical-align: middle; letter-spacing: 0; }
#hud-panel .tag.warm { background: var(--gold); color: var(--ink); }
#hud-panel .tag.neutral { background: rgba(255,217,168,0.18); color: var(--cream); }
#hud-panel .tag.cold { background: #5a3a5e; color: #fff; }
#hud-panel .doing { font-size: 13px; color: var(--muted); font-style: italic; }
#hud-panel .readable { font-size: 15px; line-height: 1.5; padding: 7px 0; border-bottom: 1px dashed rgba(255,217,168,0.18); }
#hud-objectives { right: calc(14px + var(--safe-r)); top: calc(98px + var(--safe-t)); max-width: min(300px, calc(100vw - 32px)); padding: 9px 13px; font-size: 13px; display: none; }
#hud-objectives h4 { margin: 0 0 4px; font: 600 11px var(--display); letter-spacing: 0.14em; text-transform: uppercase; color: var(--ember); }
#hud-objectives .ob { padding: 3px 0; }
#hud-objectives .ob.ready { color: var(--gold); }
#hud-objectives .ob small { display: block; color: var(--muted); font-size: 11px; }
#hud-map { position: absolute; right: calc(14px + var(--safe-r)); bottom: calc(14px + var(--safe-b)); border-radius: 14px; overflow: hidden; border: 1px solid var(--line); box-shadow: 0 8px 22px rgba(0,0,0,0.45); pointer-events: none; line-height: 0; background: rgba(18,12,12,0.85); }
#hud-map .map-caption { width: 0; min-width: 100%; box-sizing: border-box; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; font: 600 10px var(--display); letter-spacing: 0.12em; text-transform: uppercase; color: var(--gold); text-align: center; padding: 5px 6px 6px; border-top: 1px solid rgba(232,176,74,0.25); }
#hud-touch { display: none; }
#hud-root.touch #hud-touch { display: block; }
#hud-touch .pad { position: absolute; left: calc(18px + var(--safe-l)); bottom: calc(18px + var(--safe-b)); width: 116px; height: 116px; border-radius: 50%; background: radial-gradient(circle, rgba(18,12,12,0.25), rgba(18,12,12,0.55)); border: 2px solid rgba(232,176,74,0.55); pointer-events: auto; touch-action: none; }
#hud-touch .knob { position: absolute; left: 35px; top: 35px; width: 46px; height: 46px; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #f6d07a, #c88a2a); box-shadow: 0 3px 8px rgba(0,0,0,0.45); pointer-events: none; }
#hud-touch .acts { position: absolute; right: calc(14px + var(--safe-r)); bottom: calc(16px + var(--safe-b)); display: grid; grid-template-columns: repeat(3, 60px); gap: 8px; pointer-events: auto; }
#hud-root #hud-touch .acts button { height: 48px; padding: 0; font-size: 13px; border-radius: 12px; touch-action: manipulation; background: rgba(28,18,16,0.82); color: var(--cream); border: 1px solid var(--line); }
#hud-root #hud-touch .acts button.big { grid-column: span 3; height: 50px; font: 700 17px var(--display); letter-spacing: 0.08em; background: linear-gradient(180deg, #f2c463, #d99a34); color: var(--ink); border: 0; }
#hud-root.touch #hud-help { display: none; }
#hud-root.touch #hud-map { bottom: auto; top: calc(12px + var(--safe-t)); }
#hud-root.touch #hud-map canvas { width: 104px !important; height: 104px !important; }
#hud-root.touch #hud-modes { top: auto; right: auto; left: 50%; transform: translateX(-50%); bottom: calc(192px + var(--safe-b)); max-width: calc(100vw - 24px); }
#hud-root.touch #hud-tools { top: calc(142px + var(--safe-t)); }
#hud-root.touch #hud-objectives { display: none !important; }
#hud-root.touch #hud-prompt { bottom: calc(240px + var(--safe-b)); }
#hud-root.touch #hud-status { max-width: calc(100vw - 150px); min-width: 0; padding: 8px 11px; }
#hud-root.touch #hud-status .loc { font-size: 17px; }
#hud-root.touch #hud-status .meta { display: none; }
#hud-root.touch #hud-guide { top: auto; bottom: calc(240px + var(--safe-b)); left: 50%; transform: translateX(-50%); width: calc(100vw - 24px); max-width: 420px; font-size: 12.5px; padding: 6px 11px; line-height: 1.3; }
#hud-root.touch #hud-guide b { display: inline; margin-right: 4px; }
#hud-root.touch.has-prompt #hud-guide { display: none !important; }
@media (max-width: 640px) {
  #hud-help { display: none; }
  #hud-panel { left: 0; right: 0; bottom: 0; width: 100%; max-height: 64vh; border-radius: 16px 16px 0 0; border-width: 1px 0 0; padding-bottom: calc(14px + var(--safe-b)); }
  #hud-root.panel-open #hud-touch, #hud-root.panel-open #hud-modes, #hud-root.panel-open #hud-guide, #hud-root.panel-open #hud-prompt { display: none !important; }
  #hud-prompt { font-size: 14px; white-space: normal; max-width: 86vw; text-align: center; }
  #hud-toasts .toast { font-size: 13px; }
}
@media (max-height: 520px) and (orientation: landscape) {
  #hud-root.touch #hud-modes { bottom: auto; top: calc(10px + var(--safe-t)); left: auto; right: calc(130px + var(--safe-r)); transform: none; max-width: 40vw; }
  #hud-root.touch #hud-guide { display: none !important; }
  #hud-root.touch #hud-prompt { bottom: calc(150px + var(--safe-b)); }
  #hud-panel { max-height: 86vh; }
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
  readonly qualityButton: HTMLButtonElement;
  private readonly mapCaption: HTMLElement;
  private guideText = '';
  private objectivesKey = '';
  private panelKind: string | null = null;

  constructor(parent: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = el('div', { id: 'hud-root' });
    const vignette = el('div', { id: 'hud-vignette' });
    this.labels = el('div', { id: 'hud-labels' });
    this.status = el('div', { id: 'hud-status', className: 'panel' });
    this.modes = el('div', { id: 'hud-modes' });
    this.promptEl = el('div', { id: 'hud-prompt', className: 'panel' });
    this.toasts = el('div', { id: 'hud-toasts' });
    this.panel = el('div', { id: 'hud-panel', className: 'panel' });
    this.guideEl = el('div', { id: 'hud-guide', className: 'panel' });
    this.objectivesEl = el('div', { id: 'hud-objectives', className: 'panel' });
    this.map = el('div', { id: 'hud-map' });
    this.mapCaption = el('div', { className: 'map-caption' });
    const tools = el('div', { id: 'hud-tools' });
    this.soundButton = el('button', { id: 'hud-sound', textContent: '♪ Sound off', title: 'Sound (M)' });
    this.qualityButton = el('button', { id: 'hud-gfx', textContent: 'Graphics', title: 'Graphics quality (G)' });
    tools.append(this.soundButton, this.qualityButton);
    this.touch = el('div', { id: 'hud-touch' });
    const help = el('div', { id: 'hud-help', className: 'open' });
    const helpToggle = el('button', { className: 'help-toggle', textContent: '⌨ Controls' });
    helpToggle.onclick = () => help.classList.toggle('open');
    const keysEl = el('div', { className: 'keys' });
    help.append(helpToggle, keysEl);
    setTimeout(() => help.classList.remove('open'), 15000);
    const keys: [string, string][] = [['WASD', 'move'], ['Click', 'walk'], ['Shift', 'run'], ['E', 'interact'], ['F', 'search'], ['I', 'bag'], ['J', 'journal'], ['C', 'companions'], ['1–6', 'modes'], ['Wheel', 'zoom'], ['M', 'sound'], ['G', 'graphics'], ['K', 'save'], ['Esc', 'close']];
    for (const [k, what] of keys) {
      const item = el('span');
      item.append(el('kbd', { textContent: k }), document.createTextNode(` ${what}`));
      keysEl.append(item);
    }
    this.root.append(vignette, this.labels, this.status, this.guideEl, this.objectivesEl, this.modes, tools, this.map, this.promptEl, this.toasts, this.touch, this.panel, help);
    parent.appendChild(this.root);
  }

  setStatus(s: StatusView): void {
    this.status.innerHTML = '';
    const chips = el('div', { className: 'chips' });
    chips.append(el('span', { className: 'chip coin', textContent: s.coin }), el('span', { className: 'chip', textContent: s.mode }));
    this.status.append(
      el('h1', { textContent: s.title }),
      el('div', { className: 'loc', textContent: s.location }),
      ...(s.clock ? [el('div', { className: 'clock', textContent: s.clock })] : []),
      chips,
    );
    // Server rules are reference, not something to read every second: keep them in a tooltip.
    this.status.title = s.rules;
  }

  setModes(modes: { key: string; label: string; hotkey?: string; active: boolean; onChoose: () => void }[]): void {
    this.modes.innerHTML = '';
    for (const m of modes) {
      const b = el('button', { className: m.active ? 'active' : '', title: m.hotkey ? `${m.label} (${m.hotkey})` : m.label }) as HTMLButtonElement;
      if (m.hotkey) b.append(el('kbd', { textContent: m.hotkey }));
      b.append(document.createTextNode(m.label));
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
    this.soundButton.textContent = muted ? '♪ Sound off' : '♪ Sound on';
  }

  setQuality(q: 'low' | 'high'): void {
    this.qualityButton.textContent = q === 'high' ? '✦ Graphics: High' : '✧ Graphics: Low';
  }

  /** The minimap canvas plus a caption naming where you are. */
  setMap(canvas: HTMLCanvasElement): void {
    this.map.append(canvas, this.mapCaption);
  }

  mapTitle(text: string): void {
    if (this.mapCaption.textContent !== text) this.mapCaption.textContent = text;
  }

  /** A speech bubble or floating number anchored to the world; the caller positions it. */
  worldText(text: string, className: 'bubble' | 'float' | 'float neg'): HTMLElement {
    const e = el('div', { className, textContent: text });
    this.labels.appendChild(e);
    return e;
  }

  private promptText = '';

  /** "E — Talk to Pip": the key part is drawn as a badge. */
  prompt(text: string | null): void {
    if ((text ?? '') === this.promptText) return;
    this.promptText = text ?? '';
    this.promptEl.style.display = text ? 'block' : 'none';
    this.root.classList.toggle('has-prompt', !!text);
    this.promptEl.innerHTML = '';
    if (!text) return;
    const m = /^(\S+) — (.*)$/.exec(text);
    if (m) this.promptEl.append(el('b', { textContent: m[1]! }), document.createTextNode(m[2]!));
    else this.promptEl.textContent = text;
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
