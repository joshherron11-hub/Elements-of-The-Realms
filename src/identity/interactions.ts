import type { ActorId, LocationId } from '../core/refs';
import { provenance } from '../core/provenance';
import type { SimContext } from '../world/context';
import type { Evidence, Interaction, VerificationStatus } from './types';

export interface InteractionSpec {
  actor: ActorId;
  actionType: string;
  target?: { kind: string; id: string };
  location?: LocationId;
  outcome?: string;
  verification?: VerificationStatus;
}

/**
 * Records raw interactions and the raw evidence that they happened. This is
 * the entry point of the evidence loop. It stores observations only — no
 * interpretation, scoring or orientation is derived here.
 */
export class InteractionService {
  constructor(private readonly ctx: SimContext) {}

  record(spec: InteractionSpec): { interaction: Interaction; evidence: Evidence } {
    const now = this.ctx.clock.now();
    const prov = provenance('system', 'interactions', now, { realmId: this.ctx.state.realm.id });
    const interaction: Interaction = {
      id: this.ctx.ids.next('interaction'),
      actor: spec.actor,
      target: spec.target,
      at: now,
      location: spec.location,
      context: { realmId: this.ctx.state.realm.id, serverId: this.ctx.state.server.id, mode: this.ctx.mode, domain: 'PLAY' },
      actionType: spec.actionType,
      outcome: spec.outcome,
      provenance: prov,
    };
    const evidence: Evidence = {
      id: this.ctx.ids.next('evidence'),
      interactionId: interaction.id,
      observedBy: { kind: 'system', id: 'kernel' },
      observedAt: now,
      verification: spec.verification ?? 'system-observed',
      provenance: prov,
    };
    this.ctx.state.interactions[interaction.id] = interaction;
    this.ctx.state.evidence[evidence.id] = evidence;
    return { interaction, evidence };
  }

  byActor(actorId: ActorId): Interaction[] {
    return Object.values(this.ctx.state.interactions).filter((i) => i.actor === actorId);
  }
}
