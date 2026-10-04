import { err, ok, type Result } from '../core/result';
import type { IdentityId, PersonId, RealmId } from '../core/refs';
import { emit, type SimContext } from '../world/context';
import type { DeclaredClaim, Identity, IdentityContextKind, IdentityLink, IdentityVisibility, Person } from './types';

/** Contexts that may exist at most once per person (REALM is once per Realm). */
const SINGLETON_CONTEXTS: ReadonlySet<IdentityContextKind> = new Set(['UNIVERSAL', 'WORK', 'LEARNING', 'CREATOR', 'PRIVATE']);

const DEFAULT_VISIBILITY: Record<IdentityContextKind, IdentityVisibility> = {
  UNIVERSAL: 'private',
  REALM: 'realm',
  WORK: 'private',
  LEARNING: 'private',
  CREATOR: 'private',
  PRIVATE: 'private',
  SHARED: 'connections',
};

/**
 * One person, many contexts. Each context is a separate Identity record.
 * Contexts never see each other unless the person creates an explicit link.
 *
 * Everything here is DECLARED: what the person presents. It is never treated
 * as observed behavior or as Recognition.
 */
export class IdentityService {
  constructor(private readonly ctx: SimContext) {}

  createPerson(displayName: string, id?: PersonId): Person {
    const now = this.ctx.clock.now();
    const person: Person = { id: id ?? this.ctx.ids.next('person'), displayName, createdAt: now, actors: {} };
    this.ctx.state.persons[person.id] = person;
    this.createIdentity(person.id, 'UNIVERSAL', { displayName });
    return person;
  }

  createIdentity(
    personId: PersonId,
    context: IdentityContextKind,
    opts: { displayName: string; realmId?: RealmId; visibility?: IdentityVisibility },
  ): Result<Identity> {
    if (!this.ctx.state.persons[personId]) return err('UNKNOWN_PERSON', `no person ${personId}`);
    if (context === 'REALM' && !opts.realmId) return err('REALM_REQUIRED', 'a REALM identity needs a realmId');
    if (context !== 'REALM' && opts.realmId) return err('REALM_NOT_ALLOWED', `${context} identities are not Realm-bound`);
    const existing = this.identitiesOf(personId);
    if (SINGLETON_CONTEXTS.has(context) && existing.some((i) => i.context === context)) {
      return err('DUPLICATE_CONTEXT', `person already has a ${context} identity`);
    }
    if (context === 'REALM' && existing.some((i) => i.context === 'REALM' && i.realmId === opts.realmId)) {
      return err('DUPLICATE_CONTEXT', 'person already has an identity in this Realm');
    }
    const identity: Identity = {
      id: this.ctx.ids.next('identity'),
      layer: 'declared',
      personId,
      context,
      realmId: opts.realmId,
      displayName: opts.displayName,
      declared: {},
      visibility: opts.visibility ?? DEFAULT_VISIBILITY[context],
      createdAt: this.ctx.clock.now(),
    };
    this.ctx.state.identities[identity.id] = identity;
    return ok(identity);
  }

  identitiesOf(personId: PersonId): Identity[] {
    return Object.values(this.ctx.state.identities).filter((i) => i.personId === personId);
  }

  get(id: IdentityId): Identity | undefined {
    return this.ctx.state.identities[id];
  }

  /** Append a self-declared statement. It is logged and shown as declared — never as verified. */
  declare(identityId: IdentityId, key: string, value: string): Result<DeclaredClaim> {
    const identity = this.get(identityId);
    if (!identity) return err('UNKNOWN_IDENTITY', `no identity ${identityId}`);
    const claim: DeclaredClaim = {
      id: `claim_${identityId}_${this.ctx.state.claims.length + 1}`,
      layer: 'declared',
      identityId,
      personId: identity.personId,
      key,
      value,
      declaredAt: this.ctx.clock.now(),
    };
    identity.declared[key] = value;
    this.ctx.state.claims.push(claim);
    emit(this.ctx, 'identity.declared', { identityId, key }, { sourceSystem: 'identity' });
    return ok(claim);
  }

  /** Let identity `from` see identity `to`. Both must belong to the same person. */
  link(from: IdentityId, to: IdentityId): Result<IdentityLink> {
    const a = this.get(from);
    const b = this.get(to);
    if (!a || !b) return err('UNKNOWN_IDENTITY', 'unknown identity');
    if (a.personId !== b.personId) return err('DIFFERENT_PERSON', 'can only link your own identities');
    if (from === to) return err('SAME_IDENTITY', 'cannot link an identity to itself');
    const link: IdentityLink = { id: `link_${from}_${to}_${this.ctx.clock.now()}`, personId: a.personId, from, to, grantedAt: this.ctx.clock.now() };
    this.ctx.state.identityLinks.push(link);
    return ok(link);
  }

  unlink(from: IdentityId, to: IdentityId): boolean {
    let changed = false;
    for (const l of this.ctx.state.identityLinks) {
      if (l.from === from && l.to === to && l.revokedAt === undefined) {
        l.revokedAt = this.ctx.clock.now();
        changed = true;
      }
    }
    return changed;
  }

  /**
   * Can a viewer (seen through one of their identities, or anonymously) see
   * a target identity? Own contexts are separate unless linked.
   */
  canView(viewer: IdentityId | undefined, target: IdentityId): boolean {
    const t = this.get(target);
    if (!t) return false;
    if (t.visibility === 'public') return true;
    if (!viewer) return false;
    if (viewer === target) return true;
    const v = this.get(viewer);
    if (!v) return false;
    if (v.personId === t.personId) {
      return this.ctx.state.identityLinks.some((l) => l.from === viewer && l.to === target && l.revokedAt === undefined);
    }
    if (t.visibility === 'realm') return v.context === 'REALM' && t.context === 'REALM' && v.realmId === t.realmId;
    // 'connections' and 'private' need explicit sharing rules that are not part of this phase.
    return false;
  }
}
