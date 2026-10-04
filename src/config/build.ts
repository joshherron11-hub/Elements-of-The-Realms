import type { ReleaseGate } from '../world/constitution';

/**
 * Build-level configuration. Realm- and server-level configuration lives in
 * /realms and /server-constitutions as data, not here.
 */
export const BUILD = {
  platform: 'Elements of the Realms',
  version: '0.1.0',
  defaultRealm: 'realm_happy-fall',
  defaultServer: 'server_happy-fall-blackmere',
  defaultLocation: 'blackmere',
  release: 'PEACETIME',
} as const;

/** First release: PEACETIME / CIVILIZATION-FIRST. Let history earn the war. */
export const RELEASE: ReleaseGate = { warAllowed: false };
