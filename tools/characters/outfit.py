"""
Modular parts for the Blackmere humanoid.

A part is a category (body, head, eyes, brows, hair, hat, top, over, neck,
belt, bottoms, boots, bag, ...) plus one or more (slot, field) components.
Slots name palette entries, so the same mesh can be any colour; the runtime
recolours per NPC. Clothes are sculpted as offsets of the body so they fit
it and skin with it, with folds, hems, cuffs and seams in the geometry.

Parts list the body segments they cover (`hides`) so covered skin is not drawn.
"""
from __future__ import annotations

from dataclasses import dataclass, field as dfield

import numpy as np

import anatomy as A
from sdf import (align, capsule, ellipsoid, intersect, mirror_x, offset, plane, polyline, rot_x, rot_y, rot_z,
                 round_box, round_cone, scaled, shell, smin, sphere, subtract, torus, union)

# Palette slots (index = UV.x). Keep in sync with src/render/characters/palette.ts.
SLOTS = ["skin", "lips", "hair", "brow", "sclera", "iris", "pupil", "top", "top_trim", "over", "accent", "legs",
         "leather", "sole", "metal", "hat"]
SLOT = {s: i for i, s in enumerate(SLOTS)}


@dataclass
class Part:
    name: str
    category: str
    components: list  # [(slot, field)]
    box: tuple
    voxel: float
    tris: int
    weights: str = "body"  # body | head | hand | rigid:<bone>
    hides: list = dfield(default_factory=list)
    k: float = 0.0  # smoothing between components
    mirror: bool = False  # components are the left side only; the mesh is mirrored
    stiff: float = 0.0  # skirt-like: blend weights towards the hips below the waist
    smooth: int = 1
    mesh: tuple | None = None  # prebuilt (verts, faces, slot_per_face) instead of a field
    mesh_lods: list | None = None  # prebuilt meshes per LOD (index 0 == mesh)
    segments: dict | None = None  # body only: split by bone ownership


def u(*fs, k=0.0):
    return union(*fs, k=k)


def wave(theta_scale, amp, z_lo, z_hi, phase=0.0):
    """Vertical folds around the body axis, fading in from z_hi down to z_lo."""

    def fn(P):
        th = np.arctan2(P[:, 0], P[:, 1])
        fade = np.clip((z_hi - P[:, 2]) / max(z_hi - z_lo, 1e-6), 0.0, 1.0)
        return amp * fade * np.sin(th * theta_scale + phase + 1.7 * np.sin(th * 3.0))

    return fn


def displace(f, fn):
    return lambda P: f(P) + fn(P)


# ── body ───────────────────────────────────────────────────────────────────
def body_part():
    return Part("body_base", "body", [("skin", A.body_field())], ((-0.62, -0.22, -0.01), (0.62, 0.2, 1.6)), 0.0036, 9000,
                smooth=2, segments=A.SEGMENT_OF)


def head_part():
    head, _ = A.head_field()
    return Part("head_a", "head", [("skin", A.head_frame(head))],
                (A.HEAD_C + [-0.115, -0.145, -0.16], A.HEAD_C + [0.115, 0.135, 0.15]), 0.0013, 4200, weights="head", smooth=2)


def lips_slot():
    """Lip colour: faces near the lips get the 'lips' slot (classified, not a separate mesh)."""
    up = ellipsoid([0, -0.1, -0.0665], [0.018, 0.011, 0.0062])
    lo = ellipsoid([0, -0.096, -0.079], [0.016, 0.011, 0.0072])
    return A.head_frame(union(up, lo))


def lash_line(centres):
    """Upper-lid edge faces: a soft dark lash line (head-local test, both eyes)."""
    L = centres - A.HEAD_C
    L[:, 0] = np.abs(L[:, 0])
    rel = L - A.EYE
    r = np.linalg.norm(rel, axis=1)
    return (r > 0.019) & (r < 0.0255) & (rel[:, 2] > -0.0005) & (rel[:, 2] < 0.0055) & (rel[:, 1] < -0.009)


def hands_part():
    parts = A.hand_parts()
    fs = [f for _, f in parts]

    def local(P):
        d = fs[0](P)
        for g in fs[1:]:
            d = smin(d, g(P), 0.006)
        return d

    f = A.hand_world(local)
    c = (A.WRIST + A.KNUCKLE) / 2
    return Part("hands_base", "hands", [("skin", f)], (c - 0.115, c + 0.115), 0.0011, 1500, weights="hand", mirror=True, smooth=1)


def eyes_part():
    """Eyeballs: a lathe with exact rings at the iris and pupil edges, so colours are crisp."""
    R = 0.0205
    deg = np.radians
    angles = [0, 5, 8.5, 9.5, 16, 21.5, 22.5, 34, 50, 75, 105, 140, 180]
    prof = []
    for a in angles:
        a_r = deg(a)
        bulge = 1.0 + 0.06 * max(0.0, np.cos(a_r * 3.0)) if a < 30 else 1.0  # cornea
        prof.append((R * np.sin(a_r) * bulge, R * np.cos(a_r) * bulge))
    slot_of_ring = []
    for a in angles[:-1]:
        slot_of_ring.append("pupil" if a < 9 else "iris" if a < 22 else "sclera")
    # Local +Z is the gaze; turn it to -Y (front), 4 degrees outwards.
    rot = rot_z(np.radians(4)) @ align([0, 0, 1], [0, -1, 0])
    from sdf import lathe_mesh

    lods = []
    for segs, keep in ((18, None), (12, None), (8, {0, 3, 6, 7, 9, 12})):
        pr = prof if keep is None else [x for i, x in enumerate(prof) if i in keep]
        sr = slot_of_ring if keep is None else [s for i, s in enumerate(slot_of_ring) if i in keep]
        v, fcs, ring = lathe_mesh(pr, segs, rot, A.HEAD_C + A.EYE)
        slot = np.array([SLOT[sr[min(ring[f].min(), len(sr) - 1)]] for f in fcs])
        lods.append((v, fcs, slot))
    return Part("eyes_a", "eyes", [], ((0, 0, 0), (0, 0, 0)), 0, 10_000, weights="rigid:head", mirror=True, smooth=0,
                mesh=lods[0], mesh_lods=lods)


def brows_part():
    head, _ = A.head_field()
    hf = A.head_frame(head)
    pts, rad = [], []
    for x, z, r in [(0.012, 0.031, 0.0036), (0.028, 0.0355, 0.0042), (0.045, 0.0345, 0.0036), (0.059, 0.028, 0.0026)]:
        X, Z = A.HEAD_C[0] + x, A.HEAD_C[2] + z
        y = A.surface_y(hf, X, Z, A.HEAD_C[1] - 0.2, A.HEAD_C[1])
        pts.append([X, y + 0.0008, Z])
        rad.append(r)
    brow = scaled(polyline(np.array(pts), rad), [1, 0.55, 0.75], about=np.mean(pts, axis=0))
    c = A.HEAD_C
    return Part("brows_a", "brows", [("brow", brow)], (c + [0.0, -0.13, 0.0], c + [0.075, -0.06, 0.055]), 0.0007, 300,
                weights="rigid:head", mirror=True, smooth=1)


CAP_CROWN = ellipsoid([0, -0.006, 0.088], [0.106, 0.118, 0.05], rot=rot_x(0.12))


def hair_tousled(under_hat=False):
    """Short tousled hair: a scalp cap plus clumped tufts and a fringe. `under_hat`: the variant worn with a hat."""
    rng = np.random.default_rng(7)
    cranium = ellipsoid([0, 0.012, 0.03], [0.087, 0.102, 0.105])
    base = offset(cranium, 0.009)

    def hairline(P):  # negative where hair grows (head-local)
        y, z, x = P[:, 1], P[:, 2], np.abs(P[:, 0])
        line = 0.05 - 0.62 * (y + 0.085) - 0.25 * np.clip(x - 0.05, 0, None)
        return line - z

    cap = intersect(base, hairline, k=0.01)
    tufts = []
    for i in range(46):
        # Points on the upper scalp, combed back and to the side.
        th = rng.uniform(-np.pi, np.pi)
        ph = rng.uniform(0.15, 1.25)
        d = np.array([np.sin(th) * np.sin(ph), -np.cos(th) * np.sin(ph) * 0.95, np.cos(ph)])
        root = np.array([0, 0.012, 0.03]) + d * np.array([0.09, 0.104, 0.106])
        if hairline(root[None, :])[0] > -0.01 or (under_hat and root[2] > 0.035):
            continue
        flow = np.array([np.sign(root[0]) * 0.35, 0.8, -0.25]) + rng.normal(0, 0.25, 3)
        tip = root + (d * 0.55 + flow / np.linalg.norm(flow) * 0.6) * rng.uniform(0.028, 0.045)
        tufts.append(round_cone(root, tip, rng.uniform(0.011, 0.016), 0.0025))
    # Fringe: tufts falling forward over the brow, swept to one side.
    for x, drop, sweep in [] if under_hat else [(-0.05, 0.03, -0.3), (-0.028, 0.038, -0.15), (-0.006, 0.044, 0.05), (0.018, 0.04, 0.25), (0.04, 0.032, 0.4), (0.06, 0.022, 0.5)]:
        root = np.array([x, -0.07, 0.085])
        tip = np.array([x + sweep * 0.04, -0.103, 0.085 - drop])
        mid = (root + tip) / 2 + [0, -0.012, 0.006]
        tufts.append(polyline(np.array([root, mid, tip]), [0.014, 0.01, 0.0025]))
    # Sides and nape: short clumps.
    for side in (-1, 1):
        for z, y in [(0.0, 0.02), (-0.02, 0.06), (0.02, -0.03), (-0.05, 0.085)]:
            root = np.array([side * 0.085, y, z + 0.03])
            tip = root + [side * 0.008, 0.014, -0.02]
            tufts.append(round_cone(root, tip, 0.011, 0.003))
    tuft_field = union(*tufts)
    hair = union(cap, intersect(tuft_field, lambda P: -(cranium(P) - 0.002)), k=0.008)
    if under_hat:
        hair = subtract(hair, offset(CAP_CROWN, 0.004), k=0.003)
        hair = intersect(hair, lambda P: P[:, 2] - 0.075)
    c = A.HEAD_C
    return Part("hair_tousled_hat" if under_hat else "hair_tousled", "hair", [("hair", A.head_frame(hair))], (c + [-0.125, -0.135, -0.11], c + [0.125, 0.145, 0.16]),
                0.0013, 2600, weights="rigid:head", smooth=1)


def cap_flat():
    """A flat cap: soft crown, stitched band and a short brim."""
    crown = intersect(CAP_CROWN, plane([0, 0.12, -1], -0.055))
    panels = lambda P: 0.0016 * np.abs(np.sin(np.arctan2(P[:, 0], P[:, 1] + 0.01) * 3.0)) ** 0.5
    crown = displace(crown, panels)
    band = torus([0, 0.006, 0.062], 0.094, 0.0105, rot=rot_x(0.12), scale=(0.98, 1.08))
    brim = intersect(ellipsoid([0, -0.104, 0.054], [0.078, 0.06, 0.0065], rot=rot_x(-0.32)), plane([0, 1, 0], -0.06))
    button = sphere([0, -0.012, 0.139], 0.0085)
    c = A.HEAD_C
    hf = lambda f: A.head_frame(f)
    return Part("hat_flatcap", "hat", [("hat", hf(crown)), ("hat", hf(band)), ("hat", hf(brim)), ("hat", hf(button))],
                (c + [-0.125, -0.18, 0.02], c + [0.125, 0.14, 0.16]), 0.0016, 1400, weights="rigid:head", k=0.006, smooth=1)


# ── clothes ────────────────────────────────────────────────────────────────
TORSO = {"hips", "spine", "chest", "neck", "shoulder"}
CUFF = A.WRIST - A.FORE_DIR * 0.03


def tunic_core():
    torso_arms = A.field_of(TORSO | {"upper_arm", "forearm"}, k=0.035)
    base = offset(torso_arms, 0.009)
    skirt = scaled(round_cone([0, 0.0, 1.02], [0, 0.0, 0.7], 0.15, 0.19), [1, 0.78, 1])
    return union(base, skirt, k=0.05)


def tunic_long():
    core = tunic_core()
    folds = wave(11, 0.0042, 0.74, 0.98)
    sleeve_folds = lambda P: 0.0022 * np.sin(((np.abs(P[:, 0]) - A.ELBOW[0]) * 0.8 + (P[:, 2] - A.ELBOW[2]) * -0.6) * 190) * np.exp(-((np.abs(P[:, 0]) - A.ELBOW[0]) ** 2 + (P[:, 2] - A.ELBOW[2]) ** 2) / 0.004)
    body = displace(core, lambda P: folds(P) + sleeve_folds(P))
    hem = lambda P: (0.735 + 0.01 * np.sin(np.arctan2(P[:, 0], P[:, 1]) * 4)) - P[:, 2]
    body = intersect(body, hem)
    # Sleeves end just above the wrist.
    cuff_cut = mirror_x(lambda P: (P - CUFF) @ A.FORE_DIR)
    body = intersect(body, cuff_cut)
    # Neckline: a round opening and a short slit at the front.
    neck = round_cone([0, 0.02, 1.38], [0, 0.0, 1.62], 0.062, 0.07)
    slit = intersect(round_box([0, -0.12, 1.36], [0.012, 0.06, 0.07], 0.004), plane([0, 0, -1], -1.3))
    body = subtract(body, union(neck, slit), k=0.006)
    cuff = mirror_x(torus(CUFF + A.FORE_DIR * 0.004, 0.031, 0.0075, rot=align(A.FORE_DIR, [0, 0, 1])))
    collar = torus([0, 0.018, 1.435], 0.066, 0.0075, rot=rot_x(-0.3), scale=(1.0, 1.05))
    return Part("top_tunic", "top", [("top", body), ("top_trim", cuff), ("top_trim", collar)],
                ((-0.6, -0.22, 0.7), (0.6, 0.2, 1.52)), 0.003, 3000, hides=["torso", "arms_upper", "arms_lower"], k=0.004,
                stiff=0.6, smooth=1)


def torso_layer(extra):
    """The torso as dressed by the tunic (no sleeves), grown by `extra`: vests, straps and sashes sit on it."""
    torso = A.field_of({"hips", "spine", "chest", "shoulder"}, k=0.04)
    skirt = scaled(round_cone([0, 0.0, 1.02], [0, 0.0, 0.7], 0.15, 0.19), [1, 0.78, 1])
    return offset(union(offset(torso, 0.009), skirt, k=0.05), extra)


def vest_open():
    v = torso_layer(0.011)
    v = intersect(v, plane([0, 0, -1], -0.985))  # hem
    v = intersect(v, lambda P: P[:, 2] - 1.5)
    arm = mirror_x(lambda P: np.linalg.norm(P - (A.SHOULDER + [0.005, 0.0, -0.045]), axis=1) - 0.072)
    v = subtract(v, arm, k=0.01)
    v = intersect(v, mirror_x(plane([1, 0, 0.05], 0.172)))
    neck = round_cone([0, 0.025, 1.36], [0, 0.0, 1.62], 0.074, 0.08)
    v = subtract(v, neck, k=0.008)
    # Open front: a V from the hem to the collar.
    def front(P):
        w = 0.012 + np.clip(P[:, 2] - 1.02, 0, None) * 0.22
        return np.maximum(np.abs(P[:, 0]) - w, P[:, 1] + 0.02)
    v = subtract(v, front, k=0.004)
    seams = wave(6, 0.0012, 0.95, 1.4, 0.6)
    v = displace(v, seams)
    return Part("over_vest", "over", [("over", v)], ((-0.22, -0.2, 0.95), (0.22, 0.18, 1.52)), 0.0022, 1300, k=0.0, smooth=1)


def belt_plain():
    core = tunic_core()
    band = intersect(offset(core, 0.007), lambda P: np.abs(P[:, 2] - 0.98) - 0.017)
    y = A.surface_y(offset(core, 0.007), 0.0, 0.98)
    buckle = round_box([0, y - 0.002, 0.98], [0.019, 0.005, 0.021], 0.004)
    hole = round_box([0, y - 0.008, 0.98], [0.011, 0.01, 0.012], 0.002)
    buckle = subtract(buckle, hole)
    return Part("belt_plain", "belt", [("leather", band), ("metal", buckle)], ((-0.22, -0.2, 0.95), (0.22, 0.18, 1.01)), 0.0022, 500,
                stiff=0.0, smooth=0)


def trousers():
    legs = A.field_of({"hips", "thigh", "shin"}, k=0.035)
    t = offset(legs, 0.008)
    bunch = lambda P: 0.0024 * np.sin(P[:, 2] * 260) * np.clip((0.4 - P[:, 2]) / 0.12, 0, 1)
    knee = lambda P: 0.0018 * np.sin(P[:, 2] * 200 + np.arctan2(P[:, 0] - np.sign(P[:, 0]) * 0.097, P[:, 1]) * 2) * np.exp(-((P[:, 2] - 0.5) ** 2) / 0.003)
    t = displace(t, lambda P: bunch(P) + knee(P))
    t = intersect(t, lambda P: P[:, 2] - 1.0)
    t = intersect(t, lambda P: 0.24 - P[:, 2])
    return Part("bottoms_trousers", "bottoms", [("legs", t)], ((-0.24, -0.16, 0.22), (0.24, 0.16, 1.02)), 0.003, 1600,
                hides=["legs_upper"], smooth=1)


def boots_cuffed():
    """Left boot (mirrored): leather shaft, turned cuff, sole and heel."""
    from anatomy import ANKLE, BALL, KNEE, body_parts
    parts = [f for b, f in body_parts() if b in ("shin.L", "foot.L", "toe.L")]

    def leg(P):
        d = parts[0](P)
        for g in parts[1:]:
            d = smin(d, g(P), 0.03)
        return d

    shaft = intersect(offset(leg, 0.013), lambda P: P[:, 2] - 0.315)
    shin_dir = (KNEE - ANKLE) / np.linalg.norm(KNEE - ANKLE)
    at = ANKLE + shin_dir * ((0.31 - ANKLE[2]) / shin_dir[2])
    cuff = scaled(torus(at + [0, 0.004, 0.0], 0.054, 0.013, rot=align(shin_dir, [0, 0, 1])), [1, 1.08, 1], about=at)
    wrinkles = lambda P: 0.0018 * np.sin(P[:, 2] * 230) * np.clip((P[:, 2] - 0.1) / 0.05, 0, 1) * np.clip((0.26 - P[:, 2]) / 0.05, 0, 1)
    shaft = displace(shaft, wrinkles)
    foot = [f for b, f in body_parts() if b in ("foot.L", "toe.L")]
    sole = intersect(offset(union(*foot, k=0.02), 0.02), lambda P: P[:, 2] - 0.02)
    heel = round_box(ANKLE + [0, 0.02, -0.07], [0.04, 0.035, 0.016], 0.008)
    return Part("boots_cuffed", "boots", [("leather", shaft), ("leather", cuff), ("sole", sole), ("sole", heel)],
                ((0.02, -0.23, -0.01), (0.19, 0.11, 0.35)), 0.0024, 1100, hides=["feet", "legs_lower"], k=0.004, mirror=True, smooth=1)


def scarf_wrapped():
    wrap = torus([0, 0.012, 1.44], 0.069, 0.022, rot=rot_x(-0.28), scale=(1.0, 1.06))
    ripple = lambda P: 0.003 * np.sin(np.arctan2(P[:, 0], P[:, 1] - 0.012) * 7)
    wrap = displace(wrap, ripple)
    knot = ellipsoid([0.03, -0.08, 1.405], [0.028, 0.022, 0.026], rot=rot_z(0.4))
    chest = A.field_of({"chest", "spine"}, k=0.04)
    y1 = A.surface_y(offset(chest, 0.024), 0.035, 1.32)
    y2 = A.surface_y(offset(chest, 0.024), 0.058, 1.33)
    tail1 = round_box([0.035, y1 - 0.009, 1.33], [0.022, 0.0055, 0.07], 0.005, rot=rot_y(0.12) @ rot_x(0.12))
    tail2 = round_box([0.062, y2 - 0.006, 1.345], [0.019, 0.005, 0.058], 0.005, rot=rot_y(-0.2) @ rot_x(0.1))
    fringe = lambda P: 0.0015 * np.sin(P[:, 0] * 900) * np.clip((1.275 - P[:, 2]) / 0.01, 0, 1)
    tails = displace(union(tail1, tail2), fringe)
    return Part("neck_scarf", "neck", [("accent", wrap), ("accent", knot), ("accent", tails)],
                ((-0.13, -0.14, 1.24), (0.13, 0.13, 1.52)), 0.0018, 1400, hides=[], k=0.006, smooth=1)


def satchel():
    layer = shell(torso_layer(0.0125), 0.006)
    a, b = np.array([-0.11, 0.0, 1.47]), np.array([0.19, 0.0, 0.93])
    nrm = np.cross(b - a, [0, 1, 0])
    nrm /= np.linalg.norm(nrm)
    d0 = float(nrm @ a)
    strap = intersect(layer, lambda P: np.abs(P @ nrm - d0) - 0.018)
    strap = intersect(strap, lambda P: P[:, 2] - 0.95)
    bag = round_box([0.2, -0.015, 0.9], [0.026, 0.088, 0.072], 0.02, rot=rot_y(0.12))
    flap = round_box([0.222, -0.015, 0.93], [0.008, 0.092, 0.048], 0.008, rot=rot_y(0.12))
    buckle = round_box([0.233, -0.015, 0.895], [0.004, 0.012, 0.014], 0.003, rot=rot_y(0.12))
    return Part("bag_satchel", "bag", [("leather", strap), ("leather", bag), ("over", flap), ("metal", buckle)],
                ((-0.2, -0.2, 0.8), (0.26, 0.19, 1.5)), 0.0026, 1200, k=0.004, smooth=1)


def reference_parts():
    """The reference character's wardrobe (Pip Ashdown, courier) plus the base body."""
    return [body_part(), head_part(), eyes_part(), brows_part(), hands_part(), hair_tousled(), hair_tousled(True), cap_flat(), tunic_long(),
            vest_open(), belt_plain(), trousers(), boots_cuffed(), scarf_wrapped(), satchel()]
