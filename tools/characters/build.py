"""
Build the Blackmere humanoid GLB.

    pip install "bpy==4.5.*" scikit-image     # headless Blender as a Python module
    python tools/characters/build.py          # -> assets/characters/blackmere-humanoid.glb

Pipeline: sculpted distance fields (anatomy.py, outfit.py) -> marching cubes ->
Blender: smooth, decimate into three LODs, palette slots + baked occlusion in
UVs, split the body into hideable segments, skin to the shared skeleton
(rig.py), author the animation library (anims.py) -> one GLB.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402

import anatomy as A  # noqa: E402
import blend as B  # noqa: E402
import outfit as O  # noqa: E402
import rig as R  # noqa: E402
from sdf import polygonise  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "assets", "characters", "blackmere-humanoid.glb")
CACHE = os.path.join(os.environ.get("EOTR_CHAR_CACHE", "/tmp/eotr-char-cache"))
LODS = [1.0, 0.42, 0.16]
LOD_MIN = 80


def source_hash() -> str:
    h = hashlib.md5()
    for f in ("sdf.py", "anatomy.py", "outfit.py"):
        h.update(open(os.path.join(HERE, f), "rb").read())
    return h.hexdigest()[:10]


def part_field(p: O.Part):
    fs = [f for _, f in p.components]
    if len(fs) == 1:
        return fs[0]
    k = p.k

    def field(P):
        d = fs[0](P)
        for g in fs[1:]:
            d = O.smin(d, g(P), k)
        return d

    return field


def raw_mesh(p: O.Part, tag: str, lod: int = 0):
    """(verts, faces) for a part, cached on disk; mirrored parts get both sides."""
    if p.mesh is not None:
        v, f, _ = p.mesh_lods[lod] if p.mesh_lods else p.mesh
    else:
        path = os.path.join(CACHE, f"{p.name}.npz")
        only = os.environ.get("EOTR_ONLY")  # comma list: re-mesh just these parts while iterating
        d = np.load(path) if os.path.exists(path) else None
        fresh = d is not None and (str(d["tag"]) == tag or (only is not None and p.name not in only.split(",")))
        if fresh:
            v, f = d["v"], d["f"]
        else:
            t = time.time()
            v, f = polygonise(part_field(p), p.box[0], p.box[1], p.voxel)
            os.makedirs(CACHE, exist_ok=True)
            np.savez(path, v=v, f=f, tag=tag)
            print(f"  meshed {p.name}: {len(f)} tris in {time.time() - t:.1f}s")
    if p.mirror:
        m = v * [-1, 1, 1]
        v = np.concatenate([v, m])
        f = np.concatenate([f, f[:, ::-1] + len(m)])
    return v, f


def classify(p: O.Part, centres: np.ndarray) -> np.ndarray:
    """Palette slot per face: the nearest component wins."""
    if len(p.components) == 1:
        slot = np.full(len(centres), O.SLOT[p.components[0][0]])
    else:
        C = centres.copy()
        if p.mirror:
            C[:, 0] = np.abs(C[:, 0])
        D = np.stack([f(C) for _, f in p.components], axis=1)
        slot = np.array([O.SLOT[s] for s, _ in p.components])[np.argmin(D, axis=1)]
    if p.category == "head":
        slot[O.lips_slot()(centres) < 0.0008] = O.SLOT["lips"]
        slot[O.lash_line(centres)] = O.SLOT["brow"]
    return slot


def occlusion(verts, normals, scene):
    """Soft ambient occlusion from the outfit's combined field (rest pose)."""
    occ = np.zeros(len(verts))
    for i in range(1, 6):
        h = 0.007 * i
        d = scene(verts + normals * h)
        occ += np.clip(h - d, 0, None) / (2 ** (i - 1))
    return np.clip(1.0 - occ * 9.0, 0.0, 1.0)


def finish(ob, p: O.Part, scene, slot_faces=None):
    me = ob.data
    if slot_faces is None:
        slot_faces = classify(p, B.face_centres(ob))
    lv = B.loop_vertex_index(ob)
    lf = B.loop_face_index(ob)
    ao = occlusion(B.verts_of(ob), B.normals_of(ob), scene)
    uv = np.column_stack([slot_faces[lf] + 0.5, ao[lv]])
    B.set_uv(ob, uv)
    B.shade_smooth(ob)
    me.update()


def weights_for(p: O.Part, verts):
    if p.weights.startswith("rigid:"):
        return [p.weights.split(":")[1]], np.ones((len(verts), 1))
    if p.weights == "head":
        return R.head_weights(verts)
    if p.weights == "hand":
        return R.hand_weights(verts)
    return R.body_weights(verts, p.stiff)


def split_segments(ob, p: O.Part, lod: int):
    """Body: one object per segment, by the bone that owns each face."""
    C = B.face_centres(ob)
    fields = R._bone_fields()
    names = list(fields)
    D = np.stack([fields[b](C) for b in names], axis=1)
    owner = [A.SEGMENT_OF[A.side_free(names[i])] for i in np.argmin(D, axis=1)]
    out = []
    for seg in sorted(set(owner)):
        c = B.copy_object(ob, f"body_{seg}" + (f"__lod{lod}" if lod else ""))
        B.keep_faces(c, np.array([o == seg for o in owner]))
        out.append((seg, c))
    B.bpy.data.objects.remove(ob)
    return out


def main():
    t0 = time.time()
    tag = source_hash()
    parts = O.reference_parts()
    B.reset_scene()
    arm = R.build_armature("humanoid")
    fields = [O.mirror_x(part_field(p)) if p.mirror else part_field(p) for p in parts if p.mesh is None]
    scene = lambda P: np.min(np.stack([f(P) for f in fields]), axis=0)  # noqa: E731
    manifest = {"parts": {}, "slots": O.SLOTS, "lods": len(LODS)}
    exported = [arm]
    for p in parts:
        v, f = raw_mesh(p, tag)
        base = B.mesh_object(f"_src_{p.name}", v, f)
        lod_src = {li: B.mesh_object(f"_src_{p.name}_{li}", *raw_mesh(p, tag, li)) for li in range(1, len(LODS))} if p.mesh_lods else {}
        if p.smooth:
            B.smooth(base, p.smooth, 0.5)
        for li, ratio in enumerate(LODS):
            ob = B.copy_object(lod_src.get(li, base), p.name if li == 0 else f"{p.name}__lod{li}")
            if p.mesh is None:
                B.decimate(ob, max(LOD_MIN, int(p.tris * ratio)))
            pieces = split_segments(ob, p, li) if p.segments else [(None, ob)]
            for seg, piece in pieces:
                pre = None
                if p.mesh is not None:
                    sl = (p.mesh_lods[li] if p.mesh_lods else p.mesh)[2]
                    pre = np.concatenate([sl, sl]) if p.mirror else sl
                finish(piece, p, scene, pre)
                names, W = weights_for(p, B.verts_of(piece))
                R.assign(piece, names, W, arm)
                name = piece.name
                key = name.split("__")[0]
                piece["category"] = p.category
                piece["lod"] = li
                if seg:
                    piece["segment"] = seg
                if p.hides:
                    piece["hides"] = ",".join(p.hides)
                exported.append(piece)
                info = manifest["parts"].setdefault(key, {"category": p.category, "tris": [], "hides": p.hides, "segment": seg})
                info["tris"].append(B.tri_count(piece))
        B.bpy.data.objects.remove(base)
        for o in lod_src.values():
            B.bpy.data.objects.remove(o)
        print(f"{p.name}: {manifest['parts'].get(p.name, {}).get('tris') or [x for k, x in manifest['parts'].items() if k.startswith('body_')]}")
    try:
        import anims

        clips = anims.author(arm)
        manifest["clips"] = clips
    except ImportError:
        manifest["clips"] = []
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    B.export_glb(OUT, exported, animations=bool(manifest["clips"]))
    manifest["bones"] = len(A.all_bones())
    manifest["deformBones"] = len(R.deform_bones())
    with open(OUT.replace(".glb", ".manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=1)
    print(f"wrote {OUT} ({os.path.getsize(OUT) / 1024:.0f} KB) in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
