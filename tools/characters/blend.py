"""Blender helpers: mesh import, decimation, attributes, export. Runs inside `bpy`."""
from __future__ import annotations

import bpy  # noqa: I001  (bpy must load before bmesh)
import bmesh
import numpy as np


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mesh_object(name: str, verts: np.ndarray, faces: np.ndarray) -> bpy.types.Object:
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts.tolist(), [], faces.tolist())
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return ob


def apply_modifiers(ob):
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def decimate(ob, target_tris: int):
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    if tris <= target_tris:
        return
    mod = ob.modifiers.new("dec", "DECIMATE")
    mod.ratio = target_tris / tris
    mod.use_collapse_triangulate = True
    apply_modifiers(ob)
    ob.data.validate()


def smooth(ob, iterations=1, factor=0.5):
    if iterations <= 0:
        return
    mod = ob.modifiers.new("sm", "SMOOTH")
    mod.iterations = iterations
    mod.factor = factor
    apply_modifiers(ob)


def shade_smooth(ob):
    for p in ob.data.polygons:
        p.use_smooth = True


def copy_object(ob, name):
    c = ob.copy()
    c.data = ob.data.copy()
    c.name = name
    c.data.name = name
    bpy.context.scene.collection.objects.link(c)
    return c


def verts_of(ob) -> np.ndarray:
    a = np.empty(len(ob.data.vertices) * 3)
    ob.data.vertices.foreach_get("co", a)
    return a.reshape(-1, 3)


def normals_of(ob) -> np.ndarray:
    a = np.empty(len(ob.data.vertices) * 3)
    ob.data.vertices.foreach_get("normal", a)
    return a.reshape(-1, 3)


def face_centres(ob) -> np.ndarray:
    a = np.empty(len(ob.data.polygons) * 3)
    ob.data.polygons.foreach_get("center", a)
    return a.reshape(-1, 3)


def tri_count(ob) -> int:
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def set_uv(ob, per_loop_uv: np.ndarray, name="slot"):
    me = ob.data
    uv = me.uv_layers.new(name=name)
    uv.data.foreach_set("uv", per_loop_uv.astype(np.float32).ravel())


def loop_vertex_index(ob) -> np.ndarray:
    a = np.empty(len(ob.data.loops), dtype=np.int64)
    ob.data.loops.foreach_get("vertex_index", a)
    return a


def loop_face_index(ob) -> np.ndarray:
    me = ob.data
    out = np.empty(len(me.loops), dtype=np.int64)
    for p in me.polygons:
        out[p.loop_start : p.loop_start + p.loop_total] = p.index
    return out


def keep_faces(ob, mask: np.ndarray):
    """Delete faces where mask is False (and loose verts)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.faces.ensure_lookup_table()
    gone = [f for f in bm.faces if not mask[f.index]]
    bmesh.ops.delete(bm, geom=gone, context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(ob.data)
    bm.free()


def export_glb(path: str, objects, animations=True):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_materials="NONE",
        export_vertex_color="NONE",
        export_skins=True,
        export_animations=animations,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_frame_step=1,
        export_def_bones=False,
        export_yup=True,
        export_morph=False,
        export_optimize_animation_size=False,
        export_extras=True,
    )
