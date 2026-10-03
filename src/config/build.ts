/**
 * Build-level configuration. Realm- and server-level configuration lives in
 * /realms and /server-constitutions as data, not here.
 */
export const BUILD = {
  platform: 'Elements of the Realms',
  version: '0.1.0',
  defaultRealm: 'happy-fall',
  defaultLocation: 'blackmere',
  release: 'PEACETIME',
} as const;
