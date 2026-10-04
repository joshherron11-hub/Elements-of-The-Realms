import * as THREE from 'three';
import type { Palette } from './stage';

/**
 * Shared toon materials and the inverted-hull outline that gives Chromatic
 * Mythic its strong silhouettes. Materials are cached per colour so a whole
 * section uses a handful of draw-state changes.
 */
export class Materials {
  private readonly gradient: THREE.DataTexture;
  private readonly cache = new Map<number, THREE.MeshToonMaterial>();
  readonly outline: THREE.MeshBasicMaterial;

  constructor(readonly palette: Palette, bands = 3) {
    const steps = new Uint8Array(Array.from({ length: bands }, (_, i) => Math.round(80 + (175 * i) / Math.max(1, bands - 1))));
    this.gradient = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
    this.gradient.minFilter = THREE.NearestFilter;
    this.gradient.magFilter = THREE.NearestFilter;
    this.gradient.needsUpdate = true;
    this.outline = new THREE.MeshBasicMaterial({ color: palette.ink, side: THREE.BackSide });
  }

  /** Colour from a palette key or a raw number. Unknown keys fall back to stone. */
  color(key: string | number | undefined, fallback: keyof Palette = 'stone'): number {
    if (typeof key === 'number') return key;
    const value = key ? (this.palette as Record<string, number>)[key] : undefined;
    return value ?? this.palette[fallback];
  }

  toon(color: number): THREE.MeshToonMaterial {
    let m = this.cache.get(color);
    if (!m) {
      m = new THREE.MeshToonMaterial({ color, gradientMap: this.gradient });
      this.cache.set(color, m);
    }
    return m;
  }

  /** A mesh plus its outline shell. */
  mesh(geometry: THREE.BufferGeometry, color: number, outline = true, thickness = 0.06): THREE.Group {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geometry, this.toon(color)));
    if (outline) {
      const shell = new THREE.Mesh(geometry, this.outline);
      geometry.computeBoundingSphere();
      const r = geometry.boundingSphere?.radius ?? 1;
      shell.scale.setScalar(1 + thickness / Math.max(0.3, r));
      g.add(shell);
    }
    return g;
  }
}
