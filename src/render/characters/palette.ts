import type { PersonLook } from '../looks';

/**
 * Palette slots of the humanoid asset (the order is baked into the GLB as UV.x;
 * keep in sync with `tools/characters/outfit.py` SLOTS). Every NPC shares the
 * meshes and recolours them through its own palette.
 */
export const SLOTS = [
  'skin', 'lips', 'hair', 'brow', 'sclera', 'iris', 'pupil', 'top', 'top_trim', 'over', 'accent', 'legs',
  'leather', 'sole', 'metal', 'hat',
] as const;
export type Slot = (typeof SLOTS)[number];
export type HumanoidPalette = Record<Slot, number>;

/** Surface detail per slot (channels of the detail texture): 0 none, 1 weave, 2 leather, 3 hair, 4 skin. */
export const PATTERN: Record<Slot, number> = {
  skin: 4, lips: 4, hair: 3, brow: 3, sclera: 0, iris: 0, pupil: 0, top: 1, top_trim: 1, over: 1, accent: 1, legs: 1,
  leather: 2, sole: 2, metal: 0, hat: 1,
};

const mix = (a: number, b: number, t: number): number => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** A palette from a character look, so the authored look data drives the new model. */
export function paletteFromLook(look: PersonLook, overrides: Partial<HumanoidPalette> = {}): HumanoidPalette {
  return {
    skin: look.skin,
    lips: mix(look.skin, 0x8a3a36, 0.22),
    hair: look.hair,
    brow: mix(look.hair, 0x000000, 0.25),
    sclera: 0xf2ece0,
    iris: 0x5a3a22,
    pupil: 0x140c0c,
    top: look.colors.body,
    top_trim: mix(look.colors.body, 0x000000, 0.3),
    over: look.colors.over,
    accent: look.colors.accent,
    legs: look.colors.legs,
    leather: 0x5a3a24,
    sole: 0x2a1c14,
    metal: 0xc9973a,
    hat: look.colors.hat,
    ...overrides,
  };
}
