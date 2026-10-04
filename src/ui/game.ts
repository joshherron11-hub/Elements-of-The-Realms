import * as THREE from 'three';
import type { ActorId, CurrencyId, OwnerRef } from '../core/refs';
import type { Intent, IntentOutcome, ModeKey } from '../modes/types';
import { buildSection, type BuiltSection } from '../render/builder';
import { animateFigure, createFamiliarFigure, createPerson, lookFromStyle, styleFor } from '../render/figures';
import { angleDelta, turnToward, type FamiliarAction } from '../render/rig';
import type { Looks } from '../render/looks';
import type { ReadableSpec, SceneLayout, Vec2 } from '../render/layout';
import { Materials } from '../render/materials';
import { createStage, type Palette, type Stage } from '../render/stage';
import { detectQuality, type GraphicsQuality } from '../render/quality';
import { targetDecal } from '../render/textures';
import { Ambient } from '../render/ambient';
import { lightingAt, type Lighting } from '../render/lighting';
import type { Simulation } from '../simulation';
import type { ChronicleEntry } from '../chronicle/types';
import type { KernelEvent } from '../core/events';
import { Hud, type Choice } from './hud';
import { Input } from './input';
import { nextStep } from './guide';
import { dist, moveWithCollision, nearest, zoneAt } from './navigation';
import { PointerControls, isTouchDevice } from './controls';
import { Minimap } from './minimap';
import { SynthPlayer, eventToCue, type SoundCue, type SoundPlayer } from './sound';
import { activityLabel, clockLabel, now, objectives, readableText, relationshipLabel } from './feedback';

const WALK = 5.5; // m/s — PROVISIONAL feel-tuning values below
const RUN = 9;
const TALK_RANGE = 3.2; // reaches across a counter
const GATHER_RANGE = 2.4;
const READ_RANGE = 2.6;
const NPC_WALK = 2.6;
const NPC_IDLE_RADIUS = 0.45; // small fidgets, so people stay where you expect them
const TAP_PICK = 1.8;

/** Presentation-only pseudo-random in [0,1). */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

interface FamiliarView {
  id: string;
  actorId: ActorId;
  figure: THREE.Group;
  at: Vec2;
  follows: boolean;
  floats: boolean;
  label: HTMLElement;
  keeper?: ActorId;
  offset: Vec2;
  seed: number;
  /** performance.now() until which it shows delight (after care). */
  joyUntil: number;
  walk: number;
  sniff: boolean;
  /** A care animation in progress (eat, bond, rest) or an idle sit. */
  action: FamiliarAction;
  actionStart: number;
  actionUntil: number;
}

interface NpcView {
  id: ActorId;
  figure: THREE.Group;
  at: Vec2;
  /** Where their routine puts them in this section. */
  target: Vec2;
  /** Set when they are walking out of this section. */
  leaving?: Vec2;
  idle?: Vec2;
  activity?: string;
  label: HTMLElement;
  doing: HTMLElement;
  seed: number;
  walking: boolean;
  /** Facing the body is turning towards (smoothed in `turnToward`). */
  yaw?: number;
}

interface WorldText {
  el: HTMLElement;
  anchor: () => THREE.Vector3;
  until: number;
  born: number;
  rise: boolean;
}

type Target =
  | { kind: 'npc'; npc: NpcView }
  | { kind: 'node'; id: string }
  | { kind: 'readable'; r: ReadableSpec }
  | { kind: 'stall'; id: string };

/**
 * The browser game loop. Reads simulation state, draws it, and turns player
 * input into intents for `sim.modes.perform`. It contains no gameplay rules:
 * every state change goes through an intent and can be rejected by the kernel.
 */
export class Game {
  readonly stage: Stage;
  private readonly materials: Materials;
  private readonly hud: Hud;
  private readonly input = new Input();
  private layout!: SceneLayout;
  private section!: BuiltSection;
  private readonly player: THREE.Group;
  private pos: Vec2 = [0, 0];
  private npcs: NpcView[] = [];
  private pets: FamiliarView[] = [];
  private placeLabels: { el: HTMLElement; at: THREE.Vector3 }[] = [];
  private dialogueWith: ActorId | null = null;
  private dialogueLine = 0;
  private lastStatus = '';
  private guideTimer = 0;
  private syncTimer = 0;
  private mapTimer = 0;
  private ambient?: Ambient;
  private light!: Lighting;
  private readonly palette: Palette;
  private readonly minimap = new Minimap(150);
  private readonly pointer: PointerControls;
  private readonly sound: SoundPlayer = new SynthPlayer();
  private texts: WorldText[] = [];
  private trail: Vec2[] = [];
  private stillMs = 0;
  private facing = 0;
  private walkTarget: Vec2 | null = null;
  private walkGoal: { kind: 'npc'; id: ActorId } | { kind: 'point' } = { kind: 'point' };
  private walkStuckMs = 0;
  private readonly tapRing: THREE.Mesh;
  private lastBalance = 0;
  private lastError = { text: '', at: 0 };
  private readonly relLabels = new Map<string, string>();
  private moodTimer = 30_000;
  /** Set by the app once the player has saved at least once. */
  saved = false;
  private readonly self: OwnerRef;
  private readonly currency: CurrencyId;

  constructor(
    private readonly sim: Simulation,
    private readonly playerId: ActorId,
    private readonly layouts: Map<string, SceneLayout>,
    container: HTMLElement,
    palette: Palette,
    private readonly looks: Looks = { people: {}, familiars: {} },
  ) {
    this.stage = createStage(container, palette, Game.initialQuality());
    this.materials = new Materials(palette);
    this.hud = new Hud(document.body);
    this.self = { kind: 'actor', id: playerId };
    this.currency = (sim.ctx.rules?.realm.constitution.economy.primaryCurrency ?? Object.keys(sim.state.currencies)[0]) as CurrencyId;
    this.player = createPerson(this.materials, looks.people.player ?? lookFromStyle(styleFor(this.materials, [], true)), 1);
    this.palette = palette;
    this.tapRing = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({ map: targetDecal(), color: palette.gold, transparent: true, opacity: 0.85, depthWrite: false }));
    this.tapRing.rotation.x = -Math.PI / 2;
    this.tapRing.position.y = 0.05;
    this.pointer = new PointerControls(this.stage.renderer.domElement, () => this.stage.camera, (t) => this.onTap(t.ground));
    this.hud.setMap(this.minimap.canvas);
    this.buildTouchControls();
    try {
      this.sound.setMuted(window.localStorage.getItem('eotr.sound') !== 'on');
    } catch {
      this.sound.setMuted(true);
    }
    this.hud.setMuted(this.sound.muted);
    this.hud.soundButton.onclick = () => this.toggleSound();
    this.hud.setQuality(this.stage.settings.quality);
    this.hud.qualityButton.onclick = () => this.toggleQuality();
    this.attachZoom();
  }

  /** Optional hooks the app wires up (saving lives outside the game loop). */
  onSave?: () => string | undefined;
  onLoad?: () => void;
  onNewGame?: () => void;
  /** Optional prose for the journal (AI gateway with authored fallback). */
  narrator?: (entries: ChronicleEntry[]) => Promise<string>;

  /** What the presentation layer needs to put the player back where they stood. */
  snapshot(): { sceneId: string; position: [number, number] } {
    return { sceneId: this.layout.id, position: [this.pos[0], this.pos[1]] };
  }

  toast(text: string, bad = false): void {
    this.hud.toast(text, bad);
  }

  /** The viewer's saved graphics preset, else a guess from the device. Per-viewer convenience only. */
  private static initialQuality(): GraphicsQuality {
    try {
      const saved = window.localStorage.getItem('eotr.gfx');
      if (saved === 'low' || saved === 'high') return saved;
    } catch {
      /* storage blocked: fall through */
    }
    const nav = navigator as Navigator & { deviceMemory?: number };
    return detectQuality({ touch: isTouchDevice(), cores: nav.hardwareConcurrency, memoryGb: nav.deviceMemory, width: window.innerWidth });
  }

  private toggleQuality(): void {
    const next: GraphicsQuality = this.stage.settings.quality === 'high' ? 'low' : 'high';
    this.stage.setQuality(next);
    try {
      window.localStorage.setItem('eotr.gfx', next);
    } catch {
      /* per-viewer convenience only */
    }
    this.hud.setQuality(next);
    this.hud.toast(`Graphics: ${next === 'high' ? 'High (shadows, glow)' : 'Low (fast)'}`);
    this.enterScene(this.layout.id, this.pos); // rebuild with the new decoration density
  }

  private zoomBy(k: number): void {
    this.stage.zoom(this.stage.zoomLevel * k);
  }

  /** Mouse wheel and two-finger pinch zoom the camera (presentation only). */
  private attachZoom(): void {
    const canvas = this.stage.renderer.domElement;
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomBy(e.deltaY > 0 ? 1.08 : 1 / 1.08);
    }, { passive: false });
    const touches = new Map<number, [number, number]>();
    let lastSpread = 0;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') touches.set(e.pointerId, [e.clientX, e.clientY]);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (touches.size !== 2) return;
      const [a, b] = [...touches.values()] as [[number, number], [number, number]];
      const spread = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (lastSpread) this.zoomBy(lastSpread / spread);
      lastSpread = spread;
    });
    const end = (e: PointerEvent) => {
      touches.delete(e.pointerId);
      if (touches.size < 2) lastSpread = 0;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  /** Where an NPC is drawn right now (debug / e2e). */
  npcPosition(id: string): Vec2 | undefined {
    const n = this.npcs.find((x) => x.id === id);
    return n ? [...n.at] : undefined;
  }

  private buildTouchControls(): void {
    const pad = document.createElement('div');
    pad.className = 'pad';
    const knob = document.createElement('div');
    knob.className = 'knob';
    pad.appendChild(knob);
    const acts = document.createElement('div');
    acts.className = 'acts';
    const btn = (label: string, key: string, big = false) => {
      const b = document.createElement('button');
      b.textContent = label;
      if (big) b.className = 'big';
      b.onclick = () => this.input.push(key);
      acts.appendChild(b);
    };
    btn('Interact', 'e', true);
    btn('Search', 'f');
    btn('Bag', 'i');
    btn('Pets', 'c');
    btn('Journal', 'j');
    btn('Save', 'k');
    btn('Close', 'Escape');
    this.hud.touch.append(pad, acts);
    this.pointer.attachStick(pad, knob);
    const decide = () => this.hud.setTouch(isTouchDevice() || window.innerWidth <= 640);
    decide();
    window.addEventListener('resize', decide);
  }

  private toggleSound(): void {
    this.sound.setMuted(!this.sound.muted);
    this.hud.setMuted(this.sound.muted);
    try {
      window.localStorage.setItem('eotr.sound', this.sound.muted ? 'off' : 'on');
    } catch {
      /* per-viewer convenience only */
    }
    if (!this.sound.muted) this.cue('bell');
  }

  private cue(c: SoundCue): void {
    this.sound.play(c);
  }

  /** Show text anchored in the world: a speech bubble, or a number that floats up. */
  private worldText(text: string, anchor: () => THREE.Vector3, kind: 'bubble' | 'float' | 'float neg', ms = 3500): void {
    if (kind === 'bubble') {
      // One bubble per speaker: replace an older one at the same anchor.
      const at = anchor();
      this.texts = this.texts.filter((t) => {
        if (!t.rise && t.anchor().distanceTo(at) < 0.01) {
          t.el.remove();
          return false;
        }
        return true;
      });
    }
    const t = performance.now();
    this.texts.push({ el: this.hud.worldText(text, kind), anchor, until: t + ms, born: t, rise: kind !== 'bubble' });
  }

  private sayNpc(id: ActorId, text: string): void {
    const n = this.npcs.find((x) => x.id === id);
    if (n) this.worldText(text, () => new THREE.Vector3(n.at[0], 3.2, n.at[1]), 'bubble');
  }

  /** Play a care animation (eat, bond, rest) with a little emote above the Familiar. */
  private petAction(familiarId: string, action: FamiliarAction, ms: number): void {
    const p = this.pets.find((x) => x.id === familiarId);
    if (!p) return;
    const t = performance.now();
    p.action = action;
    p.actionStart = t;
    p.actionUntil = t + ms;
    const emote = action === 'eat' ? '✿' : action === 'bond' ? '♥' : action === 'rest' ? 'z z' : '';
    if (emote) this.worldText(emote, () => new THREE.Vector3(p.at[0], p.floats ? 3.0 : 2.1, p.at[1]), 'float', 1800);
  }

  private sayPet(familiarId: string, text: string): void {
    const p = this.pets.find((x) => x.id === familiarId);
    if (p && p.action === 'none') p.joyUntil = performance.now() + 1600; // a happy hop, spin or wag
    if (p) this.worldText(text, () => new THREE.Vector3(p.at[0], p.floats ? 2.8 : 1.9, p.at[1]), 'bubble', 4200);
  }

  start(resume?: { sceneId?: string; position?: [number, number] }): void {
    // Read-only observation of the simulation: surface notable moments.
    this.sim.kernel.events.on('*', (e) => {
      const c = eventToCue(e as KernelEvent & { meta?: { actor?: string } }, this.playerId);
      if (c) this.cue(c);
    });
    this.sim.kernel.events.on('relationship.changed', (e) => this.onRelationship(e.payload as { from: string; to: string }));
    this.sim.kernel.events.on('relationship.formed', (e) => this.onRelationship(e.payload as { from: string; to: string }));
    this.sim.kernel.events.on('stall.sale', (e) => {
      const meta = (e as { meta?: { summary?: string } }).meta;
      if (meta?.summary) this.hud.toast(`◆ ${meta.summary}`);
    });
    this.sim.kernel.events.on('market.restocked', (e) => {
      const p = e.payload as { marketId: string };
      const m = this.sim.state.markets[p.marketId];
      if (m && this.sim.state.actors[this.playerId]?.locationId === m.locationId) this.hud.toast(`${m.name} has fresh stock.`);
    });
    for (const r of Object.values(this.sim.state.relationships)) {
      if (r.to === this.playerId) this.relLabels.set(r.from, relationshipLabel(r).label);
    }
    this.lastBalance = this.sim.economy.balance(this.self, this.currency);
    this.sim.kernel.events.on('happening.occurred', (e) => this.hud.toast(`✦ ${(e as { meta?: { summary?: string } }).meta?.summary ?? 'Something happened.'}`));
    this.sim.kernel.events.on('market.price-changed', (e) => {
      const p = e.payload as { marketId: string; reason: string };
      this.hud.toast(`${this.sim.state.markets[p.marketId]?.name ?? 'Market'}: ${p.reason}`);
    });
    const actor = this.sim.state.actors[this.playerId]!;
    const scene = this.sceneFor(actor.locationId) ?? [...this.layouts.keys()][0]!;
    const layout = this.layouts.get(scene)!;
    // Resume where the player stood, if that spot still lies in their current location.
    const saved = resume?.sceneId === scene && resume.position ? resume.position : undefined;
    const ok = saved && zoneAt(layout, saved) === actor.locationId;
    this.enterScene(scene, ok ? saved : layout.spawns[actor.locationId ?? ''] ?? layout.playerStart);
    this.refreshModes();
    this.stage.start((dt) => this.frame(dt));
  }

  /** For tests and debugging: the player's position in the current section. */
  get position(): Vec2 {
    return [...this.pos];
  }

  get sceneId(): string {
    return this.layout.id;
  }

  /** Teleport within the current section (debug / e2e only). Zone changes still go through travel intents. */
  debugPlace(at: Vec2): void {
    const before = this.pos;
    this.pos = [...at];
    this.onMoved(before);
  }

  /** Perform an intent, show its outcome, and return it. */
  act(intent: Intent, quiet = false): IntentOutcome | undefined {
    const r = this.sim.modes.perform(this.playerId, intent);
    if (!r.ok) {
      // Walking into a locked door repeats every frame; say it once.
      const t = performance.now();
      if (r.error.message !== this.lastError.text || t - this.lastError.at > 2000) {
        this.hud.toast(r.error.message, true);
        this.cue('error');
      }
      this.lastError = { text: r.error.message, at: t };
      return undefined;
    }
    if (!quiet) this.hud.toast(r.value.summary);
    return r.value;
  }

  private sceneFor(locationId: string | undefined): string | undefined {
    return locationId ? this.sim.state.locations[locationId]?.sceneKey : undefined;
  }

  private enterScene(sceneId: string, at: Vec2): void {
    const layout = this.layouts.get(sceneId);
    if (!layout) throw new Error(`No layout for scene ${sceneId}`);
    this.layout = layout;
    this.section = buildSection(layout, this.materials, this.stage.settings.density);
    this.section.group.add(this.player);
    this.tapRing.visible = false;
    this.section.group.add(this.tapRing);
    this.ambient = new Ambient(layout, this.materials, this.section, this.stage.settings.density);
    this.pos = [...at];
    this.trail = [[...at]];
    this.walkTarget = null;
    this.stage.setContent(this.section.group, { interior: layout.interior, bounds: [layout.size[0] / 2, layout.size[1] / 2] });
    this.player.position.set(at[0], 0, at[1]);
    this.hud.labels.innerHTML = '';
    this.texts = [];
    this.placeLabels = this.section.labels.map((l) => ({ el: this.label(l.text, l.kind), at: l.position }));
    this.npcs = [];
    this.syncNpcs(true);
    this.spawnFamiliars();
    this.hud.close();
    this.dialogueWith = null;
    this.applyLighting();
  }

  private hourNow(): number {
    const t = now(this.sim);
    return t.hour + t.minute / 60;
  }

  private applyLighting(): void {
    this.light = lightingAt(this.hourNow(), this.palette);
    this.stage.applyLighting(this.light);
    // Rim light: warm sunlight by day, cool moonlight by night, hearth-gold indoors.
    const rim = this.materials.rim;
    if (this.layout.interior) {
      rim.color.value.setHex(0xffb878);
      rim.strength.value = 0.5;
    } else {
      rim.color.value.setHex(0xffe0b0).lerp(new THREE.Color(0x9fb4ff), this.light.lamps);
      rim.strength.value = 0.45 + this.light.lamps * 0.2;
    }
  }

  private label(text: string, kind: string): HTMLElement {
    const el = document.createElement('div');
    el.className = `label ${kind}`;
    el.textContent = text;
    this.hud.labels.appendChild(el);
    return el;
  }

  /** Where an NPC's routine puts them in this section: their activity spot, else their usual place. */
  private npcHome(id: ActorId): Vec2 | undefined {
    const a = this.sim.state.actors[id];
    if (!a) return undefined;
    const loc = a.locationId ?? '';
    const spot = this.sim.state.npcActivity[id]?.spot;
    return (spot ? this.layout.spots[loc]?.[spot] : undefined) ?? this.layout.npcs[id] ?? this.layout.spawns[loc];
  }

  private nearestExit(to: Vec2): Vec2 {
    const e = nearest(this.layout.exits, to, (x) => x.at, Infinity);
    return e ? [...e.item.at] : [...to];
  }

  /**
   * Keep drawn NPCs in step with their routines: newcomers walk in from the
   * nearest exit, people whose routine took them elsewhere walk out.
   */
  private syncNpcs(initial = false): void {
    const present = new Set<string>();
    const taken = new Map<string, number>();
    for (const a of Object.values(this.sim.state.actors)) {
      if (a.kind !== 'npc' || this.sceneFor(a.locationId) !== this.layout.id) continue;
      const home = this.npcHome(a.id);
      if (!home) continue;
      // Two people at the same spot (a shared table) sit side by side.
      const key = `${home[0]},${home[1]}`;
      const i = taken.get(key) ?? 0;
      taken.set(key, i + 1);
      const target: Vec2 = i === 0 ? home : [home[0] + (i % 2 ? 1 : -1) * 1.1 * Math.ceil(i / 2), home[1] + 0.3];
      present.add(a.id);
      const activity = this.sim.state.npcActivity[a.id]?.activity;
      let n = this.npcs.find((x) => x.id === a.id);
      if (!n) {
        const at: Vec2 = initial ? [...target] : this.nearestExit(target);
        const figure = createPerson(this.materials, this.looks.people[a.id] ?? lookFromStyle(styleFor(this.materials, a.tags)), a.name.length * 13 + a.id.length);
        figure.position.set(at[0], 0, at[1]);
        this.section.group.add(figure);
        const label = this.label(a.name, 'npc');
        const doing = document.createElement('span');
        doing.className = 'doing';
        label.appendChild(doing);
        n = { id: a.id, figure, at, target, label, doing, seed: hash(a.name.length * 3.1 + at[0]) * 100, walking: false };
        this.npcs.push(n);
      }
      n.leaving = undefined;
      if (dist(n.target, target) > 0.01) n.idle = undefined;
      n.target = target;
      if (n.activity !== activity) {
        n.activity = activity;
        n.doing.textContent = activityLabel(activity) ?? '';
        n.label.classList.toggle('asleep', activity === 'asleep');
      }
    }
    for (const n of this.npcs) {
      if (present.has(n.id) || n.leaving) continue;
      n.leaving = this.nearestExit(n.at);
      const to = this.sim.state.locations[this.sim.state.actors[n.id]?.locationId ?? '']?.name;
      n.doing.textContent = to ? `off to ${to}` : '';
      n.label.classList.remove('asleep');
    }
  }

  private updateNpcs(dt: number): void {
    const t = performance.now();
    const keep: NpcView[] = [];
    for (const n of this.npcs) {
      const asleep = n.activity === 'asleep';
      const near = dist(n.at, this.pos) < 4.5;
      if (!n.leaving && !asleep && !near && dist(n.at, n.target) < 0.6) {
        // Idle: drift between nearby points every few seconds.
        const slot = Math.floor(t / 5000 + n.seed);
        const k = hash(slot + n.seed);
        n.idle = k < 0.45 ? undefined : [n.target[0] + (hash(slot * 7 + n.seed) - 0.5) * 2 * NPC_IDLE_RADIUS, n.target[1] + (hash(slot * 13 + n.seed) - 0.5) * 2 * NPC_IDLE_RADIUS];
      }
      const dest = n.leaving ?? n.idle ?? n.target;
      const d = dist(n.at, dest);
      n.walking = d > 0.08 && !(near && !n.leaving && d < 0.9);
      if (n.walking) {
        const step = Math.min(d, (n.leaving || d > 0.9 ? NPC_WALK : NPC_WALK * 0.35) * (dt / 1000));
        const dir: Vec2 = [((dest[0] - n.at[0]) / d) * step, ((dest[1] - n.at[1]) / d) * step];
        const moved = moveWithCollision(this.layout, n.at, dir);
        // Props in the way: people step around in life; here they slip past.
        n.at = dist(moved, n.at) < step * 0.3 ? [n.at[0] + dir[0], n.at[1] + dir[1]] : moved;
        n.yaw = Math.atan2(dir[0], dir[1]);
      }
      // Interaction facing: turn the body to someone close or talking; just the head for someone nearby.
      const toPlayer = Math.atan2(this.pos[0] - n.at[0], this.pos[1] - n.at[1]);
      const pd = dist(n.at, this.pos);
      const talkingTo = this.dialogueWith === n.id && this.hud.openPanel === 'dialogue';
      if (!n.walking && !asleep && (talkingTo || pd < 3.4)) n.yaw = toPlayer;
      const turned = turnToward(n.figure, n.yaw ?? n.figure.rotation.y, dt / 1000, n.walking ? 9 : 5);
      const look = !asleep && !n.walking && pd < 8 ? Math.max(-0.9, Math.min(0.9, angleDelta(n.figure.rotation.y, toPlayer))) : undefined;
      if (n.leaving && dist(n.at, n.leaving) < 0.3) {
        this.section.group.remove(n.figure);
        n.label.remove();
        continue;
      }
      n.figure.position.x = n.at[0];
      n.figure.position.z = n.at[1];
      const talking = this.dialogueWith === n.id && this.hud.openPanel === 'dialogue';
      animateFigure(n.figure, {
        t: t / 1000,
        dt: dt / 1000,
        walk: n.walking ? (n.leaving || d > 0.9 ? 1 : 0.4) : 0,
        sleeping: asleep && !n.walking,
        talking: talking || (near && !asleep && !n.walking && Math.sin(t / 900 + n.seed) > 0.6),
        turn: turned,
        look,
      });
      keep.push(n);
    }
    this.npcs = keep;
  }

  /** Familiars in this section: owned followers trail the player; others sit with their keeper or at a layout spot. */
  private spawnFamiliars(): void {
    for (const p of this.pets) {
      this.section.group.remove(p.figure);
      p.label.remove();
    }
    this.pets = [];
    for (const f of Object.values(this.sim.state.familiars)) {
      const fa = this.sim.state.actors[f.actorId];
      if (!fa || this.sceneFor(fa.locationId) !== this.layout.id) continue;
      const sp = this.sim.familiars.species(f);
      const owner = this.sim.familiars.ownerOf(f.id);
      const mine = owner?.kind === 'actor' && owner.id === this.playerId;
      const keeper = owner?.kind === 'actor' && !mine ? (owner.id as ActorId) : undefined;
      const keeperView = keeper ? this.npcs.find((n) => n.id === keeper) : undefined;
      const fixed = this.layout.npcs[f.id];
      const at: Vec2 | undefined = mine
        ? [this.pos[0] - 1.2, this.pos[1] + 1]
        : fixed ?? (keeperView ? [keeperView.at[0] + 1.3, keeperView.at[1] + 0.6] : this.layout.spawns[fa.locationId ?? '']);
      if (!at) continue;
      const figure = createFamiliarFigure(this.materials, sp?.figure ?? 'hound', this.looks.familiars[f.id]);
      figure.position.x = at[0];
      figure.position.z = at[1];
      this.section.group.add(figure);
      this.pets.push({
        id: f.id,
        actorId: f.actorId,
        figure,
        at: [...at],
        follows: mine && !!sp?.followsOwner,
        floats: sp?.figure === 'moth',
        label: this.label(f.name, 'pet'),
        keeper: fixed ? undefined : keeper,
        offset: [1.3, 0.6],
        seed: hash(f.name.length + at[0]) * 50,
        joyUntil: 0,
        walk: 0,
        sniff: false,
        action: 'none',
        actionStart: 0,
        actionUntil: 0,
      });
    }
  }

  /** A point `back` metres behind the player along the path they walked. */
  private trailPoint(back: number): Vec2 {
    let left = back;
    let prev: Vec2 = this.pos;
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const p = this.trail[i]!;
      const d = dist(prev, p);
      if (d >= left) {
        const k = left / d;
        return [prev[0] + (p[0] - prev[0]) * k, prev[1] + (p[1] - prev[1]) * k];
      }
      left -= d;
      prev = p;
    }
    return prev;
  }

  private updateFamiliars(dt: number): void {
    const t = performance.now();
    let follower = 0;
    for (const p of this.pets) {
      let dest: Vec2 | undefined;
      let sniffing = false;
      if (p.follows) {
        if (this.stillMs > 4000 && dist(p.at, this.pos) < 4) {
          // A while later: settle down and wait (the sit pose plays in animateFigure).
          dest = undefined;
        } else if (this.stillMs > 1500) {
          // The player has stopped: potter about nearby, sniffing.
          const slot = Math.floor(t / 2600 + p.seed);
          const ang = hash(slot + p.seed) * Math.PI * 2;
          const r = 1.4 + hash(slot * 3 + p.seed) * 1.2;
          dest = [this.pos[0] + Math.cos(ang) * r, this.pos[1] + Math.sin(ang) * r];
          sniffing = dist(p.at, dest) < 0.3;
        } else {
          dest = this.trailPoint(1.6 + follower * 1.3);
        }
        follower++;
        if (dist(p.at, this.pos) > 14) p.at = this.trailPoint(1.6); // left behind: catch up at once
      } else if (p.keeper) {
        const k = this.npcs.find((n) => n.id === p.keeper);
        if (k) dest = [k.at[0] + p.offset[0], k.at[1] + p.offset[1]];
      }
      let moving = false;
      if (dest) {
        const d = dist(p.at, dest);
        if (d > 0.12) {
          const speed = Math.min(11, 1.5 + d * 2.8);
          const step = Math.min(d, speed * (dt / 1000));
          const next: Vec2 = [p.at[0] + ((dest[0] - p.at[0]) / d) * step, p.at[1] + ((dest[1] - p.at[1]) / d) * step];
          turnToward(p.figure, Math.atan2(next[0] - p.at[0], next[1] - p.at[1]), dt / 1000, 10);
          p.at = next;
          moving = true;
        } else if (p.follows) {
          // Stopped: look back at the player.
          turnToward(p.figure, Math.atan2(this.pos[0] - p.at[0], this.pos[1] - p.at[1]), dt / 1000, 4);
        }
      }
      p.figure.position.x = p.at[0];
      p.figure.position.z = p.at[1];
      p.walk = moving ? Math.min(1.6, (p.walk + 0.2) * 0.9 + 0.1) : 0;
      p.sniff = sniffing;
      // Care animations play out; a follower that has been still a while sits and waits.
      if (p.action !== 'none' && p.action !== 'sit' && t > p.actionUntil) p.action = 'none';
      if (p.action === 'none' && p.follows && this.stillMs > 4000 && !moving) p.action = 'sit';
      if (p.action === 'sit' && (moving || this.stillMs < 4000)) p.action = 'none';
      const span = Math.max(1, p.actionUntil - p.actionStart);
      animateFigure(p.figure, {
        t: t / 1000 + p.seed,
        dt: dt / 1000,
        walk: p.walk,
        sniff: sniffing && p.action === 'none',
        joy: Math.max(0, (p.joyUntil - t) / 1600),
        action: p.action,
        actionT: Math.min(1, (t - p.actionStart) / span),
      });
    }
  }

  /** Now and then a companion shows how it feels, in its own personality. */
  private familiarMood(dt: number): void {
    this.moodTimer -= dt;
    if (this.moodTimer > 0) return;
    this.moodTimer = 45_000;
    const p = this.pets.find((x) => x.follows);
    if (!p) return;
    const st = this.sim.familiars.status(p.id as never);
    if (st.ok && st.value.mood) this.sayPet(p.id, st.value.mood);
  }

  private onRelationship(p: { from: string; to: string }): void {
    if (p.to !== this.playerId) return;
    const rel = Object.values(this.sim.state.relationships).find((r) => r.from === p.from && r.to === p.to);
    const label = relationshipLabel(rel).label;
    const before = this.relLabels.get(p.from);
    this.relLabels.set(p.from, label);
    const name = this.sim.state.actors[p.from]?.name ?? p.from;
    if (!before) this.hud.toast(`You met ${name}.`);
    else if (before !== label) {
      this.hud.toast(`${name} now thinks of you as: ${label}`, relationshipLabel(rel).tone === 'cold');
      this.sayNpc(p.from as ActorId, relationshipLabel(rel).tone === 'cold' ? '…' : '♥');
    }
  }

  private frame(dt: number): void {
    this.sim.tick(dt);
    for (const key of this.input.takePresses()) this.onKey(key);

    // Keyboard, then the on-screen stick, then a tapped destination.
    let [ax, az] = this.input.axis();
    let running = this.input.running();
    if (!ax && !az) [ax, az] = this.pointer.stick;
    if (ax || az) this.walkTarget = null;
    else if (this.walkTarget) {
      if (this.walkGoal.kind === 'npc') {
        const id = this.walkGoal.id;
        const n = this.npcs.find((x) => x.id === id);
        if (n) this.walkTarget = [...n.at];
      }
      const d = dist(this.pos, this.walkTarget);
      const arrive = this.walkGoal.kind === 'npc' ? TALK_RANGE * 0.7 : 0.25;
      if (d <= arrive) this.arrived();
      else {
        ax = (this.walkTarget[0] - this.pos[0]) / d;
        az = (this.walkTarget[1] - this.pos[1]) / d;
        running = d > 8;
      }
    }
    const movingNow = !!(ax || az);
    if (movingNow) {
      const speed = (running ? RUN : WALK) * (dt / 1000);
      const before = this.pos;
      this.pos = moveWithCollision(this.layout, this.pos, [ax * speed, az * speed]);
      this.facing = Math.atan2(ax, az);
      if (this.walkTarget) {
        this.walkStuckMs = dist(before, this.pos) < speed * 0.2 ? this.walkStuckMs + dt : 0;
        if (this.walkStuckMs > 500) this.arrived(); // blocked: stop where we are
      }
      const scene = this.layout.id;
      this.onMoved(before);
      if (this.layout.id === scene) {
        const last = this.trail[this.trail.length - 1];
        if (!last || dist(last, this.pos) > 0.35) {
          this.trail.push([...this.pos]);
          if (this.trail.length > 60) this.trail.shift();
        }
      }
      this.stillMs = 0;
    } else this.stillMs += dt;
    this.player.position.set(this.pos[0], 0, this.pos[1]);
    // Face the person you are talking to; otherwise the way you are going. Turning is smoothed.
    const partner = this.hud.openPanel === 'dialogue' ? this.npcs.find((x) => x.id === this.dialogueWith) : undefined;
    if (partner && !movingNow) this.facing = Math.atan2(partner.at[0] - this.pos[0], partner.at[1] - this.pos[1]);
    const turned = turnToward(this.player, this.facing, dt / 1000, 12);
    animateFigure(this.player, { t: performance.now() / 1000, dt: dt / 1000, walk: movingNow ? (running ? 1.4 : 1) : 0, talking: !!partner, turn: turned });
    this.tapRing.visible = !!this.walkTarget && this.walkGoal.kind === 'point';
    if (this.tapRing.visible) this.tapRing.scale.setScalar(1 + Math.sin(performance.now() / 150) * 0.15);

    this.syncTimer -= dt;
    if (this.syncTimer <= 0) {
      this.syncTimer = 500;
      this.syncNpcs();
    }
    this.updateNpcs(dt);
    if (this.dialogueWith && this.hud.openPanel === 'dialogue') {
      const n = this.npcs.find((x) => x.id === this.dialogueWith);
      if (!n || dist(n.at, this.pos) > TALK_RANGE + 2.5) this.hud.close();
    }

    this.updateFamiliars(dt);
    this.familiarMood(dt);
    this.applyLighting();
    this.ambient?.update(dt, performance.now(), this.hourNow(), this.light, this.stage.camera);
    this.updatePrompt();
    this.stage.follow(this.player.position, dt);
    this.coinFeedback();
    this.updateLabels();
    this.updateStatus();
    this.guideTimer -= dt;
    if (this.guideTimer <= 0) {
      this.guideTimer = 400;
      this.hud.guide(nextStep(this.sim, this.playerId, { saved: this.saved })?.text ?? null);
      this.hud.objectives(objectives(this.sim, this.playerId));
    }
    this.mapTimer -= dt;
    if (this.mapTimer <= 0) {
      this.mapTimer = 150;
      this.minimap.draw(this.layout, {
        player: this.pos,
        facing: this.facing,
        npcs: this.npcs.map((n) => n.at),
        pets: this.pets.map((p) => p.at),
        readables: [...this.layout.readables.map((r) => r.at), ...Object.values(this.layout.stalls)],
        currentZone: this.sim.state.actors[this.playerId]?.locationId,
      });
      this.hud.mapTitle(this.sim.state.locations[this.sim.state.actors[this.playerId]?.locationId ?? '']?.name ?? this.layout.name);
    }
  }

  /** Floating +/− numbers whenever the purse changes. */
  private coinFeedback(): void {
    const b = this.sim.economy.balance(this.self, this.currency);
    if (b === this.lastBalance) return;
    const d = b - this.lastBalance;
    this.lastBalance = b;
    const at = new THREE.Vector3(this.pos[0], 2.8, this.pos[1]);
    this.worldText(`${d > 0 ? '+' : '−'}${Math.abs(d)} ${this.sim.state.currencies[this.currency]?.symbol ?? ''}`.trim(), () => at, d > 0 ? 'float' : 'float neg', 1600);
  }

  /** Tap / click: walk there; if it was on someone or something, use it on arrival. */
  private onTap(ground: Vec2): void {
    const npc = nearest(this.npcs, ground, (n) => n.at, TAP_PICK);
    if (npc) {
      this.walkGoal = { kind: 'npc', id: npc.item.id };
      this.walkTarget = [...npc.item.at];
      return;
    }
    this.walkGoal = { kind: 'point' };
    const thing = [...this.layout.readables.map((r) => r.at), ...Object.values(this.layout.stalls), ...Object.values(this.layout.nodes)].find((p) => dist(p, ground) < TAP_PICK);
    this.walkTarget = thing ? [...thing] : ground;
    this.tapRing.position.x = this.walkTarget[0];
    this.tapRing.position.z = this.walkTarget[1];
    this.walkStuckMs = 0;
    this.pendingUse = !!thing;
  }

  private pendingUse = false;

  private arrived(): void {
    const goal = this.walkGoal;
    const use = this.pendingUse;
    this.walkTarget = null;
    this.walkGoal = { kind: 'point' };
    this.pendingUse = false;
    this.walkStuckMs = 0;
    if (goal.kind === 'npc') {
      if (dist(this.npcPosition(goal.id) ?? [Infinity, Infinity], this.pos) <= TALK_RANGE) this.talk(goal.id);
    } else if (use) this.interact();
  }

  private onMoved(before: Vec2): void {
    const actor = this.sim.state.actors[this.playerId]!;
    // Leaving through an exit moves the player to another section.
    for (const e of this.layout.exits) {
      if (dist(this.pos, e.at) <= e.radius) {
        const ok = this.travelTo(e.to.locationId);
        if (ok) {
          this.cue('door');
          this.enterScene(e.to.scene, e.to.at);
        } else {
          this.pos = before;
          this.walkTarget = null;
        }
        return;
      }
    }
    // Crossing into another zone is travel between locations.
    const zone = zoneAt(this.layout, this.pos);
    if (zone && zone !== actor.locationId && !this.travelTo(zone)) this.pos = before;
  }

  private travelTo(locationId: string): boolean {
    const known = this.sim.world.hasDiscovered(this.playerId, locationId as never);
    const out = this.act({ kind: 'travel', to: locationId as never }, true);
    if (out && !known) this.hud.toast(`Discovered: ${this.sim.state.locations[locationId]?.name ?? locationId}`);
    return !!out;
  }

  private interactTarget(): Target | undefined {
    const npc = nearest(this.npcs, this.pos, (n) => n.at, TALK_RANGE);
    if (npc) return { kind: 'npc', npc: npc.item };
    const stall = nearest(Object.entries(this.layout.stalls), this.pos, ([, at]) => at, READ_RANGE);
    if (stall) return { kind: 'stall', id: stall.item[0] };
    const node = nearest(Object.entries(this.layout.nodes), this.pos, ([, at]) => at, GATHER_RANGE);
    if (node) return { kind: 'node', id: node.item[0] };
    const r = nearest(this.layout.readables, this.pos, (x) => x.at, READ_RANGE);
    if (r) return { kind: 'readable', r: r.item };
    return undefined;
  }

  private interact(): void {
    const t = this.interactTarget();
    if (t?.kind === 'npc') this.talk(t.npc.id);
    else if (t?.kind === 'node') this.act({ kind: 'gather', nodeId: t.id as never, amount: 1 });
    else if (t?.kind === 'readable') this.showReadable(t.r);
    else if (t?.kind === 'stall') this.showStall(t.id);
  }

  private updatePrompt(): void {
    const t = this.interactTarget();
    const key = this.hud.root.classList.contains('touch') ? 'Interact' : 'E';
    if (!t || this.hud.openPanel) return this.hud.prompt(null);
    if (t.kind === 'npc') {
      const a = this.sim.state.actors[t.npc.id];
      const doing = activityLabel(t.npc.activity);
      return this.hud.prompt(`${key} — Talk to ${a?.name}${doing ? ` (${doing})` : ''}`);
    }
    if (t.kind === 'readable') return this.hud.prompt(`${key} — Read: ${t.r.title}`);
    if (t.kind === 'stall') return this.hud.prompt(`${key} — ${this.sim.state.properties[t.id]?.name ?? 'Stall'}`);
    const node = this.sim.state.resourceNodes[t.id];
    const res = node && this.sim.state.resources[node.resourceId];
    this.hud.prompt(node && res ? `${key} — Gather ${res.name} (${Math.floor(node.amount)} left)` : null);
  }

  private showReadable(r: ReadableSpec): void {
    this.cue('page');
    this.hud.read(r.title, readableText(this.sim, this.playerId, r));
  }

  /** A market stall: its owner sets what is for sale and at what price; anyone else just looks. */
  private showStall(propertyId: string): void {
    const s = this.sim.state;
    const p = s.properties[propertyId];
    if (!p) return;
    const owner = this.sim.ownership.ownerOf({ kind: 'property', id: p.id });
    const mine = owner?.kind === 'actor' && owner.id === this.playerId;
    if (!mine) {
      const who = !owner ? 'nobody yet' : owner.kind === 'actor' ? s.actors[owner.id]?.name : s.organizations[owner.id]?.name;
      this.hud.read(p.name, [`Held by ${who}.`, p.forSale ? `For sale at ${this.money(p.value)} — apply to the Reeve at the Keep gatehouse.` : 'A tidy board, a striped awning, an empty crate.']);
      return;
    }
    const def = this.sim.modes.definition(this.sim.modes.current(this.playerId))!;
    const allowed = def.intents.includes('set-stall-listing');
    const gate = allowed ? undefined : `not in ${def.name} mode — switch to Live (1)`;
    const stall = this.sim.stall.get(p.id);
    const list = (itemId: string, price: number | null) => () => {
      this.act({ kind: 'set-stall-listing', propertyId: p.id, itemId: itemId as never, price });
      this.showStall(propertyId);
    };
    const listed: Choice[] = Object.entries(stall?.listings ?? {}).map(([itemId, l]) => ({
      label: `${s.items[itemId]?.name ?? itemId} at ${this.money(l.price)} (${this.sim.inventory.count(this.self, itemId as never)} left)`,
      detail: gate ?? `about ${Math.round(this.sim.stall.saleChance(itemId, l.price) * 100)}% chance an hour to sell — take down`,
      disabled: !allowed,
      onChoose: list(itemId, null),
    }));
    const goods: Choice[] = [];
    const stacks = s.inventories[`actor:${this.playerId}`]?.stacks ?? {};
    for (const [itemId, q] of Object.entries(stacks)) {
      if (q <= 0 || stall?.listings[itemId]) continue;
      const ref = this.sim.stall.referencePrice(itemId);
      const dear = Math.max(ref + 1, Math.ceil(ref * 1.5));
      const name = s.items[itemId]?.name ?? itemId;
      goods.push({ label: `${name} at ${this.money(ref)} — fair`, detail: gate ?? `you carry ${q}; sells briskly`, disabled: !allowed, onChoose: list(itemId, ref) });
      goods.push({ label: `${name} at ${this.money(dear)} — dear`, detail: gate ?? 'more coin, slower to sell', disabled: !allowed, onChoose: list(itemId, dear) });
    }
    const st = this.sim.ctx.living.stall;
    this.hud.list('stall', p.name, `Yours. Customers come ${st.openHour}:00–${st.closeHour}:00, even while you are away.`, [
      { heading: 'On your stall', rows: listed.length ? listed : ['Nothing laid out yet.'] },
      { heading: 'Lay out goods you carry', rows: goods.length ? goods : ['You carry nothing to sell. Gather wheat at Brindle Farm, or bring goods from your travels.'] },
      { heading: 'Takings', rows: [`${stall?.sales ?? 0} sold · ${this.money(stall?.earnings ?? 0)} earned`] },
    ]);
  }

  private onKey(key: string): void {
    if (key === 'Escape') return this.hud.close();
    if (key === 'e') return this.interact();
    if (key === 'm') return this.toggleSound();
    if (key === 'g') return this.toggleQuality();
    if (key === '=' || key === '+') return this.zoomBy(1 / 1.1);
    if (key === '-') return this.zoomBy(1.1);
    if (key === 'f') {
      this.act({ kind: 'search' });
      return;
    }
    if (key === 'i') return this.hud.openPanel === 'inventory' ? this.hud.close() : this.showInventory();
    if (key === 'j') return this.hud.openPanel === 'journal' ? this.hud.close() : this.showJournal();
    if (key === 'c') return this.hud.openPanel === 'companions' ? this.hud.close() : this.showCompanions();
    if (key === 'k') {
      const msg = this.onSave?.();
      if (msg) this.hud.toast(msg);
      return;
    }
    if (key === 'l') return this.onLoad?.();
    if (key === 'n') return this.onNewGame?.();
    const n = Number(key);
    if (n >= 1 && n <= 9) {
      const mode = this.implementedModes()[n - 1];
      if (mode) this.enterMode(mode);
    }
  }

  /** Implemented modes, Live first (it is the default), then in a stable order. */
  private implementedModes(): ModeKey[] {
    const order: ModeKey[] = ['LIVE', 'COMPANION', 'EXPLORE', 'INVEST', 'SOCIAL', 'SEARCH'];
    const implemented = this.sim.modes.definitions().filter((d) => d.status === 'implemented').map((d) => d.key);
    return [...order.filter((k) => implemented.includes(k)), ...implemented.filter((k) => !order.includes(k))];
  }

  private enterMode(mode: ModeKey): void {
    const r = this.sim.modes.enter(this.playerId, mode);
    if (!r.ok) this.hud.toast(r.error.message, true);
    else this.hud.toast(`${r.value.name}: ${r.value.summary}`);
    this.refreshModes();
    if (this.dialogueWith && this.hud.openPanel === 'dialogue') this.renderDialogue();
  }

  private refreshModes(): void {
    const current = this.sim.modes.current(this.playerId);
    this.hud.setModes(
      this.implementedModes().map((key, i) => ({
        key,
        label: `${i + 1} ${this.sim.modes.definition(key)!.name}`,
        active: key === current,
        onChoose: () => this.enterMode(key),
      })),
    );
  }

  private talk(npcId: ActorId): void {
    const out = this.act({ kind: 'talk', with: npcId }, true);
    if (!out) return;
    this.dialogueWith = npcId;
    this.dialogueLine = 0;
    this.renderDialogue();
  }

  private renderDialogue(): void {
    const npcId = this.dialogueWith;
    if (!npcId) return;
    const npc = this.sim.state.actors[npcId]!;
    const greeting = this.sim.modes.greetingFor(npcId, this.playerId) ?? `${npc.name} nods.`;
    const lines = [greeting, ...(npc.profile?.lines ?? [])];
    const rel = Object.values(this.sim.state.relationships).find((r) => r.from === npcId && r.to === this.playerId);
    const def = this.sim.modes.definition(this.sim.modes.current(this.playerId))!;
    const allowed = (k: Intent['kind']) => def.intents.includes(k);
    const after = () => this.renderDialogue();
    const doIt = (intent: Intent) => () => {
      const out = this.act(intent);
      const bark = (out?.data as { bark?: string | null } | undefined)?.bark;
      if (bark) this.sayNpc(npcId, bark);
      after();
    };

    const offers: Choice[] = this.sim.modes.offersHere(this.playerId, npcId).map((c) => ({
      label: c.title,
      detail: `${c.description}${allowed('accept-contract') ? '' : ` (not in ${def.name} mode)`}`,
      disabled: !allowed('accept-contract'),
      onChoose: doIt({ kind: 'accept-contract', contractId: c.id }),
    }));

    const handOver: Choice[] = [];
    for (const c of this.sim.contracts.heldBy(this.self)) {
      if (c.status !== 'accepted') continue;
      for (const t of this.sim.contracts.tasksOf(c.id)) {
        if (t.status !== 'open') continue;
        const forThem = (t.requirement.kind === 'deliver' && t.requirement.to === npcId) || (c.issuer.kind === 'actor' && c.issuer.id === npcId);
        if (!forThem) continue;
        const ready = this.sim.contracts.check(t.id, this.playerId);
        handOver.push({
          label: t.title,
          detail: !allowed('complete-task') ? `not in ${def.name} mode` : ready.ok ? c.title : ready.error.message,
          disabled: !ready.ok || !allowed('complete-task'),
          onChoose: doIt({ kind: 'complete-task', taskId: t.id }),
        });
      }
    }

    const buy: Choice[] = [];
    const sell: Choice[] = [];
    for (const m of Object.values(this.sim.state.markets)) {
      if (m.vendor.kind !== 'actor' || m.vendor.id !== npcId) continue;
      for (const [itemId, l] of Object.entries(m.listings)) {
        const item = this.sim.state.items[itemId];
        if (!item) continue;
        if (l.buyable) {
          const price = this.sim.market.unitPrice(m, itemId as never, 'buy')!;
          const stock = this.sim.inventory.count(m.vendor, itemId as never);
          buy.push({
            label: `${item.name} — ${this.money(price)}`,
            detail: !allowed('buy') ? `not in ${def.name} mode` : stock ? `${stock} in stock` : 'sold out',
            disabled: !allowed('buy') || !stock || !this.sim.economy.canAfford(this.self, m.currencyId, price),
            onChoose: doIt({ kind: 'buy', marketId: m.id, itemId: itemId as never, quantity: 1 }),
          });
        }
        const held = this.sim.inventory.count(this.self, itemId as never);
        if (l.sellable && held) {
          const price = this.sim.market.unitPrice(m, itemId as never, 'sell')!;
          sell.push({
            label: `${item.name} — ${this.money(price)}`,
            detail: allowed('sell') ? `you have ${held}` : `not in ${def.name} mode`,
            disabled: !allowed('sell'),
            onChoose: doIt({ kind: 'sell', marketId: m.id, itemId: itemId as never, quantity: 1 }),
          });
        }
      }
    }

    const companions: Choice[] = Object.values(this.sim.state.familiars)
      .filter((f) => f.offer && this.sim.familiars.ownerOf(f.id)?.id === npcId)
      .map((f) => ({
        label: `${f.name} the ${this.sim.familiars.formIn(f, this.sim.state.realm.id)} — ${f.offer!.price ? this.money(f.offer!.price) : 'free to a good home'}`,
        detail: `${f.variant}; ${f.temperament}${allowed('acquire-familiar') ? '' : ` (not in ${def.name} mode)`}`,
        disabled: !allowed('acquire-familiar') || !this.sim.economy.canAfford(this.self, f.offer!.currencyId, f.offer!.price),
        onChoose: () => {
          const out = this.act({ kind: 'acquire-familiar', familiarId: f.id }, true);
          this.spawnFamiliars();
          if (out) {
            this.hud.toast(out.summary);
            this.petAction(f.id, 'bond', 2200);
            this.sayPet(f.id, out.summary);
          }
          after();
        },
      }));

    const deeds: Choice[] = npc.tags.includes('official')
      ? Object.values(this.sim.state.properties)
          .filter((p) => p.forSale)
          .map((p) => ({
            label: `${p.name} — ${this.money(p.value)}`,
            detail: `${this.sim.state.locations[p.locationId]?.name ?? ''}${allowed('purchase-property') ? '' : ` (not in ${def.name} mode)`}`,
            disabled: !allowed('purchase-property') || !this.sim.economy.canAfford(this.self, p.currencyId, p.value),
            onChoose: doIt({ kind: 'purchase-property', propertyId: p.id }),
          }))
      : [];

    this.hud.dialogue({
      name: npc.name,
      title: npc.profile?.title,
      relation: relationshipLabel(rel),
      activity: activityLabel(this.sim.state.npcActivity[npcId]?.activity),
      line: lines[this.dialogueLine % lines.length]!,
      onMore: lines.length > 1 ? () => { this.dialogueLine++; this.renderDialogue(); } : undefined,
      sections: [
        { heading: 'Hand over', choices: handOver },
        { heading: 'Work offered', choices: offers },
        { heading: 'Companions looking for a home', choices: companions },
        { heading: 'Buy', choices: buy },
        { heading: 'Sell', choices: sell },
        { heading: 'Deeds for sale', choices: deeds },
      ],
    });
  }

  private money(n: number): string {
    return `${n} ${this.sim.state.currencies[this.currency]?.symbol ?? ''}`.trim();
  }

  private showInventory(): void {
    const s = this.sim.state;
    const stacks = s.inventories[`actor:${this.playerId}`]?.stacks ?? {};
    const items = Object.entries(stacks).map(([id, q]) => `${s.items[id]?.name ?? id} × ${q}`);
    const owned = this.sim.ownership.assetsOf(this.self).map((a) => (a.kind === 'property' ? s.properties[a.id]?.name : a.kind === 'familiar' ? s.familiars[a.id]?.name : a.id) ?? a.id);
    this.hud.list('inventory', 'Belongings', `Purse: ${this.money(this.sim.economy.balance(this.self, this.currency))}`, [
      { heading: 'Carried', rows: items },
      { heading: 'Owned', rows: owned },
    ]);
  }

  private showCompanions(): void {
    const mine = this.sim.familiars.ownedBy(this.self);
    const def = this.sim.modes.definition(this.sim.modes.current(this.playerId))!;
    const allowed = (k: Intent['kind']) => def.intents.includes(k);
    const refresh = (intent: Intent) => () => {
      const out = this.act(intent);
      const fid = (intent as { familiarId?: string }).familiarId;
      if (out && fid) {
        if (intent.kind === 'feed-familiar') this.petAction(fid, 'eat', 2600);
        else if (intent.kind === 'bond-familiar') this.petAction(fid, 'bond', 2200);
        else if (intent.kind === 'rest-familiar') this.petAction(fid, 'rest', 4500);
        this.sayPet(fid, out.summary);
      }
      this.showCompanions();
    };
    const sections = mine.map((f) => {
      const st = this.sim.familiars.status(f.id);
      const c = f.care;
      const rows: (string | Choice)[] = [
        `${f.variant} · ${f.temperament}`,
        `Bond ${Math.round(f.bond)}/100 · Fed ${Math.round(c.satiety)} · Energy ${Math.round(c.energy)} · Mood ${Math.round(c.mood)}`,
        st.ok ? `Seems ${st.value.notes.join(', ')}.` : '',
        st.ok ? st.value.mood : '',
      ];
      const diet = this.sim.familiars.species(f)?.diet ?? [];
      const stacks = this.sim.state.inventories[`actor:${this.playerId}`]?.stacks ?? {};
      const foods = Object.entries(stacks).filter(([id, q]) => q > 0 && this.sim.state.items[id]?.tags.some((t) => diet.includes(t)));
      const gate = (k: Intent['kind']) => (allowed(k) ? undefined : `switch to Companion mode`);
      for (const [itemId, q] of foods) {
        rows.push({ label: `Feed ${this.sim.state.items[itemId]!.name} (${q})`, detail: gate('feed-familiar'), disabled: !allowed('feed-familiar'), onChoose: refresh({ kind: 'feed-familiar', familiarId: f.id, itemId: itemId as never }) });
      }
      if (!foods.length) rows.push(`No food ${f.name} will eat — Quill's Sundries sells some.`);
      rows.push({ label: 'Rest', detail: gate('rest-familiar'), disabled: !allowed('rest-familiar'), onChoose: refresh({ kind: 'rest-familiar', familiarId: f.id }) });
      rows.push({ label: 'Spend time together', detail: gate('bond-familiar'), disabled: !allowed('bond-familiar'), onChoose: refresh({ kind: 'bond-familiar', familiarId: f.id }) });
      return { heading: `${f.name} the ${this.sim.familiars.formIn(f, this.sim.state.realm.id)}`, rows };
    });
    this.hud.list('companions', 'Companions', mine.length ? 'Care for those in your keeping (C to close)' : 'No Familiars yet — Hester at Brindle Farm has a hound pup looking for a home.', sections);
  }

  private showJournal(prose?: string): void {
    const s = this.sim.state;
    if (prose === undefined && this.narrator) {
      const all = this.sim.chronicle.personal(this.playerId).entries();
      void this.narrator(all).then((text) => {
        if (this.hud.openPanel === 'journal') this.showJournal(text);
      });
    }
    const contracts = this.sim.contracts.heldBy(this.self).map((c) => {
      const tasks = this.sim.contracts.tasksOf(c.id).map((t) => `${t.status === 'done' ? '✓' : '○'} ${t.title}`).join('  ');
      return `${c.title} — ${c.status}${c.outcome && c.outcome !== c.status ? ` (${c.outcome})` : ''}${c.status === 'accepted' ? `: ${tasks}` : ''}`;
    });
    const entries = this.sim.chronicle
      .personal(this.playerId)
      .entries()
      .slice(-40)
      .reverse()
      .map((e) => `${e.summary ?? e.event}${e.location ? ` · ${s.locations[e.location]?.name ?? ''}` : ''}`);
    const scopeName = (k: string, id?: string) =>
      (k === 'location' ? s.locations[id ?? '']?.name : k === 'organization' ? s.organizations[id ?? '']?.name : undefined) ?? `${k} ${id ?? ''}`;
    const standing = this.sim.reputation.standingsOf(this.self).map((r) => `${scopeName(r.scope.kind, r.scope.id)}: ${r.value > 0 ? '+' : ''}${r.value}`);
    const people = Object.values(s.relationships)
      .filter((r) => r.to === this.playerId)
      .map((r) => `${s.actors[r.from]?.name ?? r.from} — regard ${r.regard}, trust ${r.trust}, familiarity ${r.familiarity}`);
    this.hud.list('journal', 'Journal', 'Your Chronicle in Happy Fall', [
      { heading: 'Your tale so far', rows: [prose ?? '…'] },
      { heading: 'Contracts', rows: contracts },
      { heading: 'Standing (always local, never a rank)', rows: standing },
      { heading: 'How people regard you', rows: people },
      { heading: 'Chronicle', rows: entries },
    ]);
  }

  private updateLabels(): void {
    const cam = this.stage.camera;
    const w = this.stage.renderer.domElement.clientWidth;
    const h = this.stage.renderer.domElement.clientHeight;
    const place = (el: HTMLElement, p: THREE.Vector3) => {
      const v = p.clone().project(cam);
      const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      el.style.display = visible ? 'block' : 'none';
      if (visible) {
        el.style.left = `${((v.x + 1) / 2) * w}px`;
        el.style.top = `${((1 - v.y) / 2) * h}px`;
      }
    };
    for (const n of this.npcs) place(n.label, new THREE.Vector3(n.at[0], n.activity === 'asleep' && !n.walking ? 1.4 : 2.6, n.at[1]));
    for (const p of this.pets) place(p.label, new THREE.Vector3(p.at[0], p.floats ? 2.3 : 1.5, p.at[1]));
    for (const l of this.placeLabels) place(l.el, l.at);
    const t = performance.now();
    this.texts = this.texts.filter((x) => {
      if (t > x.until) {
        x.el.remove();
        return false;
      }
      const at = x.anchor();
      if (x.rise) {
        const k = (t - x.born) / (x.until - x.born);
        at.y += k * 1.6;
        x.el.style.opacity = String(1 - k * k);
      }
      place(x.el, at);
      return true;
    });
  }

  private updateStatus(): void {
    const s = this.sim.state;
    const actor = s.actors[this.playerId]!;
    const v = this.sim.ctx.rules?.variables;
    const status = {
      title: `${s.realm.name.toUpperCase()} · ${this.layout.name}`,
      location: s.locations[actor.locationId ?? '']?.name ?? '—',
      coin: `Purse ${this.money(this.sim.economy.balance(this.self, this.currency))}`,
      mode: this.sim.modes.definition(this.sim.modes.current(this.playerId))?.name ?? '—',
      rules: v ? `${s.server.name} · War ${v.war} · PvP ${v.pvp}` : s.server.name,
      clock: clockLabel(now(this.sim)),
    };
    const key = JSON.stringify(status);
    if (key !== this.lastStatus) {
      this.lastStatus = key;
      this.hud.setStatus(status);
    }
  }
}
