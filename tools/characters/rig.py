"""Skeleton creation and skin weights for the Blackmere humanoid (runs inside `bpy`)."""
from __future__ import annotations

import bpy
import numpy as np

import anatomy as A

MAX_INFLUENCES = 4


def build_armature(name="humanoid"):
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bones = A.all_bones()
    for bname, (h, t, parent) in bones.items():
        eb = arm.edit_bones.new(bname)
        eb.head = h.tolist()
        eb.tail = t.tolist()
        eb.roll = 0.0
        if parent:
            eb.parent = arm.edit_bones[parent]
        eb.use_deform = not (bname == "root" or bname.startswith("socket"))
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob


def deform_bones():
    return [b for b in A.all_bones() if b != "root" and not b.startswith("socket")]


def _neighbours():
    bones = A.all_bones()
    nb = {b: {b} for b in bones}
    for b, (_, _, p) in bones.items():
        if p and p in nb:
            nb[b].add(p)
            nb[p].add(b)
    return nb


def _bone_fields():
    """Per deforming body bone: a distance field (right side = mirrored left)."""
    groups: dict[str, list] = {}
    for b, f in A.body_parts():
        groups.setdefault(b, []).append(f)

    def un(fs):
        return lambda P: np.min(np.stack([f(P) for f in fs]), axis=0)

    out = {}
    for b, fs in groups.items():
        f = un(fs)
        out[b] = f
        if b.endswith(".L"):
            out[A.mirror_name(b)] = (lambda g: (lambda P: g(P * [-1, 1, 1])))(f)
    return out


def _normalise(W: np.ndarray) -> np.ndarray:
    # Keep the strongest MAX_INFLUENCES, drop specks, renormalise.
    idx = np.argsort(-W, axis=1)[:, MAX_INFLUENCES:]
    np.put_along_axis(W, idx, 0.0, axis=1)
    W[W < 0.02] = 0.0
    s = W.sum(axis=1, keepdims=True)
    s[s == 0] = 1
    return W / s


def body_weights(verts: np.ndarray, stiff: float = 0.0, tau: float = 0.017):
    names = [b for b in deform_bones() if b not in ("head", "jaw") and not b.startswith(("fingers", "thumb", "hand"))]
    fields = _bone_fields()
    D = np.stack([fields[b](verts) for b in names], axis=1)
    nb = _neighbours()
    owner = np.argmin(D, axis=1)
    allowed = np.zeros_like(D, dtype=bool)
    col = {b: i for i, b in enumerate(names)}
    for i, b in enumerate(names):
        for m in nb[b]:
            if m in col:
                allowed[owner == i, col[m]] = True
    dmin = D[np.arange(len(D)), owner][:, None]
    W = np.where(allowed, np.exp(-(D - dmin) / tau), 0.0)
    W = W / W.sum(axis=1, keepdims=True)
    if stiff > 0:
        s = stiff * np.clip((0.93 - verts[:, 2]) / 0.15, 0, 1)
        hips = np.zeros(len(names))
        hips[col["hips"]] = 1.0
        W = W * (1 - s[:, None]) + hips[None, :] * s[:, None]
    return names, _normalise(W)


def hand_weights(verts: np.ndarray, tau=0.008):
    R = A.hand_frame()
    parts = A.hand_parts()
    names = ["forearm", "hand", "fingers", "thumb"]
    side = np.where(verts[:, 0] >= 0, 1.0, -1.0)
    left = verts * np.column_stack([side, np.ones(len(verts)), np.ones(len(verts))])
    local = (left - A.WRIST) @ R.T
    D = np.stack([np.min(np.stack([f(local) for b, f in parts if b == n]), axis=0) for n in names], axis=1)
    owner = np.argmin(D, axis=1)
    dmin = D[np.arange(len(D)), owner][:, None]
    W = np.exp(-(D - dmin) / tau)
    # Fingers only bend from the knuckles; the palm stays with the hand.
    W[:, 2] *= np.clip((local[:, 0] - 0.07) / 0.02, 0, 1)
    W = W / W.sum(axis=1, keepdims=True)
    full = []
    for s in (1.0, -1.0):
        full += [f"{n}.{'L' if s > 0 else 'R'}" for n in names]
    out = np.zeros((len(verts), 8))
    out[side > 0, :4] = W[side > 0]
    out[side < 0, 4:] = W[side < 0]
    return full, _normalise(out)


def head_weights(verts: np.ndarray):
    _, jaw = A.head_field()
    local = verts - A.HEAD_C
    z, y = local[:, 2], local[:, 1]
    dj = jaw(local)
    w_jaw = np.clip(1 - np.maximum(dj, 0) / 0.01, 0, 1) * np.clip((-0.066 - z) / 0.008, 0, 1) * np.clip((0.02 - y) / 0.04, 0, 1)
    w_neck = np.clip((-0.1 - z) / 0.05, 0, 1) * np.clip((y + 0.03) / 0.05, 0, 1)
    w_jaw = np.minimum(w_jaw, 1 - w_neck)
    w_head = np.clip(1 - w_jaw - w_neck, 0, 1)
    return ["head", "jaw", "neck"], _normalise(np.column_stack([w_head, w_jaw, w_neck]))


def assign(ob, names, W, armature):
    for g in list(ob.vertex_groups):
        ob.vertex_groups.remove(g)
    for j, n in enumerate(names):
        idx = np.nonzero(W[:, j] > 0)[0]
        if len(idx) == 0:
            continue
        g = ob.vertex_groups.new(name=n)
        for i in idx:
            g.add([int(i)], float(W[i, j]), "REPLACE")
    mod = ob.modifiers.new("armature", "ARMATURE")
    mod.object = armature
    ob.parent = armature
