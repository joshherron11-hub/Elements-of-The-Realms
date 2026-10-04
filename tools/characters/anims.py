"""
The humanoid animation library, authored in code (runs inside `bpy`).

Poses are written as rotations in CHARACTER space, in degrees, for the left
side; the right side mirrors. Conventions (+X = character's left, -Y = front,
+Z = up), positive X rotation tips a bone's far end backwards for limbs that
hang down (thigh back, knee bends, arm swings back) and forwards for bones
that point up (spine leans forward, head nods down). Each clip keys every
bone on every frame so cross-fades never leave a joint behind, and loops
close (last frame == first frame).

Adding a clip = adding a function to CLIPS. Combat clips can be added the
same way later; the skeleton already has hand and back sockets for weapons.
"""
from __future__ import annotations

import math

import bpy
from mathutils import Euler, Vector

FPS = 30
S = math.sin
C = math.cos
TAU = math.tau


def mirror(name: str) -> str:
    return name[:-2] + ".R" if name.endswith(".L") else name[:-2] + ".L" if name.endswith(".R") else name


class Pose(dict):
    """bone -> [rx, ry, rz] (deg, character space) plus hips/root offsets."""

    def __init__(self):
        super().__init__()
        self.loc: dict[str, list[float]] = {}

    def rot(self, bone, rx=0.0, ry=0.0, rz=0.0, both=False):
        cur = self.setdefault(bone, [0.0, 0.0, 0.0])
        cur[0] += rx
        cur[1] += ry
        cur[2] += rz
        if both and bone.endswith(".L"):
            self.rot(mirror(bone), rx, -ry, -rz)
        return self

    def side(self, bone_l, s, rx=0.0, ry=0.0, rz=0.0):
        """Rotate the left (s=+1) or right (s=-1) bone, mirroring ry/rz for the right."""
        b = bone_l if s > 0 else mirror(bone_l)
        return self.rot(b, rx, ry * s, rz * s)

    def move(self, bone, x=0.0, y=0.0, z=0.0):
        cur = self.loc.setdefault(bone, [0.0, 0.0, 0.0])
        cur[0] += x
        cur[1] += y
        cur[2] += z
        return self


# ── shared building blocks ─────────────────────────────────────────────────
def relaxed(p: Pose, out=1.0, bend=12.0, fingers=18.0):
    """Arms down from the modelling A-pose, a soft elbow, curled fingers."""
    for s in (1, -1):
        p.side("upper_arm.L", s, rx=2, ry=33 * out)
        p.side("forearm.L", s, rx=-bend, rz=-8)
        p.side("hand.L", s, rx=-4, ry=4)
        p.side("fingers.L", s, ry=fingers)
        p.side("thumb.L", s, ry=6, rx=-6)
    return p


def stand(p: Pose):
    p.rot("spine", rx=1.5)
    p.rot("neck", rx=-3)
    p.rot("head", rx=3)
    return p


def breathe(p: Pose, ph: float, amt=1.0):
    b = S(ph) * amt
    p.rot("spine", rx=-0.6 * b)
    p.rot("chest", rx=-1.0 * b)
    p.rot("neck", rx=0.6 * b)
    for s in (1, -1):
        p.side("shoulder.L", s, rz=0.8 * b)
    return p


def legs_walk(p: Pose, ph: float, amp=26.0, knee=52.0, bob=0.022, sway=6.0):
    s, c = S(ph), C(ph)
    for side, k in ((1, 1.0), (-1, -1.0)):
        ls, lc = s * k, c * k
        p.side("thigh.L", side, rx=-amp * ls + 4)
        swing = max(0.0, lc) ** 1.3
        load = max(0.0, S(ph * k - 0.9)) if k > 0 else max(0.0, S(ph + math.pi - 0.9))
        p.side("shin.L", side, rx=5 + knee * swing + 9 * load)
        p.side("foot.L", side, rx=-12 * ls - 10 * swing + 4)
        p.side("toe.L", side, rx=-18 * max(0.0, -ls) * (1 - swing))
    p.move("hips", z=-bob + bob * abs(c))
    p.rot("hips", rz=-sway * s, ry=2.5 * c)
    p.rot("chest", rz=sway * 1.4 * s)
    p.rot("head", rz=-sway * 0.4 * s)
    return p


def arms_swing(p: Pose, ph: float, amp=20.0, bend=16.0):
    s = S(ph)
    for side, k in ((1, 1.0), (-1, -1.0)):
        ls = s * k
        p.side("upper_arm.L", side, rx=amp * ls, ry=30)
        p.side("forearm.L", side, rx=-bend - 16 * max(0.0, -ls), rz=-8)
        p.side("hand.L", side, rx=-4)
        p.side("fingers.L", side, ry=22)
        p.side("thumb.L", side, ry=6)
    return p


# ── clips: f(t in 0..1) -> Pose ────────────────────────────────────────────
def idle(t):
    p = stand(Pose())
    relaxed(p)
    breathe(p, TAU * t * 2)
    shift = S(TAU * t)
    p.move("hips", x=0.012 * shift, z=-0.004 * abs(shift))
    p.rot("hips", ry=-2.2 * shift)
    p.rot("chest", ry=1.6 * shift)
    for s in (1, -1):
        bend = max(0.0, shift * -s)
        p.side("thigh.L", s, rx=-3 * bend, ry=2.2 * shift * s)
        p.side("shin.L", s, rx=7 * bend + 2)
        p.side("foot.L", s, rx=-3 * bend)
    p.rot("head", rz=6 * S(TAU * t + 1.2), rx=2 * S(TAU * t * 2))
    return p


def walk(t):
    ph = TAU * t
    p = stand(Pose())
    p.rot("spine", rx=3)
    legs_walk(p, ph)
    arms_swing(p, ph)
    breathe(p, ph * 2, 0.5)
    return p


def run(t):
    ph = TAU * t
    p = stand(Pose())
    p.rot("spine", rx=9)
    p.rot("chest", rx=3)
    p.rot("head", rx=-8)
    legs_walk(p, ph, amp=40, knee=95, bob=0.045, sway=8)
    c = C(ph)
    p.move("hips", z=0.03 * abs(c))  # flight phase
    s = S(ph)
    for side, k in ((1, 1.0), (-1, -1.0)):
        ls = s * k
        p.side("upper_arm.L", side, rx=38 * ls - 4, ry=26)
        p.side("forearm.L", side, rx=-78 + 10 * ls, rz=-10)
        p.side("hand.L", side, rx=-6)
        p.side("fingers.L", side, ry=55)
        p.side("thumb.L", side, ry=20)
    return p


def turn(t):
    ph = TAU * t
    p = stand(Pose())
    relaxed(p, bend=16)
    for side, off in ((1, 0.0), (-1, math.pi)):
        lift = max(0.0, S(ph + off)) ** 1.5
        p.side("thigh.L", side, rx=-18 * lift)
        p.side("shin.L", side, rx=34 * lift + 2)
        p.side("foot.L", side, rx=-6 * lift)
    p.move("hips", z=-0.01 + 0.008 * abs(S(ph)))
    p.rot("hips", rz=-4 * S(ph))
    p.rot("chest", rz=3 * S(ph))
    return p


def talk(t):
    ph = TAU * t
    p = stand(Pose())
    relaxed(p)
    breathe(p, ph * 2)
    # Right hand gestures: lift, open, a beat, settle; the left joins in briefly.
    g = max(0.0, S(ph)) ** 0.8
    g2 = max(0.0, S(ph * 2 + 1.0)) ** 2
    p.side("upper_arm.L", -1, rx=-28 * g - 6 * g2, ry=-6 * g)
    p.side("forearm.L", -1, rx=-62 * g - 10 * g2, ry=-20 * g)
    p.side("hand.L", -1, rx=10 * g, ry=-12 * g2)
    p.side("fingers.L", -1, ry=-12 * g)
    lg = max(0.0, S(ph + 2.4)) ** 2
    p.side("upper_arm.L", 1, rx=-14 * lg)
    p.side("forearm.L", 1, rx=-38 * lg)
    p.rot("head", rx=4 * S(ph * 3), rz=5 * S(ph + 0.6), ry=3 * S(ph * 1.5))
    p.rot("chest", rz=3 * S(ph), rx=-1.5 * g)
    p.rot("jaw", rx=4 + 5 * max(0.0, S(ph * 9)) * (0.4 + 0.6 * g))
    return p


def interact(t):
    """Reach out with the right hand (take, give, open, ring a bell), then return."""
    ph = TAU * t
    p = stand(Pose())
    relaxed(p)
    r = 0.5 - 0.5 * C(ph)  # 0 -> 1 -> 0
    reach = r ** 0.8
    p.rot("spine", rx=8 * reach)
    p.rot("chest", rx=6 * reach, rz=-6 * reach)
    p.rot("head", rx=10 * reach)
    p.side("upper_arm.L", -1, rx=-58 * reach, ry=-14 * reach)
    p.side("forearm.L", -1, rx=-22 * reach + 10 * reach, ry=-30 * reach)
    p.side("hand.L", -1, rx=-14 * reach)
    p.side("fingers.L", -1, ry=-14 * reach + 30 * max(0.0, r - 0.85) / 0.15)
    p.side("thigh.L", -1, rx=-6 * reach)
    p.side("shin.L", -1, rx=10 * reach)
    return p


def sit(t):
    ph = TAU * t
    p = Pose()
    p.move("hips", y=0.06, z=-0.42)
    p.rot("hips", rx=-6)
    p.rot("spine", rx=6)
    p.rot("chest", rx=3)
    p.rot("head", rx=4 + 3 * S(ph), rz=6 * S(ph * 0.5 + 0.4))
    for s in (1, -1):
        p.side("thigh.L", s, rx=-86, ry=-4, rz=-5)
        p.side("shin.L", s, rx=92)
        p.side("foot.L", s, rx=-6)
        p.side("upper_arm.L", s, rx=-16, ry=26)
        p.side("forearm.L", s, rx=-52, rz=-14, ry=-20)
        p.side("hand.L", s, rx=10, ry=8)
        p.side("fingers.L", s, ry=24)
    breathe(p, ph * 2)
    return p


def carry(t):
    """Upper-body layer: a crate or sack held in front (legs come from walk/idle)."""
    ph = TAU * t
    p = Pose()
    p.rot("spine", rx=-4)
    p.rot("chest", rx=-3 + 1.2 * S(ph * 2))
    p.rot("head", rx=4)
    for s in (1, -1):
        p.side("shoulder.L", s, rz=-3)
        p.side("upper_arm.L", s, rx=-34, ry=22, rz=-10)
        p.side("forearm.L", s, rx=-72, ry=-34, rz=0)
        p.side("hand.L", s, rx=6, ry=-18)
        p.side("fingers.L", s, ry=40)
        p.side("thumb.L", s, ry=10)
    return p


CARRY_BONES = ["spine", "chest", "neck", "head"] + [b + s for b in ("shoulder", "upper_arm", "forearm", "hand", "fingers", "thumb") for s in (".L", ".R")]


def work(t):
    """Hammering / chopping at a bench: two-handed raise and strike."""
    ph = TAU * t
    raise_ = 0.5 + 0.5 * S(ph - math.pi / 2)  # 0 strike .. 1 raised
    strike = max(0.0, C(ph * 1.0 + 0.4)) ** 6
    p = stand(Pose())
    p.rot("spine", rx=12 - 6 * raise_)
    p.rot("chest", rx=6 - 8 * raise_, rz=-6 * raise_)
    p.rot("head", rx=10 + 4 * strike)
    for s in (1, -1):
        p.side("thigh.L", s, rx=-8, ry=4)
        p.side("shin.L", s, rx=14)
        p.side("foot.L", s, rx=-4)
    # Right arm swings the tool, left steadies the work.
    p.side("upper_arm.L", -1, rx=-40 - 70 * raise_, ry=-8, rz=10 * raise_)
    p.side("forearm.L", -1, rx=-40 - 50 * raise_ + 20 * strike, ry=-20)
    p.side("hand.L", -1, rx=-20 + 30 * raise_)
    p.side("fingers.L", -1, ry=60)
    p.side("thumb.L", -1, ry=25)
    p.side("upper_arm.L", 1, rx=-38, ry=20)
    p.side("forearm.L", 1, rx=-48, ry=-28)
    p.side("hand.L", 1, rx=8)
    p.side("fingers.L", 1, ry=30)
    p.move("hips", z=-0.02 - 0.01 * strike)
    return p


def celebrate(t):
    """Both arms up, a little hop, fists pumping."""
    ph = TAU * t
    hop = max(0.0, S(ph * 2)) ** 1.5
    land = max(0.0, -S(ph * 2)) ** 1.5
    p = stand(Pose())
    p.move("hips", z=0.06 * hop - 0.035 * land)
    p.rot("spine", rx=-6 * hop + 4 * land)
    p.rot("chest", rx=-4)
    p.rot("head", rx=-12 * hop + 3)
    pump = S(ph * 2)
    for s in (1, -1):
        p.side("upper_arm.L", s, rx=-12, ry=-112 + 10 * pump)
        p.side("forearm.L", s, rx=-24 - 22 * pump, rz=-10)
        p.side("hand.L", s, rx=-10)
        p.side("fingers.L", s, ry=70)
        p.side("thumb.L", s, ry=30)
        p.side("thigh.L", s, rx=-12 * land - 4 * hop)
        p.side("shin.L", s, rx=24 * land + 10 * hop)
        p.side("foot.L", s, rx=-8 * land + 18 * hop)
    return p


def sleep(t):
    """Lying on the back (on a bed when the NPC is at one), slow breathing."""
    ph = TAU * t
    p = Pose()
    p.rot("root", rx=-90)
    p.move("root", y=-0.86, z=0.42)
    p.rot("head", rx=-14, rz=12)
    p.rot("neck", rx=-6)
    breathe(p, ph, 2.2)
    for s in (1, -1):
        p.side("upper_arm.L", s, rx=-12, ry=26)
        p.side("forearm.L", s, rx=-70, ry=-30, rz=0)
        p.side("hand.L", s, rx=0)
        p.side("fingers.L", s, ry=26)
        p.side("thigh.L", s, rx=-4, ry=-2)
        p.side("shin.L", s, rx=6)
        p.side("foot.L", s, rx=22)
    return p


# name: (function, seconds)
CLIPS = {
    "idle": (idle, 4.0),
    "walk": (walk, 1.0),
    "run": (run, 0.66),
    "turn": (turn, 0.8),
    "talk": (talk, 3.0),
    "interact": (interact, 1.6),
    "sit": (sit, 4.0),
    "carry": (carry, 1.0),
    "work": (work, 1.4),
    "celebrate": (celebrate, 1.6),
    "sleep": (sleep, 5.0),
}


def author(arm_ob) -> list[str]:
    scene = bpy.context.scene
    scene.render.fps = FPS
    bpy.context.view_layer.objects.active = arm_ob
    bpy.ops.object.mode_set(mode="POSE")
    bones = arm_ob.pose.bones
    rest = {b.name: b.bone.matrix_local.to_3x3() for b in bones}
    for pb in bones:
        pb.rotation_mode = "QUATERNION"
    arm_ob.animation_data_create()
    names = []
    for name, (fn, seconds) in CLIPS.items():
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        arm_ob.animation_data.action = act
        frames = max(2, round(seconds * FPS))
        keyed = CARRY_BONES if name == "carry" else [b.name for b in bones if not b.name.startswith("socket")]
        for f in range(frames + 1):
            pose = fn((f % frames) / frames)
            for bname in keyed:
                pb = bones[bname]
                rx, ry, rz = pose.get(bname, (0.0, 0.0, 0.0))
                Rg = Euler((math.radians(rx), math.radians(ry), math.radians(rz)), "ZYX").to_matrix()
                M = rest[bname]
                pb.rotation_quaternion = (M.inverted() @ Rg @ M).to_quaternion()
                loc = pose.loc.get(bname)
                pb.location = (M.inverted() @ Vector(loc)) if loc else Vector((0, 0, 0))
                pb.keyframe_insert("rotation_quaternion", frame=f)
                if bname in ("hips", "root"):
                    pb.keyframe_insert("location", frame=f)
        act.frame_range = (0, frames)
        names.append(name)
    arm_ob.animation_data.action = None
    for pb in bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    bpy.ops.object.mode_set(mode="OBJECT")
    return names
