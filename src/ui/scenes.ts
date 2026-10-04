import { parseSceneLayout, type SceneLayout } from '../render/layout';
import { mergeLooks, parseLooks, type Looks } from '../render/looks';

/** Loads and validates every authored scene layout at startup. */
const files = import.meta.glob('../../realms/*/scenes/*.json', { eager: true, import: 'default' });

export function loadSceneLayouts(raw: Record<string, unknown> = files): Map<string, SceneLayout> {
  const out = new Map<string, SceneLayout>();
  for (const [path, data] of Object.entries(raw)) {
    const r = parseSceneLayout(data, path);
    if (!r.ok) throw new Error(`Invalid scene layout:\n${r.error.message}`);
    if (out.has(r.value.id)) throw new Error(`Duplicate scene ${r.value.id}`);
    out.set(r.value.id, r.value);
  }
  return out;
}

/** Character and Familiar looks (presentation data), merged across files. */
const lookFiles = import.meta.glob('../../realms/*/looks/*.json', { eager: true, import: 'default' });

export function loadLooks(raw: Record<string, unknown> = lookFiles): Looks {
  return mergeLooks(
    Object.entries(raw).map(([path, data]) => {
      const r = parseLooks(data, path);
      if (!r.ok) throw new Error(`Invalid looks:\n${r.error.message}`);
      return r.value;
    }),
  );
}
