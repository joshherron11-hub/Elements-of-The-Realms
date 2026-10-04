import { clamp } from '../core/math';
import { err, ok, type Result } from '../core/result';
import { sameRef, type ActorId, type FamiliarId, type ItemId, type OwnerRef, type RealmId } from '../core/refs';
import type { Provenance } from '../core/provenance';
import type { EconomyService } from '../economy/economy';
import type { InventoryService } from '../economy/inventory';
import type { OwnershipService } from '../economy/ownership';
import type { ActorService } from '../entities/actors';
import { emit, type DomainEvent, type SimContext } from '../world/context';
import type { Familiar, FamiliarSpecies } from './types';

const HOUR = 3_600_000;
/* PROVISIONAL PLACEHOLDERS — care and bond tuning values; not Canon. See docs/PROVISIONAL.md. */
/** Bond gained from spending time together, at most once per cooldown. */
export const BOND_GAIN = 6;
export const BOND_COOLDOWN_MS = 5 * 60_000;
export const FEED_SATIETY = 35;
export const REST_ENERGY = 50;
/** Bond a Familiar starts with when it comes to a new owner. */
export const NEW_OWNER_BOND = 5;
const MILESTONES = [25, 50, 75, 100];

export interface NewFamiliar {
  id: FamiliarId;
  speciesId: string;
  name: string;
  variant: string;
  temperament: string;
  owner: OwnerRef;
  locationId?: string;
  bond?: number;
  care?: Partial<Familiar['care']>;
  utilityTags?: string[];
  realmForms?: Record<string, string>;
  offerPrice?: number;
  provenance: Provenance;
}

export interface FamiliarStatus {
  id: FamiliarId;
  name: string;
  species: string;
  form: string;
  bond: number;
  care: Familiar['care'];
  /** Plain-language reading of the care numbers, for presentation. */
  notes: string[];
}

/**
 * Familiar lifecycle and the care loop: acquire, feed, rest, bond, status.
 * Care decays with simulated time. All money and ownership changes go
 * through the economy and ownership services.
 */
export class FamiliarService {
  private unsubscribe?: () => void;

  constructor(
    private readonly ctx: SimContext,
    private readonly deps: { ownership: OwnershipService; economy: EconomyService; inventory: InventoryService; actors: ActorService },
  ) {}

  get(id: FamiliarId): Familiar | undefined {
    return this.ctx.state.familiars[id];
  }

  species(f: Familiar): FamiliarSpecies | undefined {
    return this.ctx.state.familiarSpecies[f.species];
  }

  ownerOf(id: FamiliarId): OwnerRef | undefined {
    return this.deps.ownership.ownerOf({ kind: 'familiar', id });
  }

  ownedBy(owner: OwnerRef): Familiar[] {
    return this.deps.ownership
      .assetsOf(owner, 'familiar')
      .map((a) => this.ctx.state.familiars[a.id])
      .filter((f): f is Familiar => !!f);
  }

  /** How this Familiar appears in a Realm: individual form, else species default, else species name. */
  formIn(f: Familiar, realmId: RealmId | string): string {
    return f.realmForms[realmId] ?? this.species(f)?.realmForms[realmId] ?? this.species(f)?.name ?? f.species;
  }

  /** Create a Familiar (seeding, breeding, discovery). */
  create(spec: NewFamiliar): Result<Familiar> {
    const sp = this.ctx.state.familiarSpecies[spec.speciesId];
    if (!sp) return err('UNKNOWN_SPECIES', `no species ${spec.speciesId}`);
    if (this.ctx.state.familiars[spec.id]) return err('DUPLICATE_FAMILIAR', `familiar ${spec.id} exists`);
    const actor = this.deps.actors.create({ id: `actor_${spec.id}` as ActorId, kind: 'familiar', name: spec.name, locationId: spec.locationId as never, tags: [sp.role, sp.figure], provenance: spec.provenance });
    if (!actor.ok) return actor;
    const primary = this.ctx.rules?.realm.constitution.economy.primaryCurrency ?? (Object.keys(this.ctx.state.currencies)[0] as never);
    const f: Familiar = {
      id: spec.id,
      actorId: actor.value.id,
      species: sp.id,
      name: spec.name,
      variant: spec.variant,
      realmForms: { ...(spec.realmForms ?? {}) },
      temperament: spec.temperament,
      bond: clamp(spec.bond ?? NEW_OWNER_BOND, 0, 100),
      originRealmId: this.ctx.state.realm.id,
      utilityTags: [...new Set([...sp.utilityTags, ...(spec.utilityTags ?? [])])],
      care: { satiety: 70, energy: 70, mood: 60, ...spec.care },
      offer: spec.offerPrice !== undefined ? { price: spec.offerPrice, currencyId: primary } : undefined,
      provenance: spec.provenance,
      history: [],
    };
    this.ctx.state.familiars[f.id] = f;
    const reg = this.deps.ownership.register({ kind: 'familiar', id: f.id }, spec.owner, spec.provenance, 'born');
    if (!reg.ok) return reg;
    return ok(f);
  }

  /** Take on a Familiar that its owner is offering. Pays the owner if there is a price. */
  acquire(buyer: OwnerRef, id: FamiliarId): Result<Familiar> {
    const f = this.get(id);
    if (!f) return err('UNKNOWN_FAMILIAR', `no familiar ${id}`);
    const seller = this.ownerOf(id);
    if (!seller) return err('NOT_OWNED', 'this familiar has no keeper to ask');
    if (sameRef(seller, buyer)) return err('ALREADY_OWNER', `${f.name} is already yours`);
    if (!f.offer) return err('NOT_OFFERED', `${f.name} is not looking for a new home`);
    if (f.offer.price > 0 && !this.deps.economy.canAfford(buyer, f.offer.currencyId, f.offer.price)) return err('INSUFFICIENT_FUNDS', 'not enough money');
    if (f.offer.price > 0) {
      const paid = this.deps.economy.transfer(buyer, seller, f.offer.currencyId, f.offer.price, { reason: `adopt ${f.name}`, sourceSystem: 'familiars', ref: id });
      if (!paid.ok) return paid;
    }
    const moved = this.deps.ownership.transfer({ kind: 'familiar', id }, seller, buyer, f.offer.price > 0 ? 'purchase' : 'adoption');
    if (!moved.ok) return moved;
    const price = f.offer.price;
    f.offer = undefined;
    f.bond = NEW_OWNER_BOND;
    const buyerActor = buyer.kind === 'actor' ? this.ctx.state.actors[buyer.id] : undefined;
    const fa = this.ctx.state.actors[f.actorId];
    if (fa && buyerActor && this.species(f)?.followsOwner) fa.locationId = buyerActor.locationId;
    emit(this.ctx, 'familiar.acquired', { familiarId: id, price, species: f.species }, {
      sourceSystem: 'familiars',
      actor: buyer.kind === 'actor' ? buyer.id : undefined,
      location: buyerActor?.locationId,
      participants: seller.kind === 'actor' ? [seller.id] : [],
      outcome: 'acquired',
      summary: `${f.name} the ${this.formIn(f, this.ctx.state.realm.id)} came home with you`,
      chronicle: true,
    });
    return ok(f);
  }

  private caredFor(owner: OwnerRef, id: FamiliarId): Result<Familiar> {
    const f = this.get(id);
    if (!f) return err('UNKNOWN_FAMILIAR', `no familiar ${id}`);
    const o = this.ownerOf(id);
    if (!o || !sameRef(o, owner)) return err('NOT_OWNER', `${f.name} is not yours to care for`);
    if (owner.kind === 'actor') {
      const here = this.ctx.state.actors[owner.id]?.locationId;
      if (this.ctx.state.actors[f.actorId]?.locationId !== here) return err('NOT_PRESENT', `${f.name} is not with you`);
    }
    return ok(f);
  }

  feed(owner: OwnerRef, id: FamiliarId, itemId: ItemId): Result<Familiar> {
    const r = this.caredFor(owner, id);
    if (!r.ok) return r;
    const f = r.value;
    const item = this.ctx.state.items[itemId];
    const sp = this.species(f);
    if (!item || !sp) return err('UNKNOWN_ITEM', `no item ${itemId}`);
    if (!item.tags.some((t) => sp.diet.includes(t))) return err('WRONG_FOOD', `${f.name} won't eat ${item.name}`);
    if (f.care.satiety >= 95) return err('NOT_HUNGRY', `${f.name} isn't hungry`);
    const used = this.deps.inventory.remove(owner, itemId, 1, `fed ${f.name}`);
    if (!used.ok) return used;
    const wasHungry = f.care.satiety < 60;
    f.care.satiety = clamp(f.care.satiety + FEED_SATIETY, 0, 100);
    f.care.mood = clamp(f.care.mood + 5, 0, 100);
    f.care.lastFedAt = this.ctx.clock.now();
    if (wasHungry) this.changeBond(f, 2, owner, 'fed when hungry');
    this.cared(f, owner, 'fed', `Fed ${f.name} ${item.name}`);
    return ok(f);
  }

  rest(owner: OwnerRef, id: FamiliarId): Result<Familiar> {
    const r = this.caredFor(owner, id);
    if (!r.ok) return r;
    const f = r.value;
    if (f.care.energy >= 95) return err('NOT_TIRED', `${f.name} is wide awake`);
    f.care.energy = clamp(f.care.energy + REST_ENERGY, 0, 100);
    f.care.mood = clamp(f.care.mood + 3, 0, 100);
    f.care.lastRestedAt = this.ctx.clock.now();
    this.cared(f, owner, 'rested', `${f.name} curled up and rested`);
    return ok(f);
  }

  /** Spend time together. Bond grows, at most once per cooldown, and not when exhausted or starving. */
  bond(owner: OwnerRef, id: FamiliarId): Result<Familiar> {
    const r = this.caredFor(owner, id);
    if (!r.ok) return r;
    const f = r.value;
    const now = this.ctx.clock.now();
    if (f.care.energy < 20) return err('TOO_TIRED', `${f.name} is too tired to play`);
    if (f.care.satiety < 15) return err('TOO_HUNGRY', `${f.name} is too hungry to play`);
    if (f.care.lastBondedAt !== undefined && now - f.care.lastBondedAt < BOND_COOLDOWN_MS) {
      return err('RECENTLY', `${f.name} is content for now — try again a little later`);
    }
    f.care.lastBondedAt = now;
    f.care.energy = clamp(f.care.energy - 10, 0, 100);
    f.care.mood = clamp(f.care.mood + 10, 0, 100);
    this.changeBond(f, BOND_GAIN, owner, 'time together');
    this.cared(f, owner, 'bonded', `Spent time with ${f.name}`);
    return ok(f);
  }

  status(id: FamiliarId): Result<FamiliarStatus> {
    const f = this.get(id);
    if (!f) return err('UNKNOWN_FAMILIAR', `no familiar ${id}`);
    const c = f.care;
    const notes = [
      c.satiety < 25 ? 'very hungry' : c.satiety < 60 ? 'peckish' : 'well fed',
      c.energy < 25 ? 'exhausted' : c.energy < 60 ? 'a little tired' : 'lively',
      c.mood < 30 ? 'unhappy' : c.mood < 65 ? 'settled' : 'happy',
    ];
    return ok({ id: f.id, name: f.name, species: this.species(f)?.name ?? f.species, form: this.formIn(f, this.ctx.state.realm.id), bond: f.bond, care: { ...c }, notes });
  }

  /** Offer an owned Familiar to a new home at a price (0 = free adoption). */
  setOffer(owner: OwnerRef, id: FamiliarId, price: number | undefined): Result<Familiar> {
    const f = this.get(id);
    if (!f) return err('UNKNOWN_FAMILIAR', `no familiar ${id}`);
    const o = this.ownerOf(id);
    if (!o || !sameRef(o, owner)) return err('NOT_OWNER', 'only the owner can offer a Familiar');
    if (price !== undefined && !(Number.isSafeInteger(price) && price >= 0)) return err('BAD_PRICE', 'price must be a whole number ≥ 0');
    const currencyId = this.ctx.rules?.realm.constitution.economy.primaryCurrency ?? (Object.keys(this.ctx.state.currencies)[0] as never);
    f.offer = price === undefined ? undefined : { price, currencyId };
    return ok(f);
  }

  /** Care decays with time; long neglect slowly wears the bond. Deterministic. */
  tick(dtMs: number): void {
    const hours = dtMs / HOUR;
    for (const f of Object.values(this.ctx.state.familiars)) {
      const sp = this.species(f);
      if (!sp) continue;
      const c = f.care;
      c.satiety = clamp(c.satiety - sp.satietyDecayPerHour * hours, 0, 100);
      c.energy = clamp(c.energy - sp.energyDecayPerHour * hours, 0, 100);
      const target = (c.satiety + c.energy) / 2;
      c.mood = clamp(c.mood + (target - c.mood) * Math.min(1, hours), 0, 100);
      if (c.satiety === 0) f.bond = clamp(f.bond - hours, 0, 100);
    }
  }

  /** Familiars that follow their owner travel with them; Chronicle entries about a Familiar join its history. */
  attach(): void {
    this.unsubscribe ??= this.ctx.events.on<DomainEvent>('*', (e) => {
      if (e.type === 'actor.travelled') {
        const p = e.payload as { actorId: ActorId; to: string };
        for (const f of this.ownedBy({ kind: 'actor', id: p.actorId })) {
          if (!this.species(f)?.followsOwner) continue;
          const fa = this.ctx.state.actors[f.actorId];
          if (fa) fa.locationId = p.to as never;
        }
      } else if (e.type === 'chronicle.recorded') {
        const id = (e.payload as { entryId: string }).entryId;
        const entry = this.ctx.state.chronicle.find((x) => x.id === id);
        const fid = entry?.data?.familiarId;
        if (typeof fid === 'string') this.ctx.state.familiars[fid]?.history.push(entry!.id);
      }
    });
  }

  detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  private changeBond(f: Familiar, delta: number, owner: OwnerRef, reason: string): void {
    const before = f.bond;
    f.bond = clamp(f.bond + delta, 0, 100);
    const crossed = MILESTONES.find((m) => before < m && f.bond >= m);
    if (crossed !== undefined) {
      emit(this.ctx, 'familiar.bond-deepened', { familiarId: f.id, bond: f.bond, milestone: crossed, reason }, {
        sourceSystem: 'familiars',
        actor: owner.kind === 'actor' ? owner.id : undefined,
        location: owner.kind === 'actor' ? this.ctx.state.actors[owner.id]?.locationId : undefined,
        outcome: `bond-${crossed}`,
        summary: crossed >= 100 ? `${f.name} would follow you anywhere` : crossed >= 50 ? `${f.name} trusts you completely` : `${f.name} is growing fond of you`,
        chronicle: true,
      });
    }
  }

  /** Care is observed (raw evidence) but not chronicled — it is everyday life, not history. */
  private cared(f: Familiar, owner: OwnerRef, what: string, summary: string): void {
    emit(this.ctx, `familiar.${what}`, { familiarId: f.id, care: { ...f.care }, bond: f.bond }, {
      sourceSystem: 'familiars',
      actor: owner.kind === 'actor' ? owner.id : undefined,
      location: owner.kind === 'actor' ? this.ctx.state.actors[owner.id]?.locationId : undefined,
      outcome: what,
      summary,
      evidence: true,
    });
  }
}
