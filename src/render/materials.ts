import * as THREE from 'three';
import type { Palette } from './stage';
import { Assembly } from './kit/geo';
import { plasterTexture, shingleTexture, stoneTexture, strawTexture, weaveTexture, woodTexture } from './textures';

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

  // ── Art kit: one material language for the whole Realm ──────────────────
  /** Wood: grain, knots and plank seams, tinted. */
  wood(color: number = this.palette.timber): THREE.MeshToonMaterial {
    return this.textured(woodTexture(), lighten(color, 1.35));
  }

  /** Dressed stone courses. */
  stone(color: number = this.palette.stone): THREE.MeshToonMaterial {
    return this.textured(stoneTexture(), lighten(color, 1.45));
  }

  /** Lime plaster for walls. */
  plaster(color = 0xe8d4b0): THREE.MeshToonMaterial {
    return this.textured(plasterTexture(), color);
  }

  /** Roof shingles. */
  shingle(color: number = this.palette.roof): THREE.MeshToonMaterial {
    return this.textured(shingleTexture(), lighten(color, 1.4));
  }

  straw(color = 0xd9b45a): THREE.MeshToonMaterial {
    return this.textured(strawTexture(), color);
  }

  /** Burlap, canvas and homespun cloth. */
  weave(color: number): THREE.MeshToonMaterial {
    return this.textured(weaveTexture(), lighten(color, 1.1));
  }

  /** Wrought iron: dark, with a cool sheen from the rim light. */
  metal(color = 0x34303a): THREE.MeshToonMaterial {
    return this.character(color);
  }

  /** Any painted surface (signs, banners, rugs). Double-sided for cloth. */
  painted(map: THREE.Texture, doubleSided = false): THREE.MeshToonMaterial {
    return this.memo(`painted:${map.uuid}:${doubleSided}`, () => new THREE.MeshToonMaterial({ map, gradientMap: this.gradient, side: doubleSided ? THREE.DoubleSide : THREE.FrontSide }));
  }

  /** Ink outline shell that expands along smoothed normals (see `withOutlineNormals`). */
  inkShell(width: number): THREE.ShaderMaterial | THREE.MeshBasicMaterial {
    return this.memo(`ink:${width}`, () => {
      const mat = new THREE.MeshBasicMaterial({ color: this.palette.ink, side: THREE.BackSide });
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.outlineWidth = { value: width };
        shader.vertexShader = `attribute vec3 outlineNormal;\nuniform float outlineWidth;\n${shader.vertexShader}`.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\ntransformed += normalize(outlineNormal) * outlineWidth;',
        );
      };
      mat.customProgramCacheKey = () => `eotr-ink-${width}`;
      return mat;
    });
  }

  /** Start a new merged prop. */
  kit(outlineWidth = 0.035): Assembly {
    return new Assembly((w) => this.inkShell(w), outlineWidth);
  }

  /** A character part: all colours baked into vertices, one rim-lit material, one draw call (+ outline). */
  figureKit(outlineWidth = 0.035): Assembly {
    return new Assembly((w) => this.inkShell(w), outlineWidth, this.characterVC());
  }

  /** Rim-lit cel material driven by vertex colours (see `figureKit`). */
  characterVC(): THREE.MeshToonMaterial {
    return this.memo('char-vc', () => {
      const m = this.character(0xffffff).clone();
      m.vertexColors = true;
      m.onBeforeCompile = this.character(0xffffff).onBeforeCompile;
      m.customProgramCacheKey = () => 'eotr-rim-vc';
      return m;
    });
  }

  /** Toon plus a stepped rim light: for characters and Familiars. Optional painted map (cloth, hair). */
  character(color: number, map?: THREE.Texture): THREE.MeshToonMaterial {
    return this.memo(`char:${color}:${map?.uuid ?? ''}`, () => {
      const m = new THREE.MeshToonMaterial({ color, gradientMap: this.gradient, map: map ?? null });
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
  glow(color: number, power = 2.2, opacity = 1, map?: THREE.Texture): THREE.MeshBasicMaterial {
    return this.memo(`glow:${color}:${power}:${opacity}:${map?.uuid ?? ''}`, () => {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), toneMapped: false, transparent: opacity < 1, opacity, map: map ?? null });
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

/** Brighten a colour (textures are mid-grey patterns, so tints need a lift). */
function lighten(c: number, k: number): number {
  return new THREE.Color(c).multiplyScalar(k).getHex();
}
