import * as THREE from 'three';

/**
 * Presentation layer bootstrap (Three.js).
 *
 * The stage only draws. It reads simulation state, but never mutates it and
 * never owns gameplay rules. Swapping the renderer later must not touch any
 * simulation module.
 *
 * Art direction: CHROMATIC MYTHIC 2.5D (see the Realm's presentation data).
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
  /** Replace the current section's content. */
  setContent(group: THREE.Group, opts: { interior: boolean }): void;
  /** Elevated three-quarter follow camera. */
  follow(target: THREE.Vector3, dtMs: number): void;
  start(onFrame: (dtMs: number) => void): void;
  dispose(): void;
}

export function createStage(container: HTMLElement, P: Palette = PALETTE): Stage {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.1, 300);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(P.light, P.sky, 1.1);
  const sun = new THREE.DirectionalLight(0xffb070, 1.7);
  sun.position.set(-14, 24, 10);
  scene.add(hemi, sun);

  let content: THREE.Group | undefined;
  let interior = false;
  const offsetOut = new THREE.Vector3(0, 17, 14);
  const offsetIn = new THREE.Vector3(0, 11, 8.5);
  const lookAt = new THREE.Vector3();

  const onResize = () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };
  window.addEventListener('resize', onResize);

  let last = performance.now();
  return {
    scene,
    camera,
    renderer,
    setContent(group, opts) {
      if (content) {
        scene.remove(content);
        content.traverse((o) => {
          if (o instanceof THREE.Mesh) o.geometry.dispose();
        });
      }
      content = group;
      interior = opts.interior;
      scene.add(group);
      scene.background = new THREE.Color(interior ? P.ink : P.sky);
      scene.fog = interior ? new THREE.Fog(P.ink, 18, 40) : new THREE.Fog(P.fog, 38, 110);
      hemi.intensity = interior ? 0.75 : 1.1;
    },
    follow(target, dtMs) {
      const desired = target.clone().add(interior ? offsetIn : offsetOut);
      const k = 1 - Math.exp(-dtMs / 140);
      camera.position.lerp(desired, k);
      lookAt.lerp(target.clone().add(new THREE.Vector3(0, 1, 0)), k);
      camera.lookAt(lookAt);
    },
    start(onFrame) {
      renderer.setAnimationLoop((t) => {
        const dt = Math.min(t - last, 100);
        last = t;
        onFrame(dt);
        renderer.render(scene, camera);
      });
    },
    dispose() {
      renderer.setAnimationLoop(null);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    },
  };
}
