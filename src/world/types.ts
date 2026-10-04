import type { LocationId, RealmId, RiskProfileId, RouteId, ServerId } from '../core/refs';

/**
 * Locations form a tree (realm region → settlement → district → building).
 * Geometry is a presentation concern; a location only needs an optional
 * scene key so the renderer knows what to draw. The world is continuous in
 * history, not necessarily in geometry.
 */
export type LocationKind = 'region' | 'settlement' | 'district' | 'building' | 'room' | 'wilderness' | 'road';

export interface Location {
  readonly id: LocationId;
  realmId: RealmId;
  name: string;
  kind: LocationKind;
  parentId?: LocationId;
  tags: string[];
  /** Presentation hint: which scene/section renders this place. */
  sceneKey?: string;
  /** If this place is a property's interior, entering needs `property.enter` on it. */
  propertyId?: string;
  description?: string;
}

export type RouteStatus = 'open' | 'closed' | 'hazardous';
export type RouteKind = 'path' | 'road' | 'river' | 'sea' | 'portal';

/** A traversable connection between two locations. Bidirectional by default. */
export interface Route {
  readonly id: RouteId;
  from: LocationId;
  to: LocationId;
  kind: RouteKind;
  /** Simulated travel time in milliseconds. */
  travelTimeMs: number;
  status: RouteStatus;
  bidirectional: boolean;
  riskProfileId?: RiskProfileId;
  tags: string[];
}

/**
 * Realm and ServerConstitution are declared here in minimal form so the
 * world state can reference them. Their full, data-driven constitutions are
 * defined in the Realm/server layer.
 */
export type RealmType = 'ANCHORED' | 'ASCENDANT' | 'ECHO' | 'FRACTURE' | 'PLANETARY' | 'INTERREALM';

export interface RealmRef {
  readonly id: RealmId;
  name: string;
  type: RealmType;
}

export interface ServerRef {
  readonly id: ServerId;
  name: string;
  realmId: RealmId;
  preset: string;
}
