/**
 * Graphics presets. Presentation only: they change how Blackmere is drawn,
 * never what happens in it. LOW keeps modest phones and laptops smooth;
 * HIGH adds real-time shadows, selective bloom and denser particles.
 */
export type GraphicsQuality = 'low' | 'high';

export interface QualitySettings {
  quality: GraphicsQuality;
  /** Upper bound for devicePixelRatio. */
  maxPixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  bloom: boolean;
  /** Multiplier for particle and scatter counts. */
  density: number;
  /** Full-screen colour grade (split-tone, gentle contrast). LOW uses a cheap CSS grade instead. */
  grading: boolean;
  /** Painterly mist layers in the distance. */
  mist: boolean;
}

export const QUALITY: Record<GraphicsQuality, QualitySettings> = {
  low: { quality: 'low', maxPixelRatio: 1.25, shadows: false, shadowMapSize: 0, bloom: false, density: 0.5, grading: false, mist: false },
  high: { quality: 'high', maxPixelRatio: 2, shadows: true, shadowMapSize: 2048, bloom: true, density: 1, grading: true, mist: true },
};

/** A sensible default from what the device tells us. Pure, so it can be tested. */
export function detectQuality(hint: { touch: boolean; cores?: number; memoryGb?: number; width: number }): GraphicsQuality {
  if (hint.touch) return 'low';
  if ((hint.cores ?? 8) <= 4) return 'low';
  if ((hint.memoryGb ?? 8) <= 4) return 'low';
  if (hint.width < 900) return 'low';
  return 'high';
}
