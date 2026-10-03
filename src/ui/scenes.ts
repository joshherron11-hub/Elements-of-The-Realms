import { parseSceneLayout, type SceneLayout } from '../render/layout';

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
