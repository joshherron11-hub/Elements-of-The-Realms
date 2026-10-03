import * as THREE from 'three';
import type { ActorId, CurrencyId, OwnerRef } from '../core/refs';
import type { Intent, IntentOutcome, ModeKey } from '../modes/types';
import { buildSection, type BuiltSection } from '../render/builder';
import { createFigure, styleFor } from '../render/figures';
import type { SceneLayout, Vec2 } from '../render/layout';
import { Materials } from '../render/materials';
import { createStage, type Palette, type Stage } from '../render/stage';
import type { Simulation } from '../simulation';
import { Hud, type Choice } from './hud';
import { Input } from './input';
import { dist, moveWithCollision, nearest, zoneAt } from './navigation';

const WALK = 5.5; // m/s
const RUN = 9;
const TALK_RANGE = 3.2; // reaches across a counter
const GATHER_RANGE = 2.4;

interface NpcView {
  id: ActorId;
  figure: THREE.Group;
  at: Vec2;
  label: HTMLElement;
}

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
  private placeLabels: { el: HTMLElement; at: THREE.Vector3 }[] = [];
  private dialogueWith: ActorId | null = null;
  private dialogueLine = 0;
  private lastStatus = '';
  private readonly self: OwnerRef;
  private readonly currency: CurrencyId;

  constructor(
    private readonly sim: Simulation,
    private readonly playerId: ActorId,
    private readonly layouts: Map<string, SceneLayout>,
    container: HTMLElement,
    palette: Palette,
  ) {
    this.stage = createStage(container, palette);
    this.materials = new Materials(palette);
    this.hud = new Hud(document.body);
    this.self = { kind: 'actor', id: playerId };
    this.currency = (sim.ctx.rules?.realm.constitution.economy.primaryCurrency ?? Object.keys(sim.state.currencies)[0]) as CurrencyId;
    this.player = createFigure(this.materials, styleFor(this.materials, [], true));
  }

  start(): void {
    const actor = this.sim.state.actors[this.playerId]!;
    const scene = this.sceneFor(actor.locationId) ?? [...this.layouts.keys()][0]!;
    const layout = this.layouts.get(scene)!;
    this.enterScene(scene, layout.spawns[actor.locationId ?? ''] ?? layout.playerStart);
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

  /** Teleport within the current section (debug / e2e only; no simulation effect until a zone is crossed). */
  debugPlace(at: Vec2): void {
    this.pos = [...at];
  }

  /** Perform an intent, show its outcome, and return it. */
  act(intent: Intent, quiet = false): IntentOutcome | undefined {
    const r = this.sim.modes.perform(this.playerId, intent);
    if (!r.ok) {
      this.hud.toast(r.error.message, true);
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
    this.section = buildSection(layout, this.materials);
    this.section.group.add(this.player);
    this.pos = [...at];
    this.stage.setContent(this.section.group, { interior: layout.interior });
    this.stage.camera.position.set(at[0], 30, at[1] + 30);
    this.hud.labels.innerHTML = '';
    this.placeLabels = this.section.labels.map((l) => ({ el: this.label(l.text, l.kind), at: l.position }));
    this.spawnNpcs();
    this.hud.close();
    this.dialogueWith = null;
  }

  private label(text: string, kind: string): HTMLElement {
    const el = document.createElement('div');
    el.className = `label ${kind}`;
    el.textContent = text;
    this.hud.labels.appendChild(el);
    return el;
  }

  private spawnNpcs(): void {
    this.npcs = [];
    for (const a of Object.values(this.sim.state.actors)) {
      if (a.kind !== 'npc' || this.sceneFor(a.locationId) !== this.layout.id) continue;
      const at = this.layout.npcs[a.id] ?? this.layout.spawns[a.locationId ?? ''];
      if (!at) continue;
      const figure = createFigure(this.materials, styleFor(this.materials, a.tags));
      figure.position.set(at[0], 0, at[1]);
      this.section.group.add(figure);
      this.npcs.push({ id: a.id, figure, at, label: this.label(a.name, 'npc') });
    }
  }

  private frame(dt: number): void {
    this.sim.tick(dt);
    for (const key of this.input.takePresses()) this.onKey(key);

    const [ax, az] = this.input.axis();
    if (ax || az) {
      const speed = (this.input.running() ? RUN : WALK) * (dt / 1000);
      const before = this.pos;
      this.pos = moveWithCollision(this.layout, this.pos, [ax * speed, az * speed]);
      this.player.rotation.y = Math.atan2(ax, az);
      this.onMoved(before);
    }
    this.player.position.set(this.pos[0], Math.abs(Math.sin(performance.now() / 120)) * (ax || az ? 0.12 : 0), this.pos[1]);

    for (const n of this.npcs) {
      n.figure.position.y = Math.sin(performance.now() / 500 + n.at[0]) * 0.04;
      if (dist(n.at, this.pos) < 6) n.figure.rotation.y = Math.atan2(this.pos[0] - n.at[0], this.pos[1] - n.at[1]);
    }
    if (this.dialogueWith && this.hud.openPanel === 'dialogue') {
      const n = this.npcs.find((x) => x.id === this.dialogueWith);
      if (!n || dist(n.at, this.pos) > TALK_RANGE + 2.5) this.hud.close();
    }

    this.updatePrompt();
    this.stage.follow(this.player.position, dt);
    this.updateLabels();
    this.updateStatus();
  }

  private onMoved(before: Vec2): void {
    const actor = this.sim.state.actors[this.playerId]!;
    // Leaving through an exit moves the player to another section.
    for (const e of this.layout.exits) {
      if (dist(this.pos, e.at) <= e.radius) {
        const ok = this.travelTo(e.to.locationId);
        if (ok) this.enterScene(e.to.scene, e.to.at);
        else this.pos = before;
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

  private interactTarget(): { kind: 'npc'; npc: NpcView } | { kind: 'node'; id: string } | undefined {
    const npc = nearest(this.npcs, this.pos, (n) => n.at, TALK_RANGE);
    if (npc) return { kind: 'npc', npc: npc.item };
    const node = nearest(Object.entries(this.layout.nodes), this.pos, ([, at]) => at, GATHER_RANGE);
    if (node) return { kind: 'node', id: node.item[0] };
    return undefined;
  }

  private updatePrompt(): void {
    const t = this.interactTarget();
    if (!t || this.hud.openPanel === 'dialogue') return this.hud.prompt(null);
    if (t.kind === 'npc') return this.hud.prompt(`E — Talk to ${this.sim.state.actors[t.npc.id]?.name}`);
    const node = this.sim.state.resourceNodes[t.id];
    const res = node && this.sim.state.resources[node.resourceId];
    this.hud.prompt(node && res ? `E — Gather ${res.name} (${Math.floor(node.amount)} left)` : null);
  }

  private onKey(key: string): void {
    if (key === 'Escape') return this.hud.close();
    if (key === 'e') {
      const t = this.interactTarget();
      if (t?.kind === 'npc') this.talk(t.npc.id);
      else if (t?.kind === 'node') this.act({ kind: 'gather', nodeId: t.id as never, amount: 1 });
      return;
    }
    if (key === 'f') {
      this.act({ kind: 'search' });
      return;
    }
    if (key === 'i') return this.hud.openPanel === 'inventory' ? this.hud.close() : this.showInventory();
    if (key === 'j') return this.hud.openPanel === 'journal' ? this.hud.close() : this.showJournal();
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
    const lines = [npc.profile?.greeting ?? `${npc.name} nods.`, ...(npc.profile?.lines ?? [])];
    const def = this.sim.modes.definition(this.sim.modes.current(this.playerId))!;
    const allowed = (k: Intent['kind']) => def.intents.includes(k);
    const after = () => this.renderDialogue();
    const doIt = (intent: Intent) => () => {
      this.act(intent);
      after();
    };

    const offers: Choice[] = this.sim.modes.offersHere(this.playerId, npcId).map((c) => ({
      label: c.title,
      detail: `${c.description}${allowed('accept-contract') ? '' : ` (not in ${def.name} mode)`}`,
      disabled: !allowed('accept-contract'),
      onChoose: doIt({ kind: 'accept-contract', contractId: c.id }),
    }));

    const handOver: Choice[] = this.sim.modes
      .available(this.playerId)
      .filter((i): i is Extract<Intent, { kind: 'complete-task' }> => i.kind === 'complete-task')
      .filter((i) => {
        const req = this.sim.state.tasks[i.taskId]?.requirement;
        const issuer = this.sim.state.contracts[this.sim.state.tasks[i.taskId]?.contractId ?? '']?.issuer;
        return (req?.kind === 'deliver' && req.to === npcId) || (issuer?.kind === 'actor' && issuer.id === npcId);
      })
      .map((i) => ({ label: this.sim.state.tasks[i.taskId]!.title, onChoose: doIt(i) }));

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

    this.hud.dialogue({
      name: npc.name,
      title: npc.profile?.title,
      line: lines[this.dialogueLine % lines.length]!,
      onMore: lines.length > 1 ? () => { this.dialogueLine++; this.renderDialogue(); } : undefined,
      sections: [
        { heading: 'Hand over', choices: handOver },
        { heading: 'Work offered', choices: offers },
        { heading: 'Buy', choices: buy },
        { heading: 'Sell', choices: sell },
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

  private showJournal(): void {
    const s = this.sim.state;
    const contracts = this.sim.contracts.heldBy(this.self).map((c) => {
      const tasks = this.sim.contracts.tasksOf(c.id).map((t) => `${t.status === 'done' ? '✓' : '○'} ${t.title}`).join('  ');
      return `${c.title} — ${c.status}${c.outcome ? ` (${c.outcome})` : ''}${c.status === 'accepted' ? `: ${tasks}` : ''}`;
    });
    const entries = this.sim.chronicle
      .personal(this.playerId)
      .entries()
      .slice(-40)
      .reverse()
      .map((e) => `${e.summary ?? e.event}${e.location ? ` · ${s.locations[e.location]?.name ?? ''}` : ''}`);
    this.hud.list('journal', 'Journal', 'Your Chronicle in Happy Fall', [
      { heading: 'Contracts', rows: contracts },
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
    for (const n of this.npcs) place(n.label, new THREE.Vector3(n.at[0], 2.6, n.at[1]));
    for (const l of this.placeLabels) place(l.el, l.at);
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
    };
    const key = JSON.stringify(status);
    if (key !== this.lastStatus) {
      this.lastStatus = key;
      this.hud.setStatus(status);
    }
  }
}
