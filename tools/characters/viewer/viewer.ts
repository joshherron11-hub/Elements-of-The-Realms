import * as THREE from 'three';
import { CharacterLibrary } from '../../../src/render/characters/library';
import { animateHumanoid, createHumanoid, humanoidOf } from '../../../src/render/characters/humanoid';
import { paletteFromLook } from '../../../src/render/characters/palette';
import { parseLooks } from '../../../src/render/looks';
import looksJson from '../../../realms/happy-fall/looks/blackmere.json';

/**
 * Dev-only character viewer (npm run dev, then open /tools/characters/viewer/).
 * Query: look=actor_pip-ashdown  yaw dist y pitch fov  clip=walk  t=0.4 (seconds into the clip)  lod=0  parts=a,b
 */
const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6a6476);
const cam = new THREE.PerspectiveCamera(num('fov', 30), innerWidth / innerHeight, 0.05, 200);
const yaw = num('yaw', 0.4), dist = num('dist', 7), ty = num('y', 1.25), pitch = num('pitch', 0.15);
cam.position.set(Math.sin(yaw) * dist * Math.cos(pitch), ty + Math.sin(pitch) * dist, Math.cos(yaw) * dist * Math.cos(pitch));
cam.lookAt(0, ty, 0);
scene.add(new THREE.HemisphereLight(0xbcc2ee, 0x4a3c50, 1.3));
const sun = new THREE.DirectionalLight(0xffe2b8, 2.4);
sun.position.set(3, 6, 4);
sun.castShadow = true;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.CircleGeometry(3, 32), new THREE.MeshLambertMaterial({ color: 0x7a6a50 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const looks = parseLooks(looksJson);
if (!looks.ok) throw new Error(looks.error.message);
const look = looks.value.people[q.get('look') ?? 'actor_pip-ashdown']!;
const lib = new CharacterLibrary({ 'blackmere-humanoid': '/assets/characters/blackmere-humanoid.glb' });
const info = document.getElementById('info')!;
lib.load('blackmere-humanoid').then((asset) => {
  if (!asset) throw new Error('no asset');
  const parts = q.get('parts')?.split(',') ?? ['body_base', 'head_a', 'eyes_a', 'brows_a', 'hands_base', 'hair_tousled', 'hat_flatcap', 'top_tunic', 'over_vest', 'belt_plain', 'bottoms_trousers', 'boots_cuffed', 'neck_scarf', 'bag_satchel'];
  const lod = num('lod', 0);
  const fig = createHumanoid(asset, { parts, palette: paletteFromLook(look), height: num('h', 2.15), lodDistances: lod ? [0.001, lod > 1 ? 0.002 : 999] : [999, 999], outline: q.has('ink') ? { color: 0x1a1020, width: num('ink', 0.008) } : undefined }, 3);
  scene.add(fig);
  const clip = q.get('clip') ?? 'idle';
  const r = humanoidOf(fig)!;
  const pose = { t: 0, dt: 0, walk: clip === 'walk' ? 1 : clip === 'run' ? 1.4 : 0, talking: clip === 'talk', seated: clip === 'sit', sleeping: clip === 'sleep', turn: clip === 'turn' ? 0.05 : 0, look: num('look', 0) };
  if (['interact', 'carry', 'work', 'celebrate'].includes(clip)) r.gesture = clip as 'work';
  r.mixer.stopAllAction();
  r.current = undefined;
  animateHumanoid(fig, { ...pose, dt: 0 });
  const a = r.actions.get(r.current ?? '');
  if (a) a.time = num('t', 0);
  r.mixer.update(0);
  animateHumanoid(fig, { ...pose, dt: 0 });
  info.textContent = `tris lod${lod}: ${asset.triangles(parts, lod)}  clips: ${[...asset.clips.keys()].join(' ')}  bones: ${asset.boneNames.length}`;
  renderer.render(scene, cam);
  (window as unknown as { ready: boolean; info: string }).info = info.textContent;
  (window as unknown as { ready: boolean }).ready = true;
});
