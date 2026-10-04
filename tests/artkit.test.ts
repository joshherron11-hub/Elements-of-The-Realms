import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Assembly, board, jitter, lathe, projectUv, withOutlineNormals } from '../src/render/kit/geo';

/** The art kit is presentation only, but its geometry rules keep props cheap and crack-free. */
describe('art kit geometry', () => {
  it('merges every part that shares a material into one mesh, plus one outline shell', () => {
    const wood = new THREE.MeshBasicMaterial();
    const iron = new THREE.MeshBasicMaterial();
    const a = new Assembly(() => new THREE.MeshBasicMaterial(), 0.03);
    for (let i = 0; i < 10; i++) a.add(board(1, 0.1, 0.3), wood, { p: [0, i * 0.2, 0] }, { uvTile: 1 });
    a.add(lathe([[0.1, 0], [0.2, 0.5], [0, 1]]), iron);
    const g = a.build('crate');
    const meshes = g.children.filter((c) => c instanceof THREE.Mesh);
    expect(meshes).toHaveLength(3); // wood, iron, outline
    expect(g.getObjectByName('outline')).toBeDefined();
  });

  it('outline normals agree wherever faces meet, so the ink line never cracks at hard edges', () => {
    const box = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    withOutlineNormals(box);
    const pos = box.getAttribute('position');
    const on = box.getAttribute('outlineNormal');
    const seen = new Map<string, string>();
    for (let i = 0; i < pos.count; i++) {
      const key = `${pos.getX(i)},${pos.getY(i)},${pos.getZ(i)}`;
      const dir = `${on.getX(i).toFixed(4)},${on.getY(i).toFixed(4)},${on.getZ(i).toFixed(4)}`;
      if (seen.has(key)) expect(seen.get(key)).toBe(dir);
      seen.set(key, dir);
    }
  });

  it('hand-made jitter is deterministic and keeps the surface closed', () => {
    const a = jitter(new THREE.IcosahedronGeometry(1, 1), 0.1, 7);
    const b = jitter(new THREE.IcosahedronGeometry(1, 1), 0.1, 7);
    expect(Array.from(a.getAttribute('position').array)).toEqual(Array.from(b.getAttribute('position').array));
    expect(a.index).not.toBeNull(); // shared vertices: seams cannot open
  });

  it('projects UVs in world metres, so textures keep one scale across props', () => {
    const small = projectUv(new THREE.BoxGeometry(1, 1, 1), 1);
    const large = projectUv(new THREE.BoxGeometry(2, 2, 2), 1);
    const span = (g: THREE.BufferGeometry) => {
      const uv = g.getAttribute('uv');
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < uv.count; i++) {
        min = Math.min(min, uv.getX(i));
        max = Math.max(max, uv.getX(i));
      }
      return max - min;
    };
    expect(span(large)).toBeCloseTo(span(small) * 2, 5);
  });
});
