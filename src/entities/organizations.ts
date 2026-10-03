import { err, ok, type Result } from '../core/result';
import { sameRef, type ActorId, type LocationId, type OrganizationId, type OwnerRef, type RoleId, type ScopeRef } from '../core/refs';
import { emit, type SimContext } from '../world/context';
import type { OwnershipService } from '../economy/ownership';
import type { WorldService } from '../world/world';
import { permissionMatches, type AuthorityGrant, type Permission } from './authority';
import type { Organization } from './organization';

export class OrganizationService {
  constructor(private readonly ctx: SimContext) {}

  get(id: OrganizationId): Organization | undefined {
    return this.ctx.state.organizations[id];
  }

  membershipsOf(actorId: ActorId): Organization[] {
    return Object.values(this.ctx.state.organizations).filter((o) => actorId in o.members);
  }

  join(actorId: ActorId, orgId: OrganizationId, roleIds: RoleId[] = []): Result<Organization> {
    const org = this.get(orgId);
    if (!org) return err('UNKNOWN_ORG', `no organization ${orgId}`);
    if (!this.ctx.state.actors[actorId]) return err('UNKNOWN_ACTOR', `no actor ${actorId}`);
    if (actorId in org.members) return err('ALREADY_MEMBER', 'already a member');
    for (const r of roleIds) {
      if (this.ctx.state.roles[r]?.organizationId !== orgId) return err('BAD_ROLE', `role ${r} is not part of ${orgId}`);
    }
    org.members[actorId] = { roleIds: [...roleIds], joinedAt: this.ctx.clock.now() };
    emit(this.ctx, 'organization.joined', { actorId, orgId }, {
      sourceSystem: 'organizations',
      actor: actorId,
      outcome: 'joined',
      summary: `Joined ${org.name}`,
      domain: org.domain,
      chronicle: true,
    });
    return ok(org);
  }

  leave(actorId: ActorId, orgId: OrganizationId): Result<Organization> {
    const org = this.get(orgId);
    if (!org) return err('UNKNOWN_ORG', `no organization ${orgId}`);
    if (!(actorId in org.members)) return err('NOT_MEMBER', 'not a member');
    delete org.members[actorId];
    emit(this.ctx, 'organization.left', { actorId, orgId }, {
      sourceSystem: 'organizations',
      actor: actorId,
      outcome: 'left',
      summary: `Left ${org.name}`,
      domain: org.domain,
      chronicle: true,
    });
    return ok(org);
  }
}

/**
 * Answers "may this actor do X here?" by combining, in one place:
 *  - implicit rights of ownership (owners hold 'property.*' etc. on their asset),
 *  - grants held directly by the actor,
 *  - grants held by organizations the actor belongs to,
 *  - permissions of the actor's roles and grants held by those roles.
 * Location-scoped grants also cover nested locations.
 */
export class AuthorityService {
  constructor(
    private readonly ctx: SimContext,
    private readonly ownership: OwnershipService,
    private readonly world: WorldService,
  ) {}

  /** Permissions an owner implicitly holds over an owned property. */
  static readonly OWNER_PERMISSIONS: Permission[] = ['property.*'];

  grant(g: Omit<AuthorityGrant, 'id'>): AuthorityGrant {
    const full: AuthorityGrant = { ...g, id: this.ctx.ids.next('grant') };
    this.ctx.state.authority[full.id] = full;
    emit(this.ctx, 'authority.granted', { grant: full }, { sourceSystem: 'authority' });
    return full;
  }

  revoke(id: AuthorityGrant['id']): boolean {
    if (!this.ctx.state.authority[id]) return false;
    delete this.ctx.state.authority[id];
    emit(this.ctx, 'authority.revoked', { grantId: id }, { sourceSystem: 'authority' });
    return true;
  }

  can(actorId: ActorId, permission: Permission, scope: ScopeRef): boolean {
    const now = this.ctx.clock.now();
    const self: OwnerRef = { kind: 'actor', id: actorId };
    const orgs = Object.values(this.ctx.state.organizations).filter((o) => actorId in o.members);
    const holders: OwnerRef[] = [self, ...orgs.map((o) => ({ kind: 'organization' as const, id: o.id }))];
    const roleIds = new Set<string>(orgs.flatMap((o) => o.members[actorId]!.roleIds));

    // 1. Ownership of the asset in scope.
    if (scope.kind === 'property' && scope.id) {
      const owner = this.ownership.ownerOf({ kind: 'property', id: scope.id });
      if (owner && holders.some((h) => sameRef(h, owner))) {
        if (AuthorityService.OWNER_PERMISSIONS.some((p) => permissionMatches(p, permission))) return true;
      }
    }

    // 2. Role permissions apply within the role's own organization.
    if (scope.kind === 'organization') {
      for (const rid of roleIds) {
        const role = this.ctx.state.roles[rid];
        if (role && role.organizationId === scope.id && role.permissions.some((p) => permissionMatches(p, permission))) return true;
      }
    }

    // 3. Explicit grants.
    for (const g of Object.values(this.ctx.state.authority)) {
      if (g.expiresAt !== undefined && g.expiresAt <= now) continue;
      const held =
        g.holder.kind === 'role' ? roleIds.has(g.holder.id) : holders.some((h) => sameRef(h, g.holder as OwnerRef));
      if (!held) continue;
      if (!g.permissions.some((p) => permissionMatches(p, permission))) continue;
      if (this.scopeCovers(g.scope, scope)) return true;
    }
    return false;
  }

  /** Does a grant's scope cover the requested scope? */
  private scopeCovers(granted: ScopeRef, requested: ScopeRef): boolean {
    if (granted.kind === 'global') return true;
    if (granted.kind === requested.kind && granted.id === requested.id) return true;
    if (granted.kind === 'realm') return granted.id === this.ctx.state.realm.id;
    if (granted.kind === 'location' && granted.id) {
      if (requested.kind === 'location' && requested.id) {
        return this.world.isWithin(requested.id as LocationId, granted.id as LocationId);
      }
      if (requested.kind === 'property' && requested.id) {
        const prop = this.ctx.state.properties[requested.id];
        return !!prop && this.world.isWithin(prop.locationId, granted.id as LocationId);
      }
    }
    return false;
  }
}
