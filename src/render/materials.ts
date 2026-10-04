import * as THREE from 'three';
import type { Palette } from './stage';

/**
 * Shared cel-shaded materials for Chromatic Mythic.
 *
 * - `toon`: three hard light bands with a deep shadow band, so form reads
 *   from the warm key light against cool shadow.
 * - `character`: the same, plus a cel rim light so people and Familiars
 *   separate from the ground at a glance.
 * - `glow`: unlit, over-bright colour for windows, lamps and fire. Only these
 *   exceed the bloom threshold, which keeps bloom selective.
 * - `mesh`: a mesh plus an inverted-hull outline for strong silhouettes.
 *
 * Materials are cached per colour so a whole section shares a handful of
 * programs and draw states.
 */
export class Materials {
  private readonly gradient: THREE.DataTexture;
  private readonly cache = new Map<string, THREE.Material>();
  readonly outline: THREE.MeshBasicMaterial;
  /** Shared by every rim-lit material; the stage tints it with the time of day. */
  readonly rim = { color: { value: new THREE.Color(0xffe0b0) }, strength: { value: 0.55 } };

  constructor(readonly palette: Palette, bands = 3) {
    // Deep shadow band, a mid band and full light: high contrast without banding noise.
    const levels = bands <= 2 ? [95, 255] : bands === 3 ? [88, 175, 255] : Array.from({ length: bands }, (_, i) => Math.round(80 + (175 * i) / (bands - 1)));
    const steps = new Uint8Array(levels);
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

  private memo<T extends THREE.Material>(key: string, make: () => T): T {
    let m = this.cache.get(key) as T | undefined;
    if (!m) {
      m = make();
      this.cache.set(key, m);
    }
    return m;
  }

  toon(color: number): THREE.MeshToonMaterial {
    return this.memo(`toon:${color}`, () => new THREE.MeshToonMaterial({ color, gradientMap: this.gradient }));
  }

  /** Toon with a painted texture (ground, cobbles, planks). */
  textured(map: THREE.Texture, color = 0xffffff): THREE.MeshToonMaterial {
    return this.memo(`tex:${map.uuid}:${color}`, () => new THREE.MeshToonMaterial({ color, map, gradientMap: this.gradient }));
  }

  /** Toon plus a stepped rim light: for characters and Familiars. */
  character(color: number): THREE.MeshToonMaterial {
    return this.memo(`char:${color}`, () => {
      const m = new THREE.MeshToonMaterial({ color, gradientMap: this.gradient });
      m.onBeforeCompile = (shader) => {
        shader.uniforms.rimColor = this.rim.color;
        shader.uniforms.rimStrength = this.rim.strength;
        shader.fragmentShader = `uniform vec3 rimColor;\nuniform float rimStrength;\n${shader.fragmentShader}`.replace(
          '#include <opaque_fragment>',
          `{
            float facing = clamp( dot( normalize( normal ), normalize( vViewPosition ) ), 0.0, 1.0 );
            float rim = smoothstep( 0.6, 0.68, 1.0 - facing );
            outgoingLight += rimColor * rim * rimStrength;
          }
          #include <opaque_fragment>`,
        );
      };
      m.customProgramCacheKey = () => 'eotr-rim';
      return m;
    });
  }

  /** Unlit and over-bright: windows, lamps, embers. `power` > 1 feeds selective bloom. */
  glow(color: number, power = 2.2, opacity = 1): THREE.MeshBasicMaterial {
    return this.memo(`glow:${color}:${power}:${opacity}`, () => {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), toneMapped: false, transparent: opacity < 1, opacity });
      m.userData.baseColor = color;
      m.userData.power = power;
      return m;
    });
  }

  /** A mesh plus its outline shell. Pass `material` to use something other than plain toon. */
  mesh(geometry: THREE.BufferGeometry, color: number, outline = true, thickness = 0.06, material?: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(geometry, material ?? this.toon(color));
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    if (outline) {
      const shell = new THREE.Mesh(geometry, this.outline);
      geometry.computeBoundingSphere();
      const r = geometry.boundingSphere?.radius ?? 1;
      shell.scale.setScalar(1 + thickness / Math.max(0.3, r));
      g.add(shell);
    }
    return g;
  }

  /** Character-part mesh: rim-lit, outlined. */
  part(geometry: THREE.BufferGeometry, color: number, outline = true, thickness = 0.05): THREE.Group {
    return this.mesh(geometry, color, outline, thickness, this.character(color));
  }
}
