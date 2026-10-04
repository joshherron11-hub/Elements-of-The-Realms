import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Lighting } from './lighting';
import { QUALITY, type GraphicsQuality, type QualitySettings } from './quality';

/**
 * Presentation layer bootstrap (Three.js).
 *
 * The stage only draws. It reads simulation state, but never mutates it and
 * never owns gameplay rules. Swapping the renderer later must not touch any
 * simulation module.
 *
 * Art direction: CHROMATIC MYTHIC 2.5D (see the Realm's presentation data):
 * a warm key light against cool violet fill, a painted gradient sky, layered
 * fog, an elevated three-quarter camera, and (HIGH preset) soft real-time
 * shadows with bloom reserved for over-bright lights.
 */

/** Fallback palette; the Realm's art direction metadata overrides it. */
export const PALETTE = {
  sky: 0x2b1b2e,
  skyHorizon: 0x7a3b2e,
  fog: 0x4a2a2a,
  ground: 0x6b4a2b,
  path: 0x9a7a52,
  ember: 0xd9642b,
  gold: 0xe8b04a,
  crimson: 0xa3302a,
  moss: 0x5d6b3a,
  stone: 0x55505a,
  timber: 0x5a3a24,
  roof: 0x7d2e22,
  ink: 0x120c0c,
  light: 0xffd9a8,
  /** Dusty autumn grass. */
  meadow: 0x6a6633,
  /** Weathered cobbles: cooler than the earth so walkways separate from ground. */
  cobble: 0x9c907e,
};

export type Palette = typeof PALETTE;

/** Read a Realm's `presentation.artDirection.palette` (hex strings) over the fallback. */
export function paletteFrom(presentation: Record<string, unknown> | undefined): Palette {
  const art = presentation?.artDirection as { palette?: Record<string, string> } | undefined;
  const out = { ...PALETTE };
  for (const key of Object.keys(out) as (keyof Palette)[]) {
    const hex = art?.palette?.[key];
    if (typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex)) out[key] = parseInt(hex.slice(1), 16);
  }
  return out;
}

export interface Stage {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly settings: QualitySettings;
  /** Replace the current section's content. `bounds` is the half-size of the walkable area. */
  setContent(group: THREE.Group, opts: { interior: boolean; bounds: [number, number] }): void;
  /** Apply time-of-day lighting (exteriors). Interiors keep their warm hearth light. */
  applyLighting(light: Lighting): void;
  /** Elevated three-quarter follow camera. */
  follow(target: THREE.Vector3, dtMs: number): void;
  /** Player zoom, 0.7 (close) … 1.4 (far). */
  zoom(factor: number): void;
  readonly zoomLevel: number;
  setQuality(q: GraphicsQuality): void;
  start(onFrame: (dtMs: number) => void): void;
  dispose(): void;
}

/** Sky dome with a painted vertical gradient; drawn behind everything, ignores fog. */
function skyDome(): { mesh: THREE.Mesh; top: THREE.Color; horizon: THREE.Color; bottom: THREE.Color } {
  const top = new THREE.Color();
  const horizon = new THREE.Color();
  const bottom = new THREE.Color();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: top }, horizon: { value: horizon }, bottom: { value: bottom } },
    vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 c = h > 0.0 ? mix(horizon, top, smoothstep(0.0, 0.55, h)) : mix(horizon, bottom, smoothstep(0.0, 0.25, -h));
        // A warm haze band right at the horizon, like a painted backdrop.
        c += horizon * 0.18 * (1.0 - smoothstep(0.0, 0.12, abs(h)));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(260, 24, 12), mat);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return { mesh, top, horizon, bottom };
}

export function createStage(container: HTMLElement, P: Palette = PALETTE, quality: GraphicsQuality = 'high'): Stage {
  let settings = QUALITY[quality];
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, Math.max(0.1, container.clientWidth / Math.max(1, container.clientHeight)), 0.1, 600);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = settings.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'none';
  container.appendChild(canvas);

  // Warm key light, cool violet fill from below: the core of the look.
  const hemi = new THREE.HemisphereLight(0xffe2c0, 0x3c3a66, 1.1);
  const sun = new THREE.DirectionalLight(0xffb070, 1.7);
  const sunOffset = new THREE.Vector3(-16, 26, 12);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  const sc = sun.shadow.camera;
  sc.left = -26;
  sc.right = 26;
  sc.top = 26;
  sc.bottom = -26;
  sc.near = 1;
  sc.far = 90;
  scene.add(hemi, sun, sun.target);
  const sky = skyDome();
  scene.add(sky.mesh);

  let composer: EffectComposer | undefined;
  let bloom: UnrealBloomPass | undefined;

  let content: THREE.Group | undefined;
  let interior = false;
  let bounds: [number, number] = [40, 40];
  let zoomLevel = 1;
  const lookAt = new THREE.Vector3();
  const focus = new THREE.Vector3();
  let first = true;

  const size = () => [Math.max(1, container.clientWidth), Math.max(1, container.clientHeight)] as const;

  const applySettings = () => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.maxPixelRatio));
    sun.castShadow = settings.shadows;
    if (settings.shadows) sun.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
    if (renderer.shadowMap.enabled !== settings.shadows) {
      renderer.shadowMap.enabled = settings.shadows;
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (m) for (const mat of Array.isArray(m) ? m : [m]) mat.needsUpdate = true;
      });
    }
    if (sun.shadow.map) {
      sun.shadow.map.dispose();
      sun.shadow.map = null as never;
    }
    if (settings.bloom && !composer) {
      const [w, h] = size();
      composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 }));
      composer.addPass(new RenderPass(scene, camera));
      // Threshold above 1: only the over-bright glow materials bloom.
      bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.55, 0.45, 1.0);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
    }
    onResize();
  };

  const onResize = () => {
    const [w, h] = size();
    camera.aspect = w / h;
    // Portrait screens see less width: open the lens a little so the scene still reads.
    camera.fov = camera.aspect < 1 ? 46 : 36;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer?.setPixelRatio(renderer.getPixelRatio());
    composer?.setSize(w, h);
  };
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : undefined;
  observer?.observe(container);
  applySettings();

  /** Camera offset for the current screen shape, section kind and zoom. */
  const offset = (): THREE.Vector3 => {
    const portrait = camera.aspect < 1;
    const pitch = THREE.MathUtils.degToRad(interior ? 54 : 39);
    const dist = (interior ? 18.5 : 21) * (portrait ? 1.22 : 1) * zoomLevel;
    return new THREE.Vector3(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist);
  };

  let last = performance.now();
  const stage: Stage = {
    scene,
    camera,
    renderer,
    get settings() {
      return settings;
    },
    get zoomLevel() {
      return zoomLevel;
    },
    setContent(group, opts) {
      if (content) {
        scene.remove(content);
        content.traverse((o) => {
          if (o instanceof THREE.Mesh) o.geometry.dispose();
        });
      }
      content = group;
      interior = opts.interior;
      bounds = opts.bounds;
      first = true;
      scene.add(group);
      if (interior) {
        const dark = new THREE.Color(0x1d120d);
        sky.top.copy(dark);
        sky.horizon.copy(dark);
        sky.bottom.copy(dark);
        scene.fog = new THREE.Fog(0x1d120d, 20, 46);
        hemi.color.setHex(0xffc890);
        hemi.groundColor.setHex(0x2a2440);
        hemi.intensity = 0.55;
        sun.color.setHex(0xffb878);
        sun.intensity = 0.55;
      } else {
        scene.fog = new THREE.Fog(P.fog, 36, 120);
        hemi.color.setHex(0xffe2c0);
        hemi.groundColor.setHex(0x3c3a66);
      }
    },
    applyLighting(light) {
      if (interior) return;
      sky.top.setHex(light.sky);
      sky.horizon.setHex(light.fog).lerp(new THREE.Color(light.sunColor), 0.25);
      sky.bottom.setHex(light.fog);
      (scene.fog as THREE.Fog).color.setHex(light.fog);
      sun.color.setHex(light.sunColor);
      sun.intensity = light.sunIntensity;
      // Fill stays low so the warm key light and the cool shadow side both read.
      hemi.intensity = light.hemiIntensity * 0.72;
    },
    follow(target, dtMs) {
      // Frame the player low-centre so the view looks ahead, and keep the frame inside the section.
      const [bx, bz] = bounds;
      const margin = interior ? 3 : 6;
      focus.set(
        THREE.MathUtils.clamp(target.x, -bx + margin, bx - margin),
        target.y + 1.1,
        THREE.MathUtils.clamp(target.z - (interior ? 0.6 : 1.6), -bz + margin, bz - margin),
      );
      if (interior) {
        // Small rooms: stay centred enough that walls never fill the frame.
        focus.x = THREE.MathUtils.lerp(focus.x, 0, 0.35);
        focus.z = THREE.MathUtils.lerp(focus.z, 0, 0.25);
      }
      const desired = focus.clone().add(offset());
      const k = first ? 1 : 1 - Math.exp(-dtMs / 160);
      first = false;
      camera.position.lerp(desired, k);
      lookAt.lerp(focus, k);
      camera.lookAt(lookAt);
      sky.mesh.position.copy(camera.position);
      // Shadows follow the player.
      sun.target.position.copy(focus);
      sun.position.copy(focus).add(sunOffset);
    },
    zoom(factor) {
      zoomLevel = THREE.MathUtils.clamp(factor, 0.7, 1.4);
    },
    setQuality(q) {
      settings = QUALITY[q];
      applySettings();
    },
    start(onFrame) {
      renderer.setAnimationLoop((t) => {
        const dt = Math.min(t - last, 100);
        last = t;
        onFrame(dt);
        if (settings.bloom && composer) composer.render(dt / 1000);
        else renderer.render(scene, camera);
      });
    },
    dispose() {
      renderer.setAnimationLoop(null);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      observer?.disconnect();
      composer?.dispose();
      renderer.dispose();
    },
  };
  return stage;
}
