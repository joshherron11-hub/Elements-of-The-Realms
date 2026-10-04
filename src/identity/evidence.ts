import { err, ok, type Result } from '../core/result';
import type { ActorId, EvidenceId, LocationId, PlatformDomain } from '../core/refs';
import { provenance } from '../core/provenance';
import { emit, type DomainEvent, type SimContext } from '../world/context';
import type { Evidence, Interaction, VerificationSource, VerificationStatus } from './types';
import { verifierAllowed } from './canonical/ladder';

export interface InteractionSpec {
  actor: ActorId;
  actionType: string;
  target?: { kind: string; id: string };
  location?: LocationId;
  outcome?: string;
  domain?: PlatformDomain;
  /** Defaults to 'system-observed' when the kernel itself saw it happen. */
  verification?: VerificationStatus;
  sourceSystem?: string;
}

const VERIFICATION_SOURCES = new Set(['system', 'witness', 'authorized-verifier']);

/**
 * Allowed verification transitions and who may make them.
 * - Anything may become 'disputed'.
 * - Only an authorized verifier may mark evidence 'verified'.
 * - A witness may raise unverified/system-observed evidence to 'witnessed'.
 */
const TRANSITIONS: Record<VerificationStatus, Partial<Record<VerificationStatus, VerificationSource['kind'][]>>> = {
  unverified: { 'system-observed': ['system'], witnessed: ['witness'], verified: ['authorized-verifier'], disputed: ['system', 'witness', 'authorized-verifier'] },
  'system-observed': { witnessed: ['witness'], verified: ['authorized-verifier'], disputed: ['system', 'witness', 'authorized-verifier'] },
  witnessed: { verified: ['authorized-verifier'], disputed: ['system', 'witness', 'authorized-verifier'] },
  verified: { disputed: ['system', 'witness', 'authorized-verifier'] },
  disputed: { verified: ['authorized-verifier'], unverified: ['authorized-verifier'] },
};

/**
 * The entry point of the evidence loop: records raw interactions and the raw
 * evidence that they happened, and manages verification status.
 *
 * This service stores observations only. It derives no interpretation,
 * orientation, score or rank, and it has no dependency on the economy.
 */
export class InteractionService {
  private unsubscribe?: () => void;

  constructor(private readonly ctx: SimContext) {}

  record(spec: InteractionSpec): { interaction: Interaction; evidence: Evidence } {
    const now = this.ctx.clock.now();
    const prov = provenance('system', spec.sourceSystem ?? 'interactions', now, {
      realmId: this.ctx.state.realm.id,
      createdBy: { kind: 'actor', id: spec.actor },
    });
    const context = {
      realmId: this.ctx.state.realm.id,
      serverId: this.ctx.state.server.id,
      domain: spec.domain ?? 'PLAY',
      mode: this.ctx.state.activeModes[spec.actor] ?? this.ctx.mode,
    };
    const interaction: Interaction = {
      id: this.ctx.ids.next('interaction'),
      layer: 'observed',
      actor: spec.actor,
      target: spec.target,
      at: now,
      location: spec.location,
      context,
      actionType: spec.actionType,
      outcome: spec.outcome,
      provenance: prov,
    };
    const evidence: Evidence = {
      id: this.ctx.ids.next('evidence'),
      layer: 'observed',
      interactionId: interaction.id,
      observedBy: { kind: 'system', id: 'kernel' },
      observedAt: now,
      actor: spec.actor,
      target: spec.target,
      time: now,
      location: spec.location,
      context,
      actionType: spec.actionType,
      outcome: spec.outcome,
      provenance: prov,
      verification: spec.verification ?? 'system-observed',
      verificationHistory: [],
    };
    this.ctx.state.interactions[interaction.id] = interaction;
    this.ctx.state.evidence[evidence.id] = evidence;
    return { interaction, evidence };
  }

  /**
   * Change verification status. Rules:
   *  - only legal transitions, by an allowed source kind;
   *  - nobody may witness or verify their own evidence;
   *  - history is append-only.
   */
  verify(evidenceId: EvidenceId, to: VerificationStatus, by: VerificationSource, note?: string): Result<Evidence> {
    const ev = this.ctx.state.evidence[evidenceId];
    if (!ev) return err('UNKNOWN_EVIDENCE', `no evidence ${evidenceId}`);
    if (!VERIFICATION_SOURCES.has(by.kind)) return err('BAD_SOURCE', `verification source ${String(by.kind)} is not allowed`);
    if (by.kind !== 'system' && by.id === ev.actor) return err('SELF_VERIFICATION', 'an actor cannot verify their own evidence');
    const allowed = TRANSITIONS[ev.verification][to];
    if (!allowed) return err('BAD_TRANSITION', `cannot go from ${ev.verification} to ${to}`);
    if (!allowed.includes(by.kind)) return err('NOT_AUTHORIZED', `${by.kind} cannot mark evidence ${to}`);
    if (by.kind === 'authorized-verifier') {
      const role = verifierAllowed(this.ctx.canon.verifiers, this.ctx.canon.environment, by.role);
      if (!role.ok) return role;
    }
    const change = { at: this.ctx.clock.now(), from: ev.verification, to, by, note };
    ev.verificationHistory.push(change);
    ev.verification = to;
    emit(this.ctx, 'evidence.verification-changed', { evidenceId, ...change }, { sourceSystem: 'evidence', actor: ev.actor });
    return ok(ev);
  }

  byActor(actorId: ActorId): Interaction[] {
    return Object.values(this.ctx.state.interactions).filter((i) => i.actor === actorId);
  }

  evidenceFor(actorIds: readonly ActorId[]): Evidence[] {
    const set = new Set<string>(actorIds);
    return Object.values(this.ctx.state.evidence).filter((e) => set.has(e.actor));
  }

  /**
   * Record a raw interaction for every chronicle-worthy event that names an
   * actor. The event type becomes the action type. Nothing is interpreted.
   */
  attach(): void {
    this.unsubscribe ??= this.ctx.events.on<DomainEvent>('*', (e) => {
      const m = e.meta;
      if (!(m?.chronicle || m?.evidence) || !m.actor) return;
      this.record({
        actor: m.actor,
        actionType: e.type,
        location: m.location,
        outcome: m.outcome,
        domain: m.domain,
        target: m.participants?.[0] ? { kind: 'actor', id: m.participants[0] } : undefined,
        sourceSystem: m.sourceSystem,
      });
    });
  }

  detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }
}
