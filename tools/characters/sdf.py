"""
Signed distance fields for sculpting characters in code.

Every shape is a function f(P) -> distance, where P is an (N, 3) float array
in metres (Blender axes: +X = the character's left, -Y = front, +Z = up).
Shapes combine with smooth unions/subtractions, then `polygonise` turns the
field into a triangle mesh with marching cubes. Distances only need to be
exact near the surface; marching cubes reads the zero crossing.
"""
from __future__ import annotations

import numpy as np
from skimage.measure import marching_cubes

V = np.ndarray


def vec(*a: float) -> V:
    return np.array(a, dtype=np.float64)


# ── primitives ─────────────────────────────────────────────────────────────
def sphere(c, r):
    c = np.asarray(c, float)
    return lambda P: np.linalg.norm(P - c, axis=1) - r


def ellipsoid(c, radii, rot=None):
    """Ellipsoid (approximate distance: good near the surface). `rot` is a 3x3 world->local."""
    c = np.asarray(c, float)
    r = np.asarray(radii, float)

    def f(P):
        Q = P - c
        if rot is not None:
            Q = Q @ np.asarray(rot).T
        k0 = np.linalg.norm(Q / r, axis=1)
        k1 = np.linalg.norm(Q / (r * r), axis=1)
        return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)

    return f


def round_cone(a, b, ra, rb):
    """A capsule whose radius tapers from ra at a to rb at b (linear in t)."""
    a = np.asarray(a, float)
    b = np.asarray(b, float)
    ab = b - a
    L2 = float(ab @ ab)

    def f(P):
        t = np.clip(((P - a) @ ab) / L2, 0.0, 1.0)
        q = a + t[:, None] * ab
        return np.linalg.norm(P - q, axis=1) - (ra + (rb - ra) * t)

    return f


def capsule(a, b, r):
    return round_cone(a, b, r, r)


def polyline(points, radii):
    """A smooth tube through points with per-point radii."""
    segs = [round_cone(points[i], points[i + 1], radii[i], radii[i + 1]) for i in range(len(points) - 1)]
    return union(*segs)


def round_box(c, half, r, rot=None):
    c = np.asarray(c, float)
    h = np.asarray(half, float)

    def f(P):
        Q = P - c
        if rot is not None:
            Q = Q @ np.asarray(rot).T
        q = np.abs(Q) - h + r
        return np.linalg.norm(np.maximum(q, 0.0), axis=1) + np.minimum(np.max(q, axis=1), 0.0) - r

    return f


def torus(c, R, r, rot=None, scale=(1.0, 1.0)):
    """Torus in the local XY plane (axis = local Z); `scale` squashes the ring into an ellipse."""
    c = np.asarray(c, float)
    sx, sy = scale

    def f(P):
        Q = P - c
        if rot is not None:
            Q = Q @ np.asarray(rot).T
        ring = np.sqrt((Q[:, 0] / sx) ** 2 + (Q[:, 1] / sy) ** 2) - R
        return np.sqrt(ring * ring * min(sx, sy) ** 2 + Q[:, 2] ** 2) - r

    return f


def plane(n, d):
    """Half-space below the plane n.p = d (negative where n.p < d)."""
    n = np.asarray(n, float)
    n = n / np.linalg.norm(n)
    return lambda P: P @ n - d


# ── operators ──────────────────────────────────────────────────────────────
def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def union(*fs, k=0.0):
    def f(P):
        d = fs[0](P)
        for g in fs[1:]:
            d = smin(d, g(P), k)
        return d

    return f


def subtract(f, g, k=0.0):
    return lambda P: smax(f(P), -g(P), k)


def intersect(f, g, k=0.0):
    return lambda P: smax(f(P), g(P), k)


def offset(f, amount):
    return lambda P: f(P) - amount


def shell(f, thickness):
    """Hollow skin of thickness t sitting on the outside of f's surface."""
    return lambda P: np.abs(f(P) - thickness * 0.5) - thickness * 0.5


def mirror_x(f):
    """Evaluate f on |x|: build the left side, get both."""

    def g(P):
        Q = P.copy()
        Q[:, 0] = np.abs(Q[:, 0])
        return f(Q)

    return g


def displaced(f, fn):
    """Add a displacement field fn(P) -> metres (positive pushes inward)."""
    return lambda P: f(P) + fn(P)


def transformed(f, rot, origin):
    """Evaluate f in a local frame: P_local = rot @ (P - origin)."""
    rot = np.asarray(rot, float)
    origin = np.asarray(origin, float)
    return lambda P: f((P - origin) @ rot.T)


# ── rotations ──────────────────────────────────────────────────────────────
def rot_x(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def rot_y(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rot_z(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def align(frm, to):
    """Rotation matrix taking unit vector `frm` onto `to`."""
    a = np.asarray(frm, float) / np.linalg.norm(frm)
    b = np.asarray(to, float) / np.linalg.norm(to)
    v = np.cross(a, b)
    c = float(a @ b)
    if np.linalg.norm(v) < 1e-9:
        return np.eye(3) if c > 0 else -np.eye(3)
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + vx + vx @ vx * (1.0 / (1.0 + c))


# ── meshing ────────────────────────────────────────────────────────────────
def polygonise(f, lo, hi, voxel, chunk=400_000):
    """Marching cubes over the box [lo, hi]. Returns (verts (N,3), faces (M,3))."""
    lo = np.asarray(lo, float)
    hi = np.asarray(hi, float)
    n = np.ceil((hi - lo) / voxel).astype(int) + 1
    xs = lo[0] + np.arange(n[0]) * voxel
    ys = lo[1] + np.arange(n[1]) * voxel
    zs = lo[2] + np.arange(n[2]) * voxel
    vol = np.empty((n[0], n[1], n[2]), dtype=np.float32)
    X, Y = np.meshgrid(xs, ys, indexing="ij")
    plane_pts = np.stack([X.ravel(), Y.ravel()], axis=1)
    per = max(1, chunk // plane_pts.shape[0])
    for z0 in range(0, n[2], per):
        zz = zs[z0 : z0 + per]
        P = np.concatenate([np.column_stack([plane_pts, np.full(plane_pts.shape[0], z)]) for z in zz])
        d = f(P).reshape(len(zz), n[0], n[1])
        vol[:, :, z0 : z0 + len(zz)] = np.transpose(d, (1, 2, 0))
    # Close the field at the box walls so meshes are watertight.
    vol[0, :, :] = vol[-1, :, :] = vol[:, 0, :] = vol[:, -1, :] = vol[:, :, 0] = vol[:, :, -1] = 1.0
    verts, faces, _, _ = marching_cubes(vol, level=0.0, spacing=(voxel, voxel, voxel), gradient_direction="ascent")
    verts += lo
    return verts, faces


def scaled(f, s, about=(0.0, 0.0, 0.0)):
    """Non-uniform scale about a point (distance stays approximate)."""
    s = np.asarray(s, float)
    o = np.asarray(about, float)
    return lambda P: f((P - o) / s + o) * float(s.min())


def lathe_mesh(profile, segments, axis_rot=np.eye(3), centre=(0, 0, 0)):
    """Revolve (radius, height) profile points around local +Z. Returns (verts, faces, ring_index_per_vertex)."""
    prof = np.asarray(profile, float)
    verts, ring = [], []
    for i, (r, h) in enumerate(prof):
        if r < 1e-9:
            verts.append([0.0, 0.0, h])
            ring.append(i)
            continue
        for s in range(segments):
            a = 2 * np.pi * s / segments
            verts.append([r * np.cos(a), r * np.sin(a), h])
            ring.append(i)
    verts = np.asarray(verts)
    # index bookkeeping
    starts, counts, c = [], [], 0
    for r, _ in prof:
        starts.append(c)
        k = 1 if r < 1e-9 else segments
        counts.append(k)
        c += k
    faces = []
    for i in range(len(prof) - 1):
        a0, ac = starts[i], counts[i]
        b0, bc = starts[i + 1], counts[i + 1]
        for s in range(segments):
            s1 = (s + 1) % segments
            if ac == 1:
                faces.append([a0, b0 + s, b0 + s1])
            elif bc == 1:
                faces.append([a0 + s, b0, a0 + s1])
            else:
                faces.append([a0 + s, b0 + s, b0 + s1])
                faces.append([a0 + s, b0 + s1, a0 + s1])
    verts = verts @ np.asarray(axis_rot).T + np.asarray(centre, float)
    return verts, np.asarray(faces), np.asarray(ring)
