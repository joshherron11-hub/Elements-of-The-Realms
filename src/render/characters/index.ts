import type * as THREE from 'three';
import humanoidUrl from '../../../assets/characters/blackmere-humanoid.glb?url';
import type { PersonLook } from '../looks';
import type { Materials } from '../materials';
import { createPerson } from '../people';
import type { QualitySettings } from '../quality';
import { createHumanoid, humanoidOf, type Gesture } from './humanoid';
import { CharacterLibrary } from './library';
import { paletteFromLook } from './palette';

export { CharacterLibrary } from './library';
export { animateHumanoid, createHumanoid, humanoidOf, type Gesture } from './humanoid';

/** Character assets shipped with the game (id -> URL). */
export const CHARACTER_ASSETS: Record<string, string> = { 'blackmere-humanoid': humanoidUrl };

/** LOD switch distances (world units) per preset; the gameplay camera sits ~21 units out. */
const LOD: Record<QualitySettings['quality'], [number, number]> = { high: [36, 62], low: [27, 46] };

/**
 * A person for a look: the rigged humanoid when the look names a model and
 * its asset has loaded, otherwise the built figure (the fallback while the
 * asset streams in, or if it fails). Either way it is pure presentation.
 */
export function createCharacter(m: Materials, lib: CharacterLibrary, look: PersonLook, seed: number, settings: QualitySettings): THREE.Group {
  const asset = look.model ? lib.get(look.model.asset) : undefined;
  if (!look.model || !asset) return createPerson(m, look, seed);
  const missing = look.model.parts.filter((p) => !asset.has(p));
  if (missing.length) console.warn(`Unknown character parts: ${missing.join(', ')}`);
  return createHumanoid(
    asset,
    {
      parts: look.model.parts,
      palette: paletteFromLook(look, look.model.palette as Partial<ReturnType<typeof paletteFromLook>>),
      height: look.height,
      lodDistances: LOD[settings.quality],
      outline: { color: m.palette.ink, width: 0.0075 },
      castShadow: settings.shadows,
      rim: m.rim,
    },
    seed,
  );
}

/** Whether a figure is (still) the fallback for a look that wants a model. */
export function wantsUpgrade(figure: THREE.Object3D, look: PersonLook | undefined, lib: CharacterLibrary): boolean {
  return !!look?.model && !humanoidOf(figure) && !!lib.get(look.model.asset);
}

/** What a routine activity looks like on a humanoid (presentation only). */
export function activityGesture(activity: string | undefined): Gesture | undefined {
  if (!activity) return undefined;
  if (/deliver|carry/.test(activity)) return 'carry';
  if (/field|orchard|chores|setting-up|opening/.test(activity)) return 'work';
  if (/sorting|serving|trading|records|reading/.test(activity)) return 'interact';
  return undefined;
}
