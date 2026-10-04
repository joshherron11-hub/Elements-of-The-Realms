import { err, ok, type Result } from '../core/result';
import type { ActorId, OwnerRef, PlatformDomain } from '../core/refs';
import { provenance } from '../core/provenance';
import type { OwnershipService } from '../economy/ownership';
import { emit, type SimContext } from '../world/context';
import type { Artifact, ArtifactKind, Contribution } from './types';

/**
 * Artifacts and contributions — the minimal records that let Work, Learn and
 * Create products sit on the same kernel. Everything else they need
 * (teams, courses, commissions, review, history) already exists.
 */
export class ArtifactService {
  constructor(
    private readonly ctx: SimContext,
    private readonly ownership: OwnershipService,
  ) {}

  get(id: string): Artifact | undefined {
    return this.ctx.state.artifacts[id];
  }

  create(spec: { kind: ArtifactKind; title: string; domain: PlatformDomain; author: ActorId; owner?: OwnerRef; tags?: string[]; content?: Artifact['content'] }): Result<Artifact> {
    if (!this.ctx.state.actors[spec.author]) return err('UNKNOWN_ACTOR', `no actor ${spec.author}`);
    const now = this.ctx.clock.now();
    const prov = provenance('actor', 'artifacts', now, { createdBy: { kind: 'actor', id: spec.author }, realmId: this.ctx.state.realm.id });
    const a: Artifact = {
      id: this.ctx.ids.next('artifact'),
      kind: spec.kind,
      title: spec.title,
      domain: spec.domain,
      createdAt: now,
      createdBy: { kind: 'actor', id: spec.author },
      contributors: [],
      content: spec.content,
      status: 'draft',
      tags: [...(spec.tags ?? [])],
      provenance: prov,
    };
    this.ctx.state.artifacts[a.id] = a;
    const owned = this.ownership.register({ kind: 'artifact', id: a.id }, spec.owner ?? { kind: 'actor', id: spec.author }, prov, 'created');
    if (!owned.ok) return owned;
    this.contribute(spec.author, { kind: 'artifact', id: a.id }, 'author', spec.domain);
    emit(this.ctx, 'artifact.created', { artifactId: a.id, kind: a.kind, title: a.title }, {
      sourceSystem: 'artifacts',
      actor: spec.author,
      domain: spec.domain,
      outcome: 'created',
      summary: `Made "${a.title}"`,
      chronicle: true,
    });
    return ok(a);
  }

  /** Record that someone worked on something. A record of work, not a rating of it. */
  contribute(actor: ActorId, target: Contribution['target'], role: string, domain: PlatformDomain, note?: string): Contribution {
    const now = this.ctx.clock.now();
    const c: Contribution = {
      id: this.ctx.ids.next('contribution'),
      actor,
      target,
      role,
      at: now,
      domain,
      note,
      provenance: provenance('actor', 'artifacts', now, { createdBy: { kind: 'actor', id: actor } }),
    };
    this.ctx.state.contributions.push(c);
    if (target.kind === 'artifact') {
      const a = this.ctx.state.artifacts[target.id];
      if (a && !a.contributors.includes(actor)) a.contributors.push(actor);
    }
    emit(this.ctx, 'contribution.recorded', { contributionId: c.id, target, role }, {
      sourceSystem: 'artifacts',
      actor,
      domain,
      outcome: role,
      evidence: true,
    });
    return c;
  }

  setStatus(id: string, status: Artifact['status'], by: ActorId): Result<Artifact> {
    const a = this.get(id);
    if (!a) return err('UNKNOWN_ARTIFACT', `no artifact ${id}`);
    a.status = status;
    emit(this.ctx, 'artifact.status-changed', { artifactId: id, status }, {
      sourceSystem: 'artifacts',
      actor: by,
      domain: a.domain,
      outcome: status,
      summary: `"${a.title}" ${status}`,
      chronicle: status === 'submitted' || status === 'accepted',
    });
    return ok(a);
  }

  contributionsBy(actor: ActorId, domain?: PlatformDomain): Contribution[] {
    return this.ctx.state.contributions.filter((c) => c.actor === actor && (!domain || c.domain === domain));
  }
}
