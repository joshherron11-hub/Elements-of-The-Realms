"""
The Blackmere humanoid: proportions, skeleton and sculpted body.

One adult base, 1.75 m tall, about six heads (a stylized, slightly large head
that reads at gameplay distance). Modelled in a relaxed A-pose, facing -Y,
with +X the character's left. Everything here is the LEFT side plus the
centre line; the right side is mirrored.

Each body primitive belongs to a bone. The union of all primitives is the
skin; per-bone unions drive the skin weights (see `rig.py`).
"""
from __future__ import annotations

import numpy as np

from sdf import (align, capsule, ellipsoid, intersect, mirror_x, plane, polyline, round_box, round_cone, rot_x, rot_y,
                 smin, sphere, subtract, transformed, union)

HEIGHT = 1.75


def n(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


# ── joints (left side + centre) ────────────────────────────────────────────
SHOULDER = np.array([0.185, 0.02, 1.385])
ARM_DIR = n([0.669, 0.02, -0.743])
ELBOW = SHOULDER + ARM_DIR * 0.285
FORE_DIR = n([0.64, -0.10, -0.76])
WRIST = ELBOW + FORE_DIR * 0.25
HAND_DIR = n([0.6, -0.12, -0.79])
KNUCKLE = WRIST + HAND_DIR * 0.092
FINGERTIP = KNUCKLE + HAND_DIR * 0.08
HIP = np.array([0.09, 0.0, 0.885])
KNEE = np.array([0.097, -0.008, 0.48])
ANKLE = np.array([0.102, 0.02, 0.085])
BALL = np.array([0.106, -0.095, 0.025])
TOE = np.array([0.108, -0.165, 0.025])
HEAD_C = np.array([0.0, -0.005, 1.615])  # head-local origin
EYE = np.array([0.034, -0.071, 0.004])  # head-local

# Bone: (head, tail, parent). Tails only orient the bone; children connect to heads.
BONES: dict[str, tuple[np.ndarray, np.ndarray, str | None]] = {
    "root": (np.array([0, 0, 0.0]), np.array([0, -0.1, 0.0]), None),
    "hips": (np.array([0, 0.0, 0.93]), np.array([0, 0.005, 1.04]), "root"),
    "spine": (np.array([0, 0.005, 1.04]), np.array([0, 0.0, 1.21]), "hips"),
    "chest": (np.array([0, 0.0, 1.21]), np.array([0, 0.02, 1.43]), "spine"),
    "neck": (np.array([0, 0.02, 1.43]), np.array([0, 0.005, 1.525]), "chest"),
    "head": (np.array([0, 0.005, 1.525]), np.array([0, 0.005, 1.76]), "neck"),
    "jaw": (HEAD_C + [0, -0.01, -0.035], HEAD_C + [0, -0.085, -0.115], "head"),
    "shoulder.L": (np.array([0.03, 0.02, 1.405]), SHOULDER, "chest"),
    "upper_arm.L": (SHOULDER, ELBOW, "shoulder.L"),
    "forearm.L": (ELBOW, WRIST, "upper_arm.L"),
    "hand.L": (WRIST, KNUCKLE, "forearm.L"),
    "fingers.L": (KNUCKLE, FINGERTIP, "hand.L"),
    "thumb.L": (WRIST + [-0.004, -0.032, -0.012], WRIST + [0.02, -0.07, -0.045], "hand.L"),
    "thigh.L": (HIP, KNEE, "hips"),
    "shin.L": (KNEE, ANKLE, "thigh.L"),
    "foot.L": (ANKLE, BALL, "shin.L"),
    "toe.L": (BALL, TOE, "foot.L"),
}
# Attachment sockets (non-deforming): held props, back items, and later weapons.
SOCKETS: dict[str, tuple[np.ndarray, np.ndarray, str]] = {
    "socket_hand.L": (KNUCKLE - HAND_DIR * 0.03 + [-0.02, 0, 0], KNUCKLE + HAND_DIR * 0.05, "hand.L"),
    "socket_back": (np.array([0, 0.13, 1.3]), np.array([0, 0.13, 1.45]), "chest"),
    "socket_hip.L": (np.array([0.17, 0.0, 0.95]), np.array([0.17, 0.0, 0.85]), "hips"),
}


def mirror_name(name: str) -> str:
    return name[:-2] + ".R" if name.endswith(".L") else name


def mirror_point(p):
    p = np.array(p, float)
    p[0] = -p[0]
    return p


def all_bones():
    """Full skeleton including mirrored right side, in a parent-first order."""
    out = {}
    for name, (h, t, parent) in BONES.items():
        out[name] = (h, t, parent)
    for name, (h, t, parent) in BONES.items():
        if name.endswith(".L"):
            out[mirror_name(name)] = (mirror_point(h), mirror_point(t), mirror_name(parent) if parent else None)
    for name, (h, t, parent) in SOCKETS.items():
        out[name] = (h, t, parent)
        if name.endswith(".L"):
            out[mirror_name(name)] = (mirror_point(h), mirror_point(t), mirror_name(parent))
    return out


# ── body primitives (left side + centre), tagged by bone ───────────────────
def body_parts():
    """[(bone, sdf)] for the body below the head. Hands are a separate, finer mesh."""
    P = []
    add = lambda bone, f: P.append((bone, f))
    # Pelvis and hips.
    add("hips", ellipsoid([0, 0.0, 0.945], [0.148, 0.102, 0.1]))
    add("hips", ellipsoid([0.062, 0.045, 0.895], [0.075, 0.068, 0.085]))  # glute
    add("hips", ellipsoid([0.105, 0.0, 0.92], [0.06, 0.08, 0.075]))  # hip flare
    # Abdomen, ribcage, chest.
    add("spine", ellipsoid([0, -0.004, 1.075], [0.128, 0.09, 0.12]))
    add("chest", ellipsoid([0, 0.008, 1.245], [0.148, 0.098, 0.165]))
    add("chest", ellipsoid([0.055, -0.042, 1.27], [0.075, 0.05, 0.075]))  # pectoral
    add("chest", ellipsoid([0.0, 0.05, 1.3], [0.12, 0.06, 0.11]))  # upper back
    add("chest", ellipsoid([0.075, 0.04, 1.29], [0.06, 0.05, 0.1]))  # shoulder blade
    # Neck and trapezius slope.
    add("neck", round_cone([0, 0.025, 1.41], [0, 0.005, 1.545], 0.055, 0.046))
    add("shoulder.L", round_cone([0.04, 0.03, 1.415], [0.165, 0.025, 1.4], 0.05, 0.042))
    # Arm: deltoid, biceps/triceps, forearm swell, wrist.
    add("upper_arm.L", ellipsoid(SHOULDER + [0.012, 0.0, -0.025], [0.06, 0.058, 0.07]))
    add("upper_arm.L", round_cone(SHOULDER, ELBOW, 0.047, 0.035))
    add("upper_arm.L", ellipsoid(SHOULDER + ARM_DIR * 0.15 + [0, -0.008, 0], [0.042, 0.042, 0.07], rot=align(ARM_DIR, [0, 0, 1])))
    add("forearm.L", round_cone(ELBOW, WRIST, 0.036, 0.024))
    add("forearm.L", ellipsoid(ELBOW + FORE_DIR * 0.07, [0.04, 0.036, 0.075], rot=align(FORE_DIR, [0, 0, 1])))
    # Leg: thigh, knee, calf, ankle.
    add("thigh.L", round_cone(HIP + [0.005, 0, 0.02], KNEE, 0.088, 0.052))
    add("thigh.L", ellipsoid(HIP + [0.02, -0.01, -0.14], [0.07, 0.07, 0.15]))
    add("shin.L", round_cone(KNEE, ANKLE, 0.05, 0.033))
    add("shin.L", ellipsoid(KNEE + [0.0, 0.022, -0.12], [0.048, 0.05, 0.11]))  # calf
    add("shin.L", sphere(KNEE + [0, -0.03, 0], 0.035))  # kneecap
    # Foot.
    foot = union(
        round_cone(ANKLE + [0, 0.025, -0.04], BALL + [0, 0.0, 0.004], 0.04, 0.042),
        ellipsoid(ANKLE + [0, -0.035, -0.04], [0.045, 0.085, 0.04]),
        k=0.02,
    )
    add("foot.L", intersect(foot, plane([0, 0, -1], 0.0)))
    add("toe.L", intersect(ellipsoid(BALL + [0, -0.03, 0.004], [0.046, 0.055, 0.028]), plane([0, 0, -1], 0.0)))
    return P


def head_frame(f):
    """Lift a head-local field into world space."""
    return lambda P: f(P - HEAD_C)


def head_field():
    """The sculpted head (head-local coordinates). Returns (field, jaw-field, socket centre)."""
    E = EYE
    cranium = ellipsoid([0, 0.012, 0.03], [0.087, 0.102, 0.105])
    face = ellipsoid([0, -0.03, -0.035], [0.069, 0.076, 0.088])
    jaw = ellipsoid([0, -0.036, -0.083], [0.056, 0.058, 0.048])
    jaw_angle = ellipsoid([0.05, 0.0, -0.08], [0.02, 0.028, 0.03])
    chin = ellipsoid([0, -0.082, -0.116], [0.022, 0.019, 0.02])
    cheek = ellipsoid([0.042, -0.066, -0.035], [0.028, 0.026, 0.024])
    cheekbone = ellipsoid([0.052, -0.054, -0.004], [0.024, 0.024, 0.016])
    brow = capsule([0.014, -0.088, 0.03], [0.05, -0.078, 0.031], 0.0095)
    glabella = sphere([0, -0.089, 0.024], 0.011)
    nose = union(
        round_cone([0, -0.097, 0.012], [0, -0.121, -0.032], 0.0085, 0.0125),
        sphere([0, -0.12, -0.035], 0.0135),
        ellipsoid([0.0135, -0.108, -0.04], [0.011, 0.0095, 0.009]),
        k=0.006,
    )
    upper_lip = ellipsoid([0, -0.1, -0.066], [0.023, 0.011, 0.0085])
    lower_lip = ellipsoid([0, -0.096, -0.079], [0.02, 0.011, 0.009])
    ear = ellipsoid([0.087, 0.012, -0.01], [0.011, 0.025, 0.035], rot=rot_x(0.25))
    ear_bowl = ellipsoid([0.095, 0.008, -0.006], [0.008, 0.016, 0.024], rot=rot_x(0.25))

    side = union(cranium, face, k=0.035)
    side = union(side, jaw, k=0.03)
    side = union(side, jaw_angle, k=0.02)
    side = union(side, chin, k=0.018)
    side = union(side, cheek, k=0.02)
    side = union(side, cheekbone, k=0.015)
    side = union(side, brow, k=0.012)
    side = union(side, glabella, k=0.012)
    side = union(side, nose, k=0.008)
    side = union(side, upper_lip, k=0.006)
    side = union(side, lower_lip, k=0.006)
    side = union(side, subtract(ear, ear_bowl, k=0.003), k=0.008)
    # Eye sockets, then lids over the eyeball.
    side = subtract(side, sphere(E, 0.0245), k=0.007)
    upper_lid = intersect(sphere(E, 0.0228), plane([0.1, 0, -1], -(E[2] + 0.0018)))
    lower_lid = intersect(sphere(E, 0.0218), plane([0.05, 0, 1], E[2] - 0.0108))
    side = union(side, upper_lid, k=0.002)
    side = union(side, lower_lid, k=0.003)
    side = mirror_x(side)
    # The mouth line and nostrils.
    mouth = ellipsoid([0, -0.107, -0.0718], [0.024, 0.013, 0.0016])
    corners = mirror_x(sphere([0.0235, -0.092, -0.0725], 0.0045))
    nostrils = mirror_x(sphere([0.0072, -0.118, -0.0475], 0.0042))
    head = subtract(side, mouth, k=0.0015)
    head = subtract(head, corners, k=0.004)
    head = subtract(head, nostrils, k=0.002)
    jaw_region = union(jaw, chin, lower_lip, mirror_x(jaw_angle))
    return head, jaw_region


# ── hands ──────────────────────────────────────────────────────────────────
def hand_frame():
    """World->hand-local rotation rows: u along the fingers, v towards the thumb (front), w the palm normal (towards the body)."""
    a = HAND_DIR
    nrm = n(np.array([-0.79, 0.0, -0.6]))
    nrm = n(nrm - a * (nrm @ a))
    t = np.cross(nrm, a)
    return np.stack([a, t, nrm])


def finger(base, dirs, lengths, r0, r1):
    pts = [np.asarray(base, float)]
    for d, L in zip(dirs, lengths):
        pts.append(pts[-1] + n(d) * L)
    rad = np.linspace(r0, r1, len(pts))
    return polyline(pts, rad)


def hand_parts():
    """[(bone, local-field)] for the left hand, in hand-local coordinates (u, v, w)."""
    P = []
    palm = round_box([0.046, 0.0, 0.0], [0.046, 0.037, 0.0125], 0.011)
    heel = ellipsoid([0.018, 0.0, 0.004], [0.03, 0.036, 0.018])
    thenar = ellipsoid([0.03, 0.026, 0.01], [0.03, 0.017, 0.015])
    P.append(("hand", union(palm, heel, k=0.012)))
    P.append(("thumb", thenar))
    # Fingers curl gently towards the palm (+w).
    spec = [(0.026, 0.074, 0.0088), (0.009, 0.082, 0.0091), (-0.009, 0.078, 0.0087), (-0.026, 0.062, 0.0078)]
    for v, L, r in spec:
        segs = [L * 0.42, L * 0.33, L * 0.25]
        dirs = [[1, v * -0.6, 0.18], [1, v * -0.8, 0.55], [1, v * -0.8, 0.95]]
        P.append(("fingers", finger([0.086, v, 0.0], dirs, segs, r, r * 0.86)))
        P.append(("fingers", sphere([0.088, v, -0.004], r * 1.05)))  # knuckle
    thumb = finger([0.022, 0.03, 0.006], [[0.55, 0.7, 0.42], [0.75, 0.42, 0.5]], [0.04, 0.032], 0.0118, 0.0092)
    P.append(("thumb", thumb))
    wrist = round_cone([-0.03, 0, 0], [0.012, 0, 0.002], 0.026, 0.03)
    P.append(("forearm", wrist))
    return P


def hand_world(f):
    R = hand_frame()
    return transformed(f, R, WRIST)


SEGMENT_OF = {
    "hips": "torso", "spine": "torso", "chest": "torso", "shoulder": "torso", "neck": "neck",
    "upper_arm": "arms_upper", "forearm": "arms_lower", "thigh": "legs_upper", "shin": "legs_lower",
    "foot": "feet", "toe": "feet",
}


def side_free(bone: str) -> str:
    return bone[:-2] if bone.endswith(".L") or bone.endswith(".R") else bone


def field_of(groups, k=0.03, extra=()):
    """Mirrored smooth union of the body primitives whose bone (sans side) is in `groups`."""
    fs = [f for b, f in body_parts() if side_free(b) in groups] + list(extra)
    def field(P):
        d = fs[0](P)
        for g in fs[1:]:
            d = smin(d, g(P), k)
        return d
    return mirror_x(field)


def surface_y(field, x, z, y_from=-0.35, y_to=0.05):
    """Front-most surface point of a field along -Y at (x, z) (bisection on the first crossing)."""
    ys = np.linspace(y_from, y_to, 400)
    P = np.column_stack([np.full_like(ys, x), ys, np.full_like(ys, z)])
    d = field(P)
    i = int(np.argmax(d < 0))
    if d[i] >= 0:
        return None
    return float(ys[max(i - 1, 0)] + (ys[i] - ys[max(i - 1, 0)]) * d[max(i - 1, 0)] / (d[max(i - 1, 0)] - d[i] + 1e-12))


def body_field():
    parts = body_parts()
    # Blend order matters a little: torso first, then limbs, with joint-friendly smoothing.
    fs = [f for _, f in parts]
    def field(P):
        d = fs[0](P)
        for g in fs[1:]:
            d = smin(d, g(P), 0.03)
        return d
    return mirror_x(field)


def hands_field():
    parts = hand_parts()
    fs = [f for _, f in parts]
    def local(P):
        d = fs[0](P)
        for g in fs[1:]:
            d = smin(d, g(P), 0.006)
        return d
    return mirror_x(hand_world(local))
