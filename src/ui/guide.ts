import type { ActorId } from '../core/refs';
import type { Simulation } from '../simulation';

/**
 * A gentle "what next?" hint for new players, derived purely from world
 * state (presentation only — it never changes anything). It walks the first
 * loop: talk → take work → market → companion → care → finish → invest/own →
 * journal → save.
 */
export interface GuideStep {
  key: string;
  text: string;
}

export function nextStep(sim: Simulation, playerId: ActorId, opts: { saved: boolean }): GuideStep | undefined {
  const s = sim.state;
  const me = { kind: 'actor' as const, id: playerId };
  const events = new Set(sim.chronicle.personal(playerId).entries().map((e) => e.event));
  const held = sim.contracts.heldBy(me);
  const talked = Object.values(s.relationships).some((r) => r.from === playerId);
  const companions = sim.familiars.ownedBy(me);
  const cared = companions.some((f) => f.care.lastFedAt !== undefined || f.care.lastBondedAt !== undefined || f.care.lastRestedAt !== undefined);
  const visitedMarket = s.discoveries[playerId]?.includes('location_blackmere-market');
  const finished = held.some((c) => c.status === 'completed' && c.kind !== 'investment');
  const investedOrOwns = events.has('investment.made') || sim.ownership.assetsOf(me, 'property').length > 0;

  if (!talked) return { key: 'talk', text: 'Walk up to someone and press E to talk — Pip the courier is right here in the square.' };
  if (!held.length) return { key: 'contract', text: 'Ask around for work: accept a job from Pip, Tobias or Hester.' };
  if (!visitedMarket) return { key: 'market', text: 'Visit Blackmere Market (east of the square) — Quill’s Sundries sells Familiar food.' };
  if (!companions.length) return { key: 'companion', text: 'Bramble the hound pup needs a home — find Hester at Brindle Farm, out along the East Road.' };
  if (!cared) return { key: 'care', text: 'Press C to care for your companion: feed, rest, spend time together (Companion mode is key 2).' };
  if (!finished) return { key: 'finish', text: 'Finish your job: search with F where the item was lost, then hand it over (E).' };
  if (!investedOrOwns) return { key: 'invest', text: 'Put your coin to work: a share in Hester’s cider press, or a deed from the Reeve at the Keep gatehouse.' };
  if (!opts.saved) return { key: 'save', text: 'Read your story in the journal (J), then press K to save. Reopen the page any time to continue.' };
  return undefined;
}
