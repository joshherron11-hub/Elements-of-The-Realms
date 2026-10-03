import { err, ok, type Result } from '../core/result';
import { refKey, sameRef, type AssetRef, type OwnerRef } from '../core/refs';
import type { Provenance } from '../core/provenance';
import { emit, type SimContext } from '../world/context';
import type { OwnershipRecord } from './types';

/**
 * The single ownership registry for every distinct asset: property,
 * familiars, unique items, investments, artifacts. No asset type keeps its
 * own owner field, so transfer rules and history are written once.
 */
export class OwnershipService {
  constructor(private readonly ctx: SimContext) {}

  get(asset: AssetRef): OwnershipRecord | undefined {
    return this.ctx.state.ownership[refKey(asset)];
  }

  ownerOf(asset: AssetRef): OwnerRef | undefined {
    return this.get(asset)?.owner;
  }

  isOwner(asset: AssetRef, who: OwnerRef): boolean {
    const owner = this.ownerOf(asset);
    return owner !== undefined && sameRef(owner, who);
  }

  assetsOf(owner: OwnerRef, kind?: AssetRef['kind']): AssetRef[] {
    return Object.values(this.ctx.state.ownership)
      .filter((r) => sameRef(r.owner, owner) && (!kind || r.asset.kind === kind))
      .map((r) => r.asset);
  }

  /** Register a new, previously unowned asset. */
  register(asset: AssetRef, owner: OwnerRef, prov: Provenance, reason = 'created'): Result<OwnershipRecord> {
    const key = refKey(asset);
    if (this.ctx.state.ownership[key]) return err('ALREADY_OWNED', `${key} already has an owner`);
    const at = this.ctx.clock.now();
    const record: OwnershipRecord = { asset, owner, since: at, provenance: prov, history: [{ at, to: owner, reason }] };
    this.ctx.state.ownership[key] = record;
    emit(this.ctx, 'ownership.registered', { asset, owner, reason }, {
      sourceSystem: 'ownership',
      actor: owner.kind === 'actor' ? owner.id : undefined,
    });
    return ok(record);
  }

  /** Move an asset from its current owner to another. `from` must match the current owner. */
  transfer(asset: AssetRef, from: OwnerRef, to: OwnerRef, reason: string): Result<OwnershipRecord> {
    const record = this.get(asset);
    if (!record) return err('NOT_OWNED', `${refKey(asset)} has no owner`);
    if (!sameRef(record.owner, from)) return err('NOT_OWNER', `${refKey(from)} does not own ${refKey(asset)}`);
    if (sameRef(from, to)) return err('SAME_OWNER', 'cannot transfer an asset to its current owner');
    const at = this.ctx.clock.now();
    record.owner = to;
    record.since = at;
    record.history.push({ at, from, to, reason });
    emit(this.ctx, 'ownership.transferred', { asset, from, to, reason }, {
      sourceSystem: 'ownership',
      actor: to.kind === 'actor' ? to.id : undefined,
      participants: from.kind === 'actor' ? [from.id] : [],
      outcome: 'transferred',
      summary: `Ownership of ${asset.kind} changed (${reason})`,
      chronicle: true,
    });
    return ok(record);
  }
}
