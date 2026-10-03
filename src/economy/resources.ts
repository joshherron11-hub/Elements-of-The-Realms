import { isPositiveInt } from '../core/math';
import { err, ok, type Result } from '../core/result';
import type { OwnerRef, ResourceNodeId } from '../core/refs';
import { emit, type SimContext } from '../world/context';
import type { InventoryService } from './inventory';

const HOUR_MS = 60 * 60 * 1000;

/** World resource nodes: gathered into items, regenerate over simulated time. */
export class ResourceService {
  constructor(
    private readonly ctx: SimContext,
    private readonly inventory: InventoryService,
  ) {}

  gather(who: OwnerRef, nodeId: ResourceNodeId, amount: number): Result<number> {
    const node = this.ctx.state.resourceNodes[nodeId];
    if (!node) return err('UNKNOWN_NODE', `no resource node ${nodeId}`);
    if (!isPositiveInt(amount)) return err('BAD_QUANTITY', 'amount must be a positive integer');
    const def = this.ctx.state.resources[node.resourceId];
    if (!def) return err('UNKNOWN_RESOURCE', `no resource ${node.resourceId}`);
    const taken = Math.min(amount, Math.floor(node.amount));
    if (taken <= 0) return err('DEPLETED', 'nothing left to gather');
    const added = this.inventory.add(who, def.yieldsItemId, taken, `gathered ${def.name}`);
    if (!added.ok) return added;
    node.amount -= taken;
    emit(this.ctx, 'resource.gathered', { nodeId, resourceId: def.id, amount: taken }, {
      sourceSystem: 'resources',
      actor: who.kind === 'actor' ? who.id : undefined,
      location: node.locationId,
    });
    return ok(taken);
  }

  /** Regenerate all nodes for `dtMs` of simulated time. Deterministic. */
  tick(dtMs: number): void {
    for (const node of Object.values(this.ctx.state.resourceNodes)) {
      if (node.amount < node.capacity) {
        node.amount = Math.min(node.capacity, node.amount + (node.regenPerHour * dtMs) / HOUR_MS);
      }
    }
  }
}
