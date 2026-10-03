import type { AuthorityGrantId, OwnerRef, RoleId, ScopeRef } from '../core/refs';
import type { Provenance } from '../core/provenance';

/**
 * Permissions are namespaced strings: 'property.enter', 'market.trade',
 * 'org.invite'. A trailing '*' grants a whole namespace: 'property.*'.
 */
export type Permission = string;

/** Who an authority grant is given to. */
export type GrantHolder = OwnerRef | { readonly kind: 'role'; readonly id: RoleId };

/**
 * Authority = a holder may do these things within this scope.
 * Grants on a location also apply to locations nested inside it.
 */
export interface AuthorityGrant {
  readonly id: AuthorityGrantId;
  holder: GrantHolder;
  scope: ScopeRef;
  permissions: Permission[];
  grantedBy?: OwnerRef;
  expiresAt?: number;
  provenance: Provenance;
}

export function permissionMatches(granted: Permission, requested: Permission): boolean {
  if (granted === '*' || granted === requested) return true;
  if (granted.endsWith('.*')) return requested.startsWith(granted.slice(0, -1));
  return false;
}
