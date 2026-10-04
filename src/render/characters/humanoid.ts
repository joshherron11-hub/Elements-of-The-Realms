import * as THREE from 'three';
import { shadowDisc, type PoseInput } from '../rig';
import type { HumanoidAsset } from './library';
import { humanoidMaterial, skinnedInk, type Rim } from './material';
import type { HumanoidPalette } from './palette';

/**
 * HUMANOID — a rigged, skinned character built from the shared asset.
 *
 * Presentation only: it is attached to an existing NPC (or the player) and
 * reads the same pose input as the old figures. Animation is a clip library
 * played through an AnimationMixer with cross-fades; head look is layered on
 * top procedurally. Combat or other new clips only need adding to the asset
 * and to `chooseClip`.
 */
export const CLIPS = ['idle', 'walk', 'run', 'turn', 'talk', 'interact', 'sit', 'carry', 'work', 'celebrate', 'sleep'] as const;
export type ClipName = (typeof CLIPS)[number];
/** Gestures that game code can ask for explicitly (they override idle/talk while set). */
export type Gesture = 'interact' | 'carry' | 'work' | 'celebrate';

/** Model height in metres (asset space); characters are scaled to their look's height. */
export const MODEL_HEIGHT = 1.78;
/**
 * Readability at the gameplay camera (~21 units out, pitched down): a little
 * larger and broader than the look's nominal height, with a slightly larger
 * head. Stylized, not realistic.
 */
export const STYLE = { scale: 1.16, breadth: 1.1, head: 1.12 };

export interface HumanoidSpec {
  parts: string[];
  palette: HumanoidPalette;
  /** World height of the character. */
  height: number;
  /** LOD switch distances in world units (level 1, level 2). */
  lodDistances?: [number, number];
  outline?: { color: number; width: number };
  castShadow?: boolean;
  /** Soft blob shadow under the feet (default on; off for headless tests). */
  groundShadow?: boolean;
  rim?: Rim;
}

export interface HumanoidRig {
  kind: 'humanoid';
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  bones: Map<string, THREE.Bone>;
  current?: string;
  material: THREE.Material;
  lod: THREE.LOD;
  seed: number;
  gesture?: Gesture;
  /** Smoothed head look (radians). */
  look: number;
}

const bone = (r: HumanoidRig, name: string) => r.bones.get(name) ?? r.bones.get(name.replace('.', ''));

export function createHumanoid(asset: HumanoidAsset, spec: HumanoidSpec, seed = 1): THREE.Group {
  const root = new THREE.Group();
  root.name = 'humanoid';
  const body = new THREE.Group();
  const k = (spec.height / MODEL_HEIGHT) * STYLE.scale;
  body.scale.set(k * STYLE.breadth, k, k * STYLE.breadth);
  root.add(body);
  const { armature, skeleton, bones } = asset.instantiate();
  body.add(armature);
  const material = humanoidMaterial(spec.palette, spec.rim);
  const ink = spec.outline ? skinnedInk(spec.outline.color, spec.outline.width) : undefined;
  const lod = new THREE.LOD();
  const [d1, d2] = spec.lodDistances ?? [34, 60];
  const dist = [0, d1, d2];
  for (let i = 0; i < asset.lodCount; i++) {
    const level = new THREE.Group();
    const geo = asset.geometry(spec.parts, i);
    const mesh = asset.skinned(geo, material, skeleton);
    mesh.castShadow = spec.castShadow ?? true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false; // bounds are rest-pose; the parent LOD is culled by position instead
    level.add(mesh);
    if (ink && i < 2) {
      const shell = asset.skinned(geo, ink, skeleton);
      shell.frustumCulled = false;
      level.add(shell);
    }
    lod.addLevel(level, dist[i] ?? d2 * (i - 1));
  }
  (asset.meshUnderArmature ? armature : body).add(lod);
  if (spec.groundShadow !== false) root.add(shadowDisc(0.36 * spec.height * STYLE.scale));
  const mixer = new THREE.AnimationMixer(armature);
  const actions = new Map<string, THREE.AnimationAction>();
  for (const [name, clip] of asset.clips) {
    const a = mixer.clipAction(clip);
    if (name === 'interact' || name === 'celebrate') a.setLoop(THREE.LoopRepeat, Infinity);
    actions.set(name, a);
  }
  const rig: HumanoidRig = { kind: 'humanoid', mixer, actions, bones, material, lod, seed: Math.abs(seed % 97) / 97, look: 0 };
  root.userData.humanoid = rig;
  play(rig, 'idle', 0);
  mixer.update((seed % 50) / 10); // desynchronise idle breathing between characters
  return root;
}

export function humanoidOf(o: THREE.Object3D): HumanoidRig | undefined {
  return o.userData.humanoid as HumanoidRig | undefined;
}

function play(r: HumanoidRig, name: string, fade: number): void {
  if (r.current === name) return;
  const next = r.actions.get(name) ?? r.actions.get('idle');
  if (!next) return;
  const prev = r.current ? r.actions.get(r.current) : undefined;
  next.reset();
  next.enabled = true;
  next.setEffectiveWeight(1);
  next.play();
  if (prev && prev !== next && fade > 0) prev.crossFadeTo(next, fade, false);
  else if (prev && prev !== next) prev.stop();
  r.current = name;
}

/** Which clip a pose asks for. */
export function chooseClip(p: PoseInput, gesture?: Gesture): { clip: ClipName; speed: number } {
  if (p.sleeping) return { clip: 'sleep', speed: 1 };
  if (p.seated) return { clip: 'sit', speed: 1 };
  if (p.walk > 1.05) return { clip: 'run', speed: Math.min(1.25, p.walk / 1.4) };
  if (p.walk > 0.05) return { clip: gesture === 'carry' ? 'carry' : 'walk', speed: Math.max(0.55, Math.min(1.2, p.walk)) };
  if (Math.abs(p.turn ?? 0) > 0.012) return { clip: 'turn', speed: 1 };
  if (gesture && gesture !== 'carry') return { clip: gesture, speed: 1 };
  if (p.talking) return { clip: 'talk', speed: 1 };
  if (gesture === 'carry') return { clip: 'carry', speed: 0 };
  return { clip: 'idle', speed: 1 };
}

const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

/** Pose a humanoid for this frame. Visual only. */
export function animateHumanoid(root: THREE.Object3D, p: PoseInput): void {
  const r = humanoidOf(root);
  if (!r) return;
  const dt = Math.min(0.1, p.dt ?? 1 / 60);
  const { clip, speed } = chooseClip(p, r.gesture);
  const fade = clip === 'walk' || clip === 'run' || r.current === 'walk' || r.current === 'run' ? 0.22 : 0.35;
  play(r, clip, fade);
  const a = r.actions.get(r.current ?? 'idle');
  if (a) a.timeScale = speed;
  r.mixer.update(dt);
  bone(r, 'head')?.scale.setScalar(STYLE.head);
  // Head look on top of the clip: most of the turn in the head, some in the neck.
  const target = p.sleeping || p.seated ? 0 : Math.max(-0.9, Math.min(0.9, p.look ?? 0));
  r.look += (target - r.look) * Math.min(1, dt * 6);
  if (Math.abs(r.look) > 1e-3) {
    const head = bone(r, 'head');
    const neck = bone(r, 'neck');
    for (const [b, k] of [[neck, 0.35], [head, 0.65]] as const) {
      if (!b) continue;
      // Rotate about the world's up axis expressed in the bone's parent space.
      _q.setFromAxisAngle(_up, r.look * k);
      const parentWorld = b.parent ? b.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
      const rootWorld = root.getWorldQuaternion(new THREE.Quaternion());
      const local = parentWorld.clone().invert().multiply(rootWorld).multiply(_q).multiply(rootWorld.clone().invert()).multiply(parentWorld);
      b.quaternion.premultiply(local);
    }
  }
}
