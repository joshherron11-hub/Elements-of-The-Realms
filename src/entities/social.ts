import { clamp } from '../core/math';
import { refKey, type ActorId, type OwnerRef, type ScopeRef } from '../core/refs';
import { emit, type SimContext } from '../world/context';
import { RELATIONSHIP_BOUNDS, type Relationship } from './relationship';
import { REPUTATION_BOUNDS, type Reputation } from './reputation';

export interface RelationshipDelta {
  regard?: number;
  trust?: number;
  familiarity?: number;
  tags?: string[];
}

export class RelationshipService {
  constructor(private readonly ctx: SimContext) {}

  static key(from: ActorId, to: ActorId): string {
    return `${from}->${to}`;
  }

  get(from: ActorId, to: ActorId): Relationship | undefined {
    return this.ctx.state.relationships[RelationshipService.key(from, to)];
  }

  /** Adjust (creating if needed) a directed relationship. Values are clamped. */
  adjust(from: ActorId, to: ActorId, delta: RelationshipDelta, reason: string): Relationship {
    const now = this.ctx.clock.now();
    const key = RelationshipService.key(from, to);
    const isNew = !this.ctx.state.relationships[key];
    const rel = (this.ctx.state.relationships[key] ??= {
      from,
      to,
      regard: 0,
      trust: 0,
      familiarity: 0,
      tags: [],
      since: now,
      lastInteractionAt: now,
    });
    rel.regard = clamp(rel.regard + (delta.regard ?? 0), ...RELATIONSHIP_BOUNDS.regard);
    rel.trust = clamp(rel.trust + (delta.trust ?? 0), ...RELATIONSHIP_BOUNDS.trust);
    rel.familiarity = clamp(rel.familiarity + (delta.familiarity ?? 0), ...RELATIONSHIP_BOUNDS.familiarity);
    for (const t of delta.tags ?? []) if (!rel.tags.includes(t)) rel.tags.push(t);
    rel.lastInteractionAt = now;
    const toName = this.ctx.state.actors[to]?.name ?? to;
    emit(this.ctx, isNew ? 'relationship.formed' : 'relationship.changed', { from, to, delta: { ...delta }, reason }, {
      sourceSystem: 'relationships',
      actor: from,
      participants: [to],
      outcome: isNew ? 'formed' : 'changed',
      summary: isNew ? `Came to know ${toName}` : undefined,
      domain: 'PLAY',
      chronicle: isNew,
    });
    return rel;
  }
}

/**
 * Scoped reputation. There is no unscoped/global reputation by design: a
 * scope of kind 'global' is rejected.
 */
export class ReputationService {
  constructor(private readonly ctx: SimContext) {}

  static key(subject: OwnerRef, scope: ScopeRef): string {
    return `${refKey(subject)}@${refKey(scope)}`;
  }

  get(subject: OwnerRef, scope: ScopeRef): number {
    return this.ctx.state.reputations[ReputationService.key(subject, scope)]?.value ?? 0;
  }

  adjust(subject: OwnerRef, scope: ScopeRef, delta: number, reason: string): Reputation {
    if (scope.kind === 'global') throw new Error('Reputation must be scoped; global reputation is not allowed');
    const key = ReputationService.key(subject, scope);
    const now = this.ctx.clock.now();
    const rep = (this.ctx.state.reputations[key] ??= { subject, scope, value: 0, updatedAt: now });
    const before = rep.value;
    rep.value = clamp(rep.value + delta, ...REPUTATION_BOUNDS);
    rep.updatedAt = now;
    emit(this.ctx, 'reputation.changed', { subject, scope, before, after: rep.value, reason }, {
      sourceSystem: 'reputation',
      actor: subject.kind === 'actor' ? subject.id : undefined,
      outcome: rep.value >= before ? 'rose' : 'fell',
    });
    return rep;
  }

  /** All reputations held by a subject — always a list of scoped values, never a total. */
  standingsOf(subject: OwnerRef): Reputation[] {
    const prefix = `${refKey(subject)}@`;
    return Object.entries(this.ctx.state.reputations)
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => v);
  }
}
