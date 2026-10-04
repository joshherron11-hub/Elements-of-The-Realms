import * as THREE from 'three';
import type { Materials } from '../materials';
import { cluster, jitter, lathe, matrixOf, ribbed, slab, type Place } from './geo';

/**
 * SCENE INSTANCER — object reuse for small, repeated goods.
 *
 * Every apple, pear, cabbage, carrot, loaf, cheese, bottle, jar, tankard and
 * small pumpkin in a section shares one geometry per kind and is drawn as one
 * InstancedMesh per kind, tinted per instance. A market full of produce costs
 * about ten draw calls in total, however many stalls and crates show it.
 */
export const GOODS = ['apple', 'pear', 'cabbage', 'carrot', 'loaf', 'roll', 'pie', 'cheese', 'bottle', 'jar', 'jug', 'tankard', 'gourd', 'bolt', 'fish', 'egg'] as const;
export type Good = (typeof GOODS)[number];

/** Default tints per kind; a placement may override. */
const TINT: Record<Good, number> = {
  apple: 0xb8322a, pear: 0xb8b04a, cabbage: 0x7a9a4a, carrot: 0xd9742b, loaf: 0xc08a4a, roll: 0xd0a060, pie: 0xc8904a,
  cheese: 0xe8c45a, bottle: 0x3f6b4a, jar: 0x3f6b8a, jug: 0xb06a42, tankard: 0x9a7650, gourd: 0xd9642b, bolt: 0xa3302a,
  fish: 0x9aa8b0, egg: 0xf3ead8,
};

function geometryFor(kind: Good): THREE.BufferGeometry {
  switch (kind) {
    case 'apple': {
      const g = lathe([[0, 0.01], [0.06, 0.0], [0.095, 0.05], [0.09, 0.11], [0.04, 0.15], [0, 0.13]], 9);
      return g;
    }
    case 'pear':
      return lathe([[0, 0], [0.07, 0.01], [0.09, 0.06], [0.06, 0.14], [0.04, 0.2], [0.0, 0.22]], 9);
    case 'cabbage':
      return cluster([[0, 0.12, 0, 0.13], [0.07, 0.09, 0.04, 0.09], [-0.07, 0.09, -0.03, 0.09], [0.0, 0.08, -0.08, 0.09]], 3);
    case 'carrot': {
      const g = lathe([[0.0, -0.28], [0.03, -0.18], [0.045, 0], [0.0, 0.02]], 6);
      g.rotateZ(Math.PI / 2);
      g.translate(0, 0.04, 0);
      return g;
    }
    case 'loaf': {
      const g = jitter(new THREE.SphereGeometry(0.15, 10, 6).scale(1.5, 0.65, 1), 0.015, 4);
      g.translate(0, 0.08, 0);
      return g;
    }
    case 'roll':
      return lathe([[0, 0], [0.08, 0], [0.09, 0.04], [0.06, 0.08], [0, 0.09]], 9);
    case 'pie':
      return lathe([[0, 0], [0.17, 0], [0.19, 0.05], [0.17, 0.07], [0.1, 0.08], [0, 0.085]], 14);
    case 'cheese':
      return lathe([[0, 0], [0.19, 0], [0.21, 0.04], [0.21, 0.1], [0.19, 0.14], [0, 0.14]], 14);
    case 'bottle':
      return lathe([[0, 0], [0.07, 0], [0.08, 0.16], [0.035, 0.24], [0.028, 0.33], [0.035, 0.35], [0, 0.35]], 9);
    case 'jar':
      return lathe([[0, 0], [0.09, 0], [0.12, 0.07], [0.11, 0.18], [0.065, 0.23], [0.075, 0.26], [0, 0.26]], 10);
    case 'jug':
      return lathe([[0, 0], [0.1, 0], [0.14, 0.1], [0.12, 0.22], [0.06, 0.3], [0.07, 0.34], [0, 0.34]], 10);
    case 'tankard':
      return lathe([[0, 0], [0.09, 0], [0.1, 0.02], [0.09, 0.2], [0.1, 0.22], [0, 0.22]], 10);
    case 'gourd':
      return ribbed(lathe([[0, 0], [0.1, 0.01], [0.15, 0.07], [0.12, 0.14], [0, 0.16]], 12), 8, 0.08);
    case 'bolt': {
      const g = lathe([[0.1, -0.35], [0.11, -0.33], [0.11, 0.33], [0.1, 0.35]], 10);
      g.rotateZ(Math.PI / 2);
      g.translate(0, 0.1, 0);
      return g;
    }
    case 'fish': {
      const g = slab([[-0.2, 0], [-0.05, 0.06], [0.12, 0.03], [0.2, 0.07], [0.2, -0.07], [0.12, -0.03], [-0.05, -0.06]], 0.05);
      g.rotateX(-Math.PI / 2);
      g.translate(0, 0.03, 0);
      return g;
    }
    case 'egg':
      return lathe([[0, 0], [0.035, 0.01], [0.045, 0.04], [0.035, 0.08], [0, 0.09]], 8);
  }
}

export class SceneInstancer {
  private readonly batches = new Map<Good, { matrices: THREE.Matrix4[]; colors: number[] }>();
  private base = new THREE.Matrix4();

  /** Placements that follow are relative to this transform (the prop's place in the section). */
  begin(base: THREE.Matrix4): void {
    this.base = base;
  }

  add(kind: Good, at: Place = {}, color?: number): void {
    const b = this.batches.get(kind) ?? { matrices: [], colors: [] };
    b.matrices.push(this.base.clone().multiply(matrixOf(at)));
    b.colors.push(color ?? TINT[kind]);
    this.batches.set(kind, b);
  }

  get count(): number {
    let n = 0;
    for (const b of this.batches.values()) n += b.matrices.length;
    return n;
  }

  /** One InstancedMesh per kind, with per-instance tint. */
  build(m: Materials): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    const white = m.toon(0xffffff);
    const color = new THREE.Color();
    for (const [kind, b] of this.batches) {
      const mesh = new THREE.InstancedMesh(geometryFor(kind), white, b.matrices.length);
      b.matrices.forEach((mat, i) => {
        mesh.setMatrixAt(i, mat);
        mesh.setColorAt(i, color.setHex(b.colors[i]!));
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `goods:${kind}`;
      out.push(mesh);
    }
    return out;
  }
}
