import * as THREE from 'three';
import { softDisc } from './textures';

/**
 * The animation rig shared by people, Familiars and animals.
 *
 * A figure is a root group (world position + facing) holding a soft ground
 * shadow and a `rig` group (the pose). Animation only moves the rig and its
 * joints, so the shadow stays on the ground whatever the pose.
 */
export interface Rig {
  rig: THREE.Group;
  head?: THREE.Object3D;
  armL?: THREE.Object3D;
  armR?: THREE.Object3D;
  /** Elbow pivots (people). */
  foreL?: THREE.Object3D;
  foreR?: THREE.Object3D;
  legL?: THREE.Object3D;
  legR?: THREE.Object3D;
  tail?: THREE.Object3D;
  /** Four-legged: diagonal pairs [0,1] and [2,3] move together (a trot). */
  legs?: THREE.Object3D[];
  wings?: THREE.Object3D[];
  ears?: THREE.Object3D[];
  /** Jaw / lower beak (opens to bark, caw or pant). */
  jaw?: THREE.Object3D;
  /** Shown only while eating (a bowl). */
  bowl?: THREE.Object3D;
  tongue?: THREE.Object3D;
  kind: 'person' | 'hound' | 'moth' | 'raven' | 'animal';
  idle?: string;
  seed: number;
}

export type FamiliarAction = 'eat' | 'bond' | 'rest' | 'sit' | 'none';

export interface PoseInput {
  /** Seconds (presentation clock). */
  t: number;
  /** Seconds since the last frame (for smoothing); defaults to 1/60. */
  dt?: number;
  /** 0 = standing, 1 = full walk, >1 = run. */
  walk: number;
  sleeping?: boolean;
  seated?: boolean;
  /** Turned towards someone and chatting. */
  talking?: boolean;
  /** Head turn relative to the body (radians), e.g. to watch the player. */
  look?: number;
  /** Turning on the spot this frame (radians); small steps play while it is large. */
  turn?: number;
  /** Familiar: nose down. */
  sniff?: boolean;
  /** Familiar: delighted (after care). 0…1, fades. */
  joy?: number;
  /** Familiar: a care action in progress, with progress 0…1. */
  action?: FamiliarAction;
  actionT?: number;
}

export function shadowDisc(radius: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: softDisc(), color: 0x120a14, transparent: true, opacity: 0.45, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  m.renderOrder = 1;
  m.name = 'blob-shadow';
  return m;
}

export function rigOf(g: THREE.Object3D): Rig | undefined {
  return g.userData.rig as Rig | undefined;
}

/** Move a joint's rotation towards a target with exponential smoothing. */
export function ease(o: THREE.Object3D | undefined, axis: 'x' | 'y' | 'z', target: number, k: number): void {
  if (!o) return;
  o.rotation[axis] += (target - o.rotation[axis]) * k;
}

/** Shortest signed angle from a to b. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Turn an object's facing towards a yaw at a limited speed (radians/second).
 * Returns how far it turned this frame, so the pose can play turning steps.
 */
export function turnToward(o: THREE.Object3D, yaw: number, dtSec: number, speed = 7): number {
  const d = angleDelta(o.rotation.y, yaw);
  const step = Math.sign(d) * Math.min(Math.abs(d), speed * dtSec);
  o.rotation.y += step;
  return step;
}
