import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * CHARACTER LIBRARY — loads rigged humanoid GLBs and assembles characters
 * from their modular parts.
 *
 * One GLB holds the shared skeleton, the animation library and every part
 * (body segments, heads, eyes, brows, hair, hats, tops, over-layers, belts,
 * bottoms, boots, bags...) at each LOD. A character is a list of part names:
 * the chosen parts are merged into one skinned geometry per LOD (cached, so
 * NPCs wearing the same things share it) and bound to a fresh copy of the
 * skeleton. Covered body segments are left out.
 */
export interface PartInfo {
  name: string;
  category: string;
  /** Body segments this part covers. */
  hides: string[];
  /** Body only: which segment this mesh is. */
  segment?: string;
  /** Template meshes per LOD (index 0 = full detail). */
  lods: THREE.SkinnedMesh[];
}

export class HumanoidAsset {
  readonly parts = new Map<string, PartInfo>();
  readonly clips = new Map<string, THREE.AnimationClip>();
  /** Canonical bone order shared by every merged geometry. */
  readonly boneNames: string[];
  readonly boneInverses: THREE.Matrix4[];
  readonly bindMatrix: THREE.Matrix4;
  readonly lodCount: number;
  private readonly armature: THREE.Object3D;
  private readonly meshLocal: THREE.Matrix4;
  /** Template meshes are children of the armature node (Blender parenting) rather than siblings. */
  readonly meshUnderArmature: boolean;
  private readonly geometries = new Map<string, THREE.BufferGeometry>();

  constructor(readonly id: string, gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }) {
    const meshes: THREE.SkinnedMesh[] = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh);
    });
    const first = meshes[0];
    if (!first) throw new Error(`${id}: no skinned meshes`);
    this.boneNames = first.skeleton.bones.map((b) => b.name);
    this.boneInverses = first.skeleton.boneInverses.map((m) => m.clone());
    this.bindMatrix = first.bindMatrix.clone();
    this.meshLocal = first.matrix.clone();
    let root: THREE.Object3D = first.skeleton.bones[0]!;
    while (root.parent && (root.parent as THREE.Bone).isBone) root = root.parent;
    this.armature = root.parent ?? root;
    this.meshUnderArmature = first.parent === this.armature;
    let lods = 1;
    for (const mesh of meshes) {
      const [base, lodTag] = mesh.name.split('__lod');
      const lod = lodTag ? Number(lodTag) : 0;
      lods = Math.max(lods, lod + 1);
      this.remapJoints(mesh);
      const ud = mesh.userData as { category?: string; hides?: string; segment?: string };
      let info = this.parts.get(base!);
      if (!info) {
        info = { name: base!, category: ud.category ?? 'misc', hides: ud.hides ? ud.hides.split(',') : [], segment: ud.segment, lods: [] };
        this.parts.set(base!, info);
      }
      info.lods[lod] = mesh;
    }
    this.lodCount = lods;
    for (const c of gltf.animations) this.clips.set(c.name, c);
  }

  /** Make every mesh's skinIndex refer to the canonical bone order. */
  private remapJoints(mesh: THREE.SkinnedMesh): void {
    const names = mesh.skeleton.bones.map((b) => b.name);
    if (names.length === this.boneNames.length && names.every((n, i) => n === this.boneNames[i])) return;
    const map = names.map((n) => this.boneNames.indexOf(n));
    const si = mesh.geometry.getAttribute('skinIndex') as THREE.BufferAttribute;
    for (let i = 0; i < si.count; i++) for (let c = 0; c < 4; c++) si.setComponent(i, c, Math.max(0, map[si.getComponent(i, c)] ?? 0));
    si.needsUpdate = true;
  }

  /** Part names that exist in this asset. */
  has(part: string): boolean {
    return this.parts.has(part) || (part === 'body_base' && [...this.parts.values()].some((p) => p.category === 'body'));
  }

  /** The meshes a costume draws at a LOD: chosen parts, plus body segments nothing covers. */
  resolve(parts: string[]): PartInfo[] {
    // Under a hat, hair uses its tucked variant (`<hair>_hat`) when the asset has one.
    const hatted = parts.some((p) => this.parts.get(p)?.category === 'hat');
    const swap = (p: string) => (hatted && this.parts.get(p)?.category === 'hair' && this.parts.has(`${p}_hat`) ? `${p}_hat` : p);
    const chosen = parts.flatMap((p) => (p === 'body_base' ? [] : this.parts.get(swap(p)) ? [this.parts.get(swap(p))!] : []));
    const hidden = new Set(chosen.flatMap((p) => p.hides));
    const body = parts.includes('body_base') ? [...this.parts.values()].filter((p) => p.category === 'body' && !hidden.has(p.segment ?? '')) : [];
    return [...body, ...chosen];
  }

  /** One merged skinned geometry for a costume at a LOD (shared between characters). */
  geometry(parts: string[], lod: number): THREE.BufferGeometry {
    const key = `${[...parts].sort().join('+')}@${lod}`;
    let g = this.geometries.get(key);
    if (!g) {
      const geos = this.resolve(parts).map((p) => (p.lods[Math.min(lod, p.lods.length - 1)] ?? p.lods[0]!).geometry);
      const keep = ['position', 'normal', 'uv', 'skinIndex', 'skinWeight'];
      const clean = geos.map((src) => {
        const c = new THREE.BufferGeometry();
        for (const k of keep) c.setAttribute(k, src.getAttribute(k));
        c.setIndex(src.getIndex());
        return c;
      });
      g = mergeGeometries(clean, false) ?? new THREE.BufferGeometry();
      g.computeBoundingSphere();
      this.geometries.set(key, g);
    }
    return g;
  }

  /** Triangles drawn for a costume at a LOD. */
  triangles(parts: string[], lod: number): number {
    const g = this.geometry(parts, lod);
    return (g.getIndex()?.count ?? g.getAttribute('position').count) / 3;
  }

  /** A fresh skeleton (bones keep their names so animation clips bind). */
  instantiate(): { armature: THREE.Object3D; skeleton: THREE.Skeleton; bones: Map<string, THREE.Bone> } {
    const copy = (o: THREE.Object3D): THREE.Object3D => {
      const c = (o as THREE.Bone).isBone ? new THREE.Bone() : new THREE.Object3D();
      c.name = o.name;
      c.position.copy(o.position);
      c.quaternion.copy(o.quaternion);
      c.scale.copy(o.scale);
      for (const ch of o.children) if ((ch as THREE.Bone).isBone) c.add(copy(ch));
      return c;
    };
    const armature = copy(this.armature);
    const bones = new Map<string, THREE.Bone>();
    armature.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone);
    });
    const skeleton = new THREE.Skeleton(
      this.boneNames.map((n) => bones.get(n)!),
      this.boneInverses,
    );
    return { armature, skeleton, bones };
  }

  /** A skinned mesh for a geometry, bound to an instance's skeleton. */
  skinned(geometry: THREE.BufferGeometry, material: THREE.Material, skeleton: THREE.Skeleton): THREE.SkinnedMesh {
    const mesh = new THREE.SkinnedMesh(geometry, material);
    this.meshLocal.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.bind(skeleton, this.bindMatrix);
    return mesh;
  }
}

/** Loads humanoid assets once and hands out the parsed asset. */
export class CharacterLibrary {
  private readonly assets = new Map<string, HumanoidAsset>();
  private readonly pending = new Map<string, Promise<HumanoidAsset | undefined>>();

  constructor(private readonly urls: Record<string, string>) {}

  get(id: string): HumanoidAsset | undefined {
    return this.assets.get(id);
  }

  ids(): string[] {
    return Object.keys(this.urls);
  }

  load(id: string): Promise<HumanoidAsset | undefined> {
    const ready = this.assets.get(id);
    if (ready) return Promise.resolve(ready);
    let p = this.pending.get(id);
    if (!p) {
      const url = this.urls[id];
      p = !url
        ? Promise.resolve(undefined)
        : new GLTFLoader().loadAsync(url).then(
            (gltf) => {
              const a = new HumanoidAsset(id, gltf);
              this.assets.set(id, a);
              return a;
            },
            (e: unknown) => {
              console.warn(`Character asset ${id} failed to load`, e);
              return undefined;
            },
          );
      this.pending.set(id, p);
    }
    return p;
  }

  /** Load everything; resolves even if some assets fail (they fall back to the old figures). */
  async loadAll(): Promise<void> {
    await Promise.all(this.ids().map((id) => this.load(id)));
  }
}
