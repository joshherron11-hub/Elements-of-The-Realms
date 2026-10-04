import type { ActorId, OrganizationId, PlatformDomain, RealmId, RoleId } from '../core/refs';
import type { Provenance } from '../core/provenance';
import type { Permission } from './authority';

/**
 * One generic structure for every kind of group. Faction and Clan are kinds of
 * Organization, not separate systems, so politics, guilds, households, work
 * teams and (eventually) war factions all share membership, roles and
 * authority logic.
 */
export type OrganizationKind =
  | 'organization'
  | 'faction'
  | 'clan'
  | 'guild'
  | 'household'
  | 'government'
  | 'company'
  | 'team'
  | 'school';

export interface Membership {
  roleIds: RoleId[];
  joinedAt: number;
}

export interface Organization {
  readonly id: OrganizationId;
  kind: OrganizationKind;
  name: string;
  realmId?: RealmId;
  domain: PlatformDomain;
  parentId?: OrganizationId;
  members: Record<string, Membership>; // keyed by ActorId
  tags: string[];
  provenance: Provenance;
}

/** Convenience aliases — same shape, different intent. */
export type Faction = Organization & { kind: 'faction' };
export type Clan = Organization & { kind: 'clan' };

/** A named bundle of permissions held by members of an organization. */
export interface Role {
  readonly id: RoleId;
  organizationId: OrganizationId;
  name: string;
  permissions: Permission[];
}

export const isMember = (org: Organization, actor: ActorId): boolean => actor in org.members;
