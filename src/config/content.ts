import type { RealmDefinition } from '../world/realm';
import type { ServerConstitution, ServerDefinition, ServerPreset } from '../world/server';
import { parseRealmDefinition, parseServerConstitution, parseServerDefinition, resolveServerRules, type ResolvedRules } from '../world/constitution';
import { RELEASE } from './build';

/**
 * Loads every authored Realm, server preset and server definition at build
 * time and validates it. Invalid content fails loudly at startup — content
 * errors are author errors, not gameplay outcomes.
 *
 * Adding a Realm or preset means adding a JSON file; no code changes.
 */
const realmFiles = import.meta.glob('../../realms/*/realm.json', { eager: true, import: 'default' });
const presetFiles = import.meta.glob('../../server-constitutions/*.json', { eager: true, import: 'default' });
const serverFiles = import.meta.glob('../../realms/*/servers/*.json', { eager: true, import: 'default' });

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!r.ok) throw new Error(`Invalid content:\n${r.error.message}`);
  return r.value;
}

export class ContentRegistry {
  readonly realms = new Map<string, RealmDefinition>();
  readonly presets = new Map<ServerPreset, ServerConstitution>();
  readonly servers = new Map<string, ServerDefinition>();

  constructor(files: { realms: Record<string, unknown>; presets: Record<string, unknown>; servers: Record<string, unknown> }) {
    for (const [path, raw] of Object.entries(files.realms)) {
      const realm = unwrap(parseRealmDefinition(raw, path));
      if (this.realms.has(realm.id)) throw new Error(`Duplicate realm id ${realm.id}`);
      this.realms.set(realm.id, realm);
    }
    for (const [path, raw] of Object.entries(files.presets)) {
      const preset = unwrap(parseServerConstitution(raw, path));
      if (this.presets.has(preset.preset)) throw new Error(`Duplicate preset ${preset.preset}`);
      this.presets.set(preset.preset, preset);
    }
    for (const [path, raw] of Object.entries(files.servers)) {
      const server = unwrap(parseServerDefinition(raw, path));
      if (this.servers.has(server.id)) throw new Error(`Duplicate server id ${server.id}`);
      this.servers.set(server.id, server);
    }
  }

  realm(id: string): RealmDefinition {
    const r = this.realms.get(id);
    if (!r) throw new Error(`Unknown realm ${id}`);
    return r;
  }

  preset(p: ServerPreset): ServerConstitution {
    const c = this.presets.get(p);
    if (!c) throw new Error(`Unknown server preset ${p}`);
    return c;
  }

  /** Resolve a server's effective rules under the current release. */
  rulesFor(serverId: string): ResolvedRules {
    const server = this.servers.get(serverId);
    if (!server) throw new Error(`Unknown server ${serverId}`);
    return unwrap(resolveServerRules(this.realm(server.realmId), this.preset(server.preset), server, RELEASE));
  }
}

export const content = new ContentRegistry({ realms: realmFiles, presets: presetFiles, servers: serverFiles });
