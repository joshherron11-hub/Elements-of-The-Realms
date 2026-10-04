import type { ActorId, ItemId, OwnerRef } from '../core/refs';
import type { Relationship } from '../entities/relationship';
import type { ReadableSpec } from '../render/layout';
import type { Simulation } from '../simulation';
import { gameTime, type GameTime } from '../world/living';

/**
 * Pure presentation helpers: turn world state into words for the player.
 * They read only; nothing here changes the simulation.
 */

export interface RelationshipLabel {
  label: string;
  tone: 'cold' | 'neutral' | 'warm';
}

/** How someone feels about you, in words. Local to that person — never a rank. */
export function relationshipLabel(rel: Relationship | undefined): RelationshipLabel {
  if (!rel) return { label: 'Stranger', tone: 'neutral' };
  if (rel.regard <= -30) return { label: 'Hostile', tone: 'cold' };
  if (rel.regard < 0) return { label: 'Wary', tone: 'cold' };
  if (rel.regard >= 50 && rel.trust >= 40) return { label: 'Close friend', tone: 'warm' };
  if (rel.regard >= 25 && rel.trust >= 20) return { label: 'Trusted', tone: 'warm' };
  if (rel.regard >= 10) return { label: 'Friendly', tone: 'warm' };
  return { label: rel.familiarity >= 10 ? 'Familiar face' : 'Acquaintance', tone: 'neutral' };
}

export function activityLabel(activity: string | undefined): string | undefined {
  return activity?.replace(/-/g, ' ');
}

export function clockLabel(t: GameTime): string {
  const part = t.hour < 5 ? 'Night' : t.hour < 8 ? 'Dawn' : t.hour < 12 ? 'Morning' : t.hour < 17 ? 'Afternoon' : t.hour < 21 ? 'Evening' : 'Night';
  return `Day ${t.day + 1} · ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')} · ${part}`;
}

export function now(sim: Simulation): GameTime {
  return gameTime(sim.state, sim.ctx.clock.now(), sim.ctx.living.calendar);
}

export function priceTrend(index: number): '↑' | '↓' | '' {
  return index > 1.04 ? '↑' : index < 0.96 ? '↓' : '';
}

/** Compose a readable's text. Static text is returned as-is; dynamic ones read the world. */
export function readableText(sim: Simulation, playerId: ActorId, r: ReadableSpec): string[] {
  const s = sim.state;
  if (!r.dynamic) return [r.text ?? ''];
  switch (r.dynamic) {
    case 'notice-board': {
      const offers = Object.values(s.contracts)
        .filter((c) => c.status === 'offered')
        .map((c) => {
          const who = c.issuer.kind === 'actor' ? s.actors[c.issuer.id]?.name : s.organizations[c.issuer.id]?.name;
          return `WANTED — ${c.title}${who ? ` (ask ${who})` : ''}`;
        });
      const forSale = Object.values(s.properties)
        .filter((p) => p.forSale)
        .map((p) => `FOR SALE — ${p.name}, ${p.value} ${s.currencies[p.currencyId]?.symbol ?? ''}. Apply to the Reeve.`);
      const news = sim.chronicle
        .realm()
        .entries({ order: 'newest-first', limit: 3 })
        .map((e) => `NEWS — ${e.summary ?? e.event}`);
      const lines = [...offers, ...forSale, ...news];
      return lines.length ? lines : ['The board is bare but for a recipe for apple cake, pinned slightly crooked.'];
    }
    case 'tavern-news': {
      const rumours = sim.chronicle
        .realm()
        .entries({ order: 'newest-first', limit: 4 })
        .map((e) => `“${e.summary ?? e.event}” — or so they say.`);
      return rumours.length ? rumours : ['“Quiet week. Too quiet, if you ask Pip. Nobody asks Pip.”'];
    }
    case 'market-prices': {
      const m = s.markets['market_quills-sundries'];
      if (!m) return ['(no prices posted)'];
      const open = sim.market.isOpen(m.id);
      const rows = Object.entries(m.listings)
        .filter(([, l]) => l.buyable)
        .map(([itemId]) => {
          const p = sim.market.unitPrice(m, itemId as ItemId, 'buy')!;
          const stock = sim.inventory.count(m.vendor, itemId as ItemId);
          return `${s.items[itemId]?.name ?? itemId}: ${p} ${priceTrend(m.priceIndex)}${stock ? '' : ' (sold out)'}`;
        });
      const buying = Object.entries(m.listings)
        .filter(([, l]) => l.sellable)
        .map(([itemId]) => `${s.items[itemId]?.name ?? itemId}: ${sim.market.unitPrice(m, itemId as ItemId, 'sell')}`);
      return [open ? 'OPEN' : 'CLOSED — opens at dawn', ...rows, buying.length ? `Quill buys: ${buying.join(', ')}` : ''].filter(Boolean);
    }
    case 'deed': {
      const p = r.propertyId ? s.properties[r.propertyId] : undefined;
      if (!p) return ['The writing has faded.'];
      const owner = sim.ownership.ownerOf({ kind: 'property', id: p.id });
      const mine = owner?.kind === 'actor' && owner.id === playerId;
      const ownerName = !owner ? 'nobody' : owner.kind === 'actor' ? s.actors[owner.id]?.name : s.organizations[owner.id]?.name;
      if (mine) return [`${p.name} — yours. Recorded by the Reeve of Blackmere.`, 'Rest here with your Familiar for a deeper sleep.'];
      return [`${p.name} — held by ${ownerName}.`, p.forSale ? `For sale at ${p.value}. Apply to the Reeve at the Keep gatehouse.` : 'Not for sale.'];
    }
  }
}

export interface Objective {
  contract: string;
  task: string;
  ready: boolean;
  hint: string;
}

/** Open tasks of the player's accepted contracts, with whether each can be done now. */
export function objectives(sim: Simulation, playerId: ActorId): Objective[] {
  const me: OwnerRef = { kind: 'actor', id: playerId };
  const out: Objective[] = [];
  for (const c of sim.contracts.heldBy(me)) {
    if (c.status !== 'accepted') continue;
    for (const t of sim.contracts.tasksOf(c.id)) {
      if (t.status !== 'open') continue;
      const ready = sim.contracts.check(t.id, playerId);
      out.push({ contract: c.title, task: t.title, ready: ready.ok, hint: ready.ok ? 'ready to hand in' : ready.error.message });
    }
  }
  return out;
}
