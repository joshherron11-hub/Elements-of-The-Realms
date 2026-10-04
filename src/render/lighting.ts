import type { Palette } from './stage';

/**
 * Time-of-day lighting for Chromatic Mythic: warm gold days, ember dusks,
 * deep ink-violet nights with lantern glow. Pure numbers so it can be tested.
 */
export interface Lighting {
  sky: number;
  fog: number;
  sunColor: number;
  sunIntensity: number;
  hemiIntensity: number;
  /** 0 = lamps off, 1 = fully lit. */
  lamps: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function mixColor(a: number, b: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 255;
  const r = Math.round(lerp(ch(a, 16), ch(b, 16), t));
  const g = Math.round(lerp(ch(a, 8), ch(b, 8), t));
  const bl = Math.round(lerp(ch(a, 0), ch(b, 0), t));
  return (r << 16) | (g << 8) | bl;
}

/** Keyframes by hour; lighting interpolates between them. */
function keys(P: Palette): [number, Lighting][] {
  const day = mixColor(P.light, P.skyHorizon, 0.35);
  // Nights are moonlit, never black: the fill keeps shapes readable at every hour.
  return [
    [0, { sky: P.sky, fog: mixColor(P.sky, P.ink, 0.35), sunColor: 0x9aa8ff, sunIntensity: 0.55, hemiIntensity: 0.85, lamps: 1 }],
    [5, { sky: P.sky, fog: mixColor(P.sky, P.ink, 0.25), sunColor: 0x9aa8ff, sunIntensity: 0.6, hemiIntensity: 0.9, lamps: 1 }],
    [7, { sky: P.skyHorizon, fog: P.fog, sunColor: 0xffa060, sunIntensity: 1.25, hemiIntensity: 1.0, lamps: 0.3 }],
    [10, { sky: day, fog: mixColor(day, P.fog, 0.5), sunColor: 0xffd29a, sunIntensity: 2.0, hemiIntensity: 1.15, lamps: 0 }],
    [16, { sky: day, fog: mixColor(day, P.fog, 0.5), sunColor: 0xffc080, sunIntensity: 1.9, hemiIntensity: 1.1, lamps: 0 }],
    [19, { sky: P.skyHorizon, fog: P.fog, sunColor: 0xff7040, sunIntensity: 1.35, hemiIntensity: 1.0, lamps: 0.6 }],
    [21, { sky: P.sky, fog: P.fog, sunColor: 0xa890ff, sunIntensity: 0.65, hemiIntensity: 0.9, lamps: 1 }],
    [24, { sky: P.sky, fog: mixColor(P.sky, P.ink, 0.35), sunColor: 0x9aa8ff, sunIntensity: 0.55, hemiIntensity: 0.85, lamps: 1 }],
  ];
}

export function lightingAt(hourFloat: number, P: Palette): Lighting {
  const h = ((hourFloat % 24) + 24) % 24;
  const k = keys(P);
  for (let i = 0; i < k.length - 1; i++) {
    const [h0, a] = k[i]!;
    const [h1, b] = k[i + 1]!;
    if (h >= h0 && h <= h1) {
      const t = (h - h0) / (h1 - h0);
      return {
        sky: mixColor(a.sky, b.sky, t),
        fog: mixColor(a.fog, b.fog, t),
        sunColor: mixColor(a.sunColor, b.sunColor, t),
        sunIntensity: lerp(a.sunIntensity, b.sunIntensity, t),
        hemiIntensity: lerp(a.hemiIntensity, b.hemiIntensity, t),
        lamps: lerp(a.lamps, b.lamps, t),
      };
    }
  }
  return k[0]![1];
}
