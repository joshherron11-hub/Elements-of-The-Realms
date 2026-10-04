import { err, ok, type Result } from '../core/result';
import { Validator } from '../core/schema';

/**
 * CHARACTER LOOKS — presentation data.
 *
 * How a person or Familiar is drawn: build, clothing layers, hair, hat, what
 * they carry and how they stand. Looks never affect gameplay; they are loaded
 * from `realms/<realm>/looks/*.json` so a new NPC needs data, not code.
 */
export const BUILDS = ['slim', 'average', 'stout', 'small', 'tall'] as const;
export const GARMENTS = [
  'tunic', 'dress', 'robe', 'doublet', 'vest', 'bodice', 'apron', 'tabard', 'cloak', 'mantle', 'scarf', 'sash',
  'belt-pouch', 'satchel', 'pack', 'bedroll', 'chain', 'rolled-sleeves', 'lantern',
] as const;
export const HATS = ['none', 'hood', 'headscarf', 'wide-brim', 'straw', 'cap', 'tall'] as const;
export const HAIR_STYLES = ['cropped', 'long', 'bun', 'braid', 'ponytail', 'bald', 'tousled'] as const;
export const BEARDS = ['none', 'moustache', 'full', 'stubble'] as const;
export const HELD = ['none', 'tankard', 'letter', 'scroll', 'basket', 'staff', 'ledger', 'pitchfork', 'lantern'] as const;
export const IDLES = ['relaxed', 'hips', 'crossed', 'behind', 'hold', 'lean'] as const;

export type Build = (typeof BUILDS)[number];
export type Garment = (typeof GARMENTS)[number];
export type Hat = (typeof HATS)[number];
export type HairStyle = (typeof HAIR_STYLES)[number];
export type Beard = (typeof BEARDS)[number];
export type Held = (typeof HELD)[number];
export type Idle = (typeof IDLES)[number];

export interface PersonLook {
  build: Build;
  height: number;
  skin: number;
  hair: number;
  hairStyle: HairStyle;
  beard: Beard;
  hat: Hat;
  /** Main garment colour, over-layer colour, accent/trim, trousers or skirt. */
  colors: { body: number; over: number; accent: number; legs: number; hat: number };
  garments: Garment[];
  held: Held;
  idle: Idle;
}

export interface FamiliarLook {
  coat: number;
  marking: number;
  accent: number;
}

export interface Looks {
  people: Record<string, PersonLook>;
  familiars: Record<string, FamiliarLook>;
}

const hexColor = (v: Validator, x: unknown, p: string): number => {
  const s = v.str(x, p);
  if (!/^#[0-9a-f]{6}$/i.test(s)) v.fail(p, 'expected a colour like #a3302a');
  return parseInt(s.slice(1), 16) || 0;
};

export function parseLooks(raw: unknown, source = 'looks'): Result<Looks> {
  const v = new Validator(source);
  const o = v.obj(raw, '');
  v.noExtraKeys(o, ['$provisional', 'realmId', 'people', 'familiars'], '');
  const people: Record<string, PersonLook> = {};
  for (const [id, x] of Object.entries(v.obj(o.people ?? {}, 'people'))) {
    const p = `people.${id}`;
    const l = v.obj(x, p);
    v.noExtraKeys(l, ['build', 'height', 'skin', 'hair', 'hairStyle', 'beard', 'hat', 'colors', 'garments', 'held', 'idle'], p);
    const c = v.obj(l.colors, `${p}.colors`);
    people[id] = {
      build: v.oneOf(l.build ?? 'average', BUILDS, `${p}.build`),
      height: l.height === undefined ? 2.5 : v.num(l.height, `${p}.height`, 1.6, 3.2),
      skin: hexColor(v, l.skin, `${p}.skin`),
      hair: hexColor(v, l.hair, `${p}.hair`),
      hairStyle: v.oneOf(l.hairStyle ?? 'cropped', HAIR_STYLES, `${p}.hairStyle`),
      beard: v.oneOf(l.beard ?? 'none', BEARDS, `${p}.beard`),
      hat: v.oneOf(l.hat ?? 'none', HATS, `${p}.hat`),
      colors: {
        body: hexColor(v, c.body, `${p}.colors.body`),
        over: hexColor(v, c.over ?? c.body, `${p}.colors.over`),
        accent: hexColor(v, c.accent, `${p}.colors.accent`),
        legs: hexColor(v, c.legs ?? '#5a3a24', `${p}.colors.legs`),
        hat: hexColor(v, c.hat ?? c.accent, `${p}.colors.hat`),
      },
      garments: v.arr(l.garments ?? [], `${p}.garments`, (g, gp) => v.oneOf(g, GARMENTS, gp)),
      held: v.oneOf(l.held ?? 'none', HELD, `${p}.held`),
      idle: v.oneOf(l.idle ?? 'relaxed', IDLES, `${p}.idle`),
    };
  }
  const familiars: Record<string, FamiliarLook> = {};
  for (const [id, x] of Object.entries(v.obj(o.familiars ?? {}, 'familiars'))) {
    const p = `familiars.${id}`;
    const f = v.obj(x, p);
    v.noExtraKeys(f, ['coat', 'marking', 'accent'], p);
    familiars[id] = { coat: hexColor(v, f.coat, `${p}.coat`), marking: hexColor(v, f.marking, `${p}.marking`), accent: hexColor(v, f.accent, `${p}.accent`) };
  }
  return v.ok ? ok({ people, familiars }) : err('INVALID_CONTENT', v.errors.join('\n'));
}

/** Merge several looks files (later files win per id). */
export function mergeLooks(list: Looks[]): Looks {
  const out: Looks = { people: {}, familiars: {} };
  for (const l of list) {
    Object.assign(out.people, l.people);
    Object.assign(out.familiars, l.familiars);
  }
  return out;
}
