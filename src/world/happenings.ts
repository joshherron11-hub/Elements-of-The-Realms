import type { ActorId, ScopeRef } from '../core/refs';
import type { RelationshipService, ReputationService } from '../entities/social';
import { emit, type DomainEvent, type SimContext } from './context';

/**
 * HAPPENINGS — small authored moments in the life of a place.
 *
 * A happening fires once per player when its trigger occurs (talking to
 * someone, arriving somewhere), optionally gated by a flag. Its effects use
 * the ordinary relationship and reputation services, and it is recorded in
 * the Chronicle. Social depth without combat.
 */
export type HappeningTrigger =
  | { readonly kind: 'talk'; readonly actorId: string }
  | { readonly kind: 'arrive'; readonly locationId: string };

export interface HappeningEffects {
  relationships?: { with: string; regard?: number; trust?: number; familiarity?: number }[];
  reputation?: { scope: ScopeRef; amount: number }[];
  /** Set flag `<flag>:<actorId>` for later content gates. */
  flag?: string;
}

export interface Happening {
  readonly id: string;
  kind: string; // 'social', 'festival', 'rumor', ...
  title: string;
  /** Chronicle line when it happens. */
  summary: string;
  trigger: HappeningTrigger;
  effects: HappeningEffects;
  /** Only fires while the actor holds flag `<requiresFlag>:<actorId>`. */
  requiresFlag?: string;
  seenBy: ActorId[];
}

export class HappeningService {
  private unsubscribe?: () => void;

  constructor(
    private readonly ctx: SimContext,
    private readonly relationships: RelationshipService,
    private readonly reputation: ReputationService,
  ) {}

  attach(): void {
    this.unsubscribe ??= this.ctx.events.on<DomainEvent>('*', (e) => {
      if (e.type === 'social.talked' && e.meta.actor) {
        this.check(e.meta.actor, (t) => t.kind === 'talk' && t.actorId === (e.payload as { with: string }).with);
      } else if (e.type === 'actor.travelled') {
        const p = e.payload as { actorId: ActorId; to: string };
        this.check(p.actorId, (t) => t.kind === 'arrive' && t.locationId === p.to);
      }
    });
  }

  detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  private check(actorId: ActorId, matches: (t: HappeningTrigger) => boolean): void {
    const actor = this.ctx.state.actors[actorId];
    if (!actor || actor.kind !== 'player') return;
    for (const h of Object.values(this.ctx.state.happenings)) {
      if (h.seenBy.includes(actorId) || !matches(h.trigger)) continue;
      if (h.requiresFlag && !this.ctx.state.flags[`${h.requiresFlag}:${actorId}`]) continue;
      this.fire(h, actorId);
    }
  }

  private fire(h: Happening, actorId: ActorId): void {
    h.seenBy.push(actorId);
    const participants: ActorId[] = [];
    for (const r of h.effects.relationships ?? []) {
      const other = r.with as ActorId;
      if (!this.ctx.state.actors[other]) continue;
      participants.push(other);
      this.relationships.adjust(other, actorId, { regard: r.regard, trust: r.trust, familiarity: r.familiarity ?? 3 }, h.title, { chronicle: false });
      this.relationships.adjust(actorId, other, { familiarity: r.familiarity ?? 3 }, h.title, { chronicle: false });
    }
    for (const rep of h.effects.reputation ?? []) this.reputation.adjust({ kind: 'actor', id: actorId }, rep.scope, rep.amount, h.title);
    if (h.effects.flag) this.ctx.state.flags[`${h.effects.flag}:${actorId}`] = true;
    emit(this.ctx, 'happening.occurred', { happeningId: h.id, kind: h.kind, title: h.title }, {
      sourceSystem: 'happenings',
      actor: actorId,
      location: this.ctx.state.actors[actorId]?.locationId,
      participants,
      outcome: h.kind,
      summary: h.summary,
      chronicle: true,
    });
  }
}
