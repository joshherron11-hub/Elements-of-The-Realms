import * as THREE from 'three';

/**
 * Presentation layer bootstrap (Three.js).
 *
 * The stage only draws. It reads simulation state, but never mutates it and
 * never owns gameplay rules. Swapping the renderer later must not touch
 * /src/core or any simulation module.
 *
 * Art direction target: CHROMATIC MYTHIC 2.5D — high-contrast autumn palette,
 * strong silhouettes, cel-style toon shading, layered painterly depth.
 * Everything here is an original placeholder.
 */
export interface Stage {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  start(onFrame?: (dtMs: number) => void): void;
  dispose(): void;
}

/** Fallback palette; the Realm's art direction metadata overrides it. */
export const PALETTE = {
  sky: 0x2b1b2e,
  fog: 0x4a2a2a,
  ground: 0x6b4a2b,
  ember: 0xd9642b,
  gold: 0xe8b04a,
  moss: 0x5d6b3a,
  stone: 0x55505a,
  ink: 0x120c0c,
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

/** A 3-step gradient map gives the flat, cel-shaded look. */
function toonGradient(): THREE.DataTexture {
  const data = new Uint8Array([90, 170, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

export function createStage(container: HTMLElement, palette: Palette = PALETTE): Stage {
  const P = palette;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(P.sky);
  scene.fog = new THREE.Fog(P.fog, 40, 110);

  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 200);
  camera.position.set(0, 20, 38);
  camera.lookAt(0, 3, -4);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const gradientMap = toonGradient();
  const toon = (color: number) => new THREE.MeshToonMaterial({ color, gradientMap });

  scene.add(new THREE.HemisphereLight(0xffd9a8, 0x2a1a20, 0.9));
  const sun = new THREE.DirectionalLight(0xffb070, 1.6);
  sun.position.set(-12, 20, 8);
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 48), toon(P.ground));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Placeholder silhouettes: a keep and a ring of autumn trees.
  const keep = new THREE.Mesh(new THREE.BoxGeometry(6, 10, 6), toon(P.stone));
  keep.position.set(0, 5, -18);
  scene.add(keep);
  const tower = new THREE.Mesh(new THREE.ConeGeometry(4.4, 5, 4), toon(P.ink));
  tower.position.set(0, 12.5, -18);
  tower.rotation.y = Math.PI / 4;
  scene.add(tower);

  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = 20 + (i % 3) * 3;
    const tree = new THREE.Mesh(new THREE.ConeGeometry(1.6, 4.5, 6), toon(i % 2 ? P.ember : P.gold));
    tree.position.set(Math.cos(a) * r, 2.25, Math.sin(a) * r);
    scene.add(tree);
  }

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
    start(onFrame) {
      renderer.setAnimationLoop((t) => {
        const dt = Math.min(t - last, 100);
        last = t;
        onFrame?.(dt);
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
