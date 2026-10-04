import * as THREE from 'three';
import { inHours } from '../world/living';
import type { BuiltSection } from './builder';
import { animateFigure, createAnimal, createFigure } from './figures';
import type { ExtraSpec, SceneLayout, Vec2 } from './layout';
import type { Lighting } from './lighting';
import type { Materials } from './materials';
import { leafSprite, mistBand, softDisc } from './textures';

/**
 * Ambient life: presentation only. Leaves drift, dust motes hang in the light,
 * smoke rises, embers lift off hearths, fireflies come out at night, banners
 * and bunting sway, hearths flicker, windows light up, villagers walk their
 * rounds, patrons sip, hens peck and crows hop. Nothing here touches the
 * simulation; the time of day is read from it to decide what is lit and who
 * is about.
 */
interface ExtraView {
  spec: ExtraSpec;
  obj: THREE.Object3D;
  seed: number;
  walking: boolean;
}

/** Deterministic pseudo-random in [0,1) from a seed (presentation only). */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

function points(n: number, place: (i: number) => [number, number, number], mat: THREE.PointsMaterial, colors?: (i: number) => THREE.Color): THREE.Points {
  const pos = new Float32Array(n * 3);
  const col = colors ? new Float32Array(n * 3) : undefined;
  for (let i = 0; i < n; i++) {
    pos.set(place(i), i * 3);
    if (col && colors) {
      const c = colors(i);
      col.set([c.r, c.g, c.b], i * 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  return p;
}

export class Ambient {
  private readonly extras: ExtraView[] = [];
  private leaves?: THREE.Points;
  private leafVel: Float32Array = new Float32Array();
  private dust?: THREE.Points;
  private embers?: THREE.Points;
  private emberBase: THREE.Vector3[] = [];
  private readonly smoke: { sprite: THREE.Sprite; base: THREE.Vector3; t: number }[] = [];
  private fireflies?: THREE.Points;
  private readonly swaying: THREE.Object3D[] = [];
  private readonly glowMats = new Set<THREE.MeshBasicMaterial>();
  private readonly flames: THREE.Object3D[] = [];
  private readonly halos: THREE.Sprite[] = [];
  private readonly birds: { mesh: THREE.Mesh; flock: number; dx: number; dz: number; phase: number }[] = [];
  private readonly mists: THREE.Mesh[] = [];
  private readonly flags: THREE.Object3D[] = [];
  private readonly exitGlows: THREE.Mesh[] = [];
  private readonly glints: THREE.Mesh[] = [];

  constructor(
    private readonly layout: SceneLayout,
    private readonly m: Materials,
    private readonly built: BuiltSection,
    density = 1,
    opts: { mist?: boolean } = {},
  ) {
    const group = built.group;
    const P = m.palette;
    layout.extras.forEach((spec, i) => {
      const obj =
        spec.kind === 'villager' || spec.kind === 'patron'
          ? createFigure(m, { body: m.color(spec.color, 'stone'), accent: i % 2 ? P.gold : P.timber, role: spec.kind, height: spec.kind === 'patron' ? 2.2 : 2.35 })
          : createAnimal(m, spec.kind, spec.color ? m.color(spec.color) : undefined);
      const start = spec.at ?? spec.path![0]!;
      obj.position.set(start[0], 0, start[1]);
      group.add(obj);
      this.extras.push({ spec, obj, seed: i * 13.7 + start[0], walking: false });
    });

    const [W, D] = layout.size;
    const n = Math.round(layout.ambient.leaves * density);
    if (n > 0) {
      const palette = [P.ember, P.gold, P.crimson].map((c) => new THREE.Color(c));
      this.leafVel = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) this.leafVel.set([0.4 + hash(i + 3) * 0.6, -(0.4 + hash(i + 5) * 0.5), 0.2 * (hash(i + 11) - 0.5)], i * 3);
      this.leaves = points(
        n,
        (i) => [(hash(i) - 0.5) * W, hash(i + 99) * 12, (hash(i + 7) - 0.5) * D],
        new THREE.PointsMaterial({ size: 0.42, map: leafSprite(), vertexColors: true, transparent: true, alphaTest: 0.4, depthWrite: false }),
        (i) => palette[i % 3]!,
      );
      group.add(this.leaves);
    }

    // Dust motes catching the light (a few dozen, very cheap).
    const motes = Math.round((layout.interior ? 70 : 90) * density);
    this.dust = points(
      motes,
      (i) => [(hash(i + 31) - 0.5) * W * 0.9, 0.4 + hash(i + 37) * (layout.interior ? 3.5 : 5), (hash(i + 41) - 0.5) * D * 0.9],
      new THREE.PointsMaterial({ size: 0.12, map: softDisc(), color: P.light, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    group.add(this.dust);

    const puff = new THREE.SpriteMaterial({ map: softDisc(), color: 0xd8cdc0, transparent: true, opacity: 0.4, depthWrite: false });
    for (const [x, z, h] of layout.ambient.smoke) {
      for (let k = 0; k < 5; k++) {
        const sprite = new THREE.Sprite(puff.clone());
        const base = new THREE.Vector3(x + 0.8, h, z);
        sprite.position.copy(base);
        group.add(sprite);
        this.smoke.push({ sprite, base, t: k / 5 });
      }
    }

    if (layout.ambient.fireflies) {
      this.fireflies = points(
        Math.round(46 * density),
        (i) => [(hash(i + 1) - 0.5) * W * 0.8, 0.6 + hash(i + 2) * 2.2, (hash(i + 3) - 0.5) * D * 0.8],
        new THREE.PointsMaterial({ size: 0.32, map: softDisc(), color: new THREE.Color(P.gold).multiplyScalar(2), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
      );
      group.add(this.fireflies);
    }

    if (!layout.interior) {
      // Distant birds: small V shapes gliding in loose flocks across the upper frame by day.
      const v = new THREE.BufferGeometry();
      v.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.55, 0.12, -0.12, -0.12, 0, -0.05, 0, 0, 0, 0.12, 0, -0.05, 0.55, 0.12, -0.12], 3));
      const ink = new THREE.MeshBasicMaterial({ color: 0x2a2028, side: THREE.DoubleSide, fog: false });
      const flocks = density >= 1 ? 2 : 1;
      for (let f = 0; f < flocks; f++) {
        for (let i = 0; i < 6; i++) {
          const mesh = new THREE.Mesh(v, ink);
          mesh.scale.setScalar(1.2);
          group.add(mesh);
          this.birds.push({ mesh, flock: f, dx: (i % 3) * 1.4 - 1.4 + hash(i + f) * 0.8, dz: Math.floor(i / 3) * 1.2 + hash(i * 3 + f), phase: hash(i * 7 + f) * 6 });
        }
      }
      if (opts.mist) {
        // Painterly mist: soft bands between the town and the painted hills.
        for (let k = 0; k < 3; k++) {
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W * 2.6, 9), new THREE.MeshBasicMaterial({ map: mistBand(), color: 0xe8d8d0, transparent: true, opacity: 0.32 - k * 0.06, depthWrite: false, fog: false }));
          mesh.position.set(0, 3.2 + k * 1.6, -D / 2 - 6 - k * 10);
          mesh.name = 'mist';
          group.add(mesh);
          this.mists.push(mesh);
        }
      }
    }

    group.traverse((o) => {
      if (o.name === 'bunting') for (const f of o.children) this.flags.push(f);
      if (o.name === 'banner-cloth' || o.name === 'bunting') this.swaying.push(o);
      if (o.name === 'flame') this.flames.push(o);
      if (o.name === 'lamp-halo') this.halos.push(o as THREE.Sprite);
      if (o.name === 'exit-glow') this.exitGlows.push(o as THREE.Mesh);
      if (o.name === 'node-glint') this.glints.push(o as THREE.Mesh);
    });
    for (const l of built.nightLights) {
      const mat = (l as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      if (mat?.userData.baseColor !== undefined) this.glowMats.add(mat);
    }

    // Embers rising from each hearth.
    for (const f of built.fires) this.emberBase.push(f.getWorldPosition(new THREE.Vector3()).setY(0.6));
    if (this.emberBase.length) {
      const count = Math.round(24 * density) * this.emberBase.length;
      this.embers = points(
        count,
        (i) => {
          const b = this.emberBase[i % this.emberBase.length]!;
          return [b.x, b.y + hash(i) * 2, b.z];
        },
        new THREE.PointsMaterial({ size: 0.14, map: softDisc(), color: new THREE.Color(P.ember).multiplyScalar(2.6), transparent: true, depthWrite: false, toneMapped: false }),
      );
      group.add(this.embers);
    }
  }

  update(dtMs: number, tMs: number, hour: number, light: Lighting, camera: THREE.Camera): void {
    const dt = dtMs / 1000;
    const t = tMs / 1000;
    const [W, D] = this.layout.size;

    for (const e of this.extras) {
      const present = !e.spec.hours || inHours(Math.floor(hour), e.spec.hours[0], e.spec.hours[1]);
      e.obj.visible = present;
      if (!present) continue;
      let walk = 0;
      if (e.spec.path && e.spec.path.length > 1) {
        const pts = e.spec.path;
        const seg = pts.map((p, i) => Math.hypot(pts[(i + 1) % pts.length]![0] - p[0], pts[(i + 1) % pts.length]![1] - p[1]));
        const total = seg.reduce((a, b) => a + b, 0);
        let d = ((t * 1.4 + e.seed) % total + total) % total;
        let i = 0;
        while (d > seg[i]!) d -= seg[i++]!;
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        const k = d / seg[i]!;
        e.obj.position.x = a[0] + (b[0] - a[0]) * k;
        e.obj.position.z = a[1] + (b[1] - a[1]) * k;
        e.obj.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
        walk = 0.6;
      } else if (e.spec.at) {
        const home: Vec2 = e.spec.at;
        const slot = Math.floor((t + e.seed) / 3);
        const wander = e.spec.kind === 'chicken' || e.spec.kind === 'sheep' || e.spec.kind === 'cat' ? 1.2 : e.spec.kind === 'crow' ? 0.6 : e.spec.activity === 'browse' ? 0.35 : 0;
        const tx = home[0] + (hash(slot + e.seed) - 0.5) * 2 * wander;
        const tz = home[1] + (hash(slot + e.seed + 50) - 0.5) * 2 * wander;
        const dx = tx - e.obj.position.x;
        const dz = tz - e.obj.position.z;
        if (Math.hypot(dx, dz) > 0.05) {
          e.obj.position.x += dx * Math.min(1, dt * 1.5);
          e.obj.position.z += dz * Math.min(1, dt * 1.5);
          e.obj.rotation.y = Math.atan2(dx, dz);
          walk = Math.min(1, Math.hypot(dx, dz) * 1.5);
        }
        if (e.spec.kind === 'patron') e.obj.rotation.y = (e.spec.face ?? 0) + Math.sin(t * 0.3 + e.seed) * 0.25;
        else if (e.spec.face !== undefined && walk < 0.2) e.obj.rotation.y = e.spec.face + Math.sin(t * 0.25 + e.seed) * 0.15;
      }
      animateFigure(e.obj, {
        t,
        walk,
        seated: e.spec.kind === 'patron',
        talking: (e.spec.kind === 'patron' || e.spec.activity === 'chat') && Math.sin(t * 0.4 + e.seed) > 0.1,
        look: e.spec.activity === 'browse' ? Math.sin(t * 0.35 + e.seed) * 0.6 : undefined,
        dt,
        sniff: e.spec.kind === 'chicken' && Math.sin(t * 2.5 + e.seed) > 0.2, // pecking
        joy: e.spec.kind === 'crow' ? Math.max(0, Math.sin(t * 1.5 + e.seed)) * 0.4 : 0,
      });
    }

    if (this.leaves) {
      const pos = this.leaves.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] = arr[i]! + (this.leafVel[i]! + Math.sin(t + i) * 0.3) * dt;
        arr[i + 1] = arr[i + 1]! + this.leafVel[i + 1]! * dt;
        arr[i + 2] = arr[i + 2]! + (this.leafVel[i + 2]! + Math.cos(t * 0.7 + i) * 0.2) * dt;
        if (arr[i + 1]! < 0.05) {
          arr[i] = (hash(i + t) - 0.5) * W;
          arr[i + 1] = 10 + hash(i + t * 2) * 3;
          arr[i + 2] = (hash(i + t * 3) - 0.5) * D;
        }
        if (arr[i]! > W / 2) arr[i] = -W / 2;
      }
      pos.needsUpdate = true;
    }

    if (this.dust) {
      this.dust.position.set(Math.sin(t * 0.13) * 0.6, Math.sin(t * 0.21) * 0.25, Math.cos(t * 0.11) * 0.6);
      (this.dust.material as THREE.PointsMaterial).opacity = this.layout.interior ? 0.5 : 0.15 + (1 - light.lamps) * 0.3;
    }

    if (this.embers) {
      const pos = this.embers.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0, j = 0; i < arr.length; i += 3, j++) {
        const b = this.emberBase[j % this.emberBase.length]!;
        const life = ((t * 0.45 + hash(j)) % 1 + 1) % 1;
        arr[i] = b.x + Math.sin(t * 2 + j) * 0.25 * life + (hash(j + 9) - 0.5) * 0.5;
        arr[i + 1] = b.y + life * 2.6;
        arr[i + 2] = b.z + (hash(j + 3) - 0.5) * 0.6;
      }
      pos.needsUpdate = true;
    }

    for (const s of this.smoke) {
      s.t = (s.t + dt * 0.16) % 1;
      s.sprite.position.set(s.base.x + Math.sin(s.t * 4) * 0.4 + s.t * 1.4, s.base.y + s.t * 4.5, s.base.z);
      s.sprite.scale.setScalar(0.8 + s.t * 2.4);
      s.sprite.material.opacity = 0.45 * (1 - s.t) * Math.min(1, s.t * 6);
    }

    if (this.fireflies) {
      (this.fireflies.material as THREE.PointsMaterial).opacity = light.lamps * (0.55 + Math.sin(t * 3) * 0.35);
      this.fireflies.position.y = Math.sin(t * 0.8) * 0.3;
    }

    // Cloth: banners sway and ripple; each bunting flag flutters on its own beat.
    for (const b of this.swaying) {
      b.rotation.y = Math.sin(t * 1.6 + b.position.x) * (b.name === 'bunting' ? 0.12 : 0.35);
      if (b.name === 'banner-cloth') b.rotation.x = Math.sin(t * 2.7 + b.position.x * 3) * 0.07;
    }
    for (const [i, f] of this.flags.entries()) f.rotation.x = Math.sin(t * 3.1 + i * 0.9) * 0.28 + Math.sin(t * 7.3 + i) * 0.06;
    // Birds by day: flocks circle slowly beyond the frame's centre, wings beating then gliding.
    const day = hour >= 6 && hour < 19.5;
    for (const b of this.birds) {
      b.mesh.visible = day;
      if (!day) continue;
      // Low enough to cross the frame from this elevated view (seen from above, as from a rooftop).
      const a = t * 0.06 + b.flock * 2.4;
      const cx = camera.position.x + Math.cos(a) * 20;
      const cz = camera.position.z - 24 + Math.sin(a) * 9;
      b.mesh.position.set(cx + b.dx * 1.5, 9 + b.flock * 1.5 + Math.sin(t * 0.7 + b.phase) * 0.5, cz + b.dz * 1.5);
      b.mesh.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a)) + Math.PI / 2;
      const beat = Math.sin(t * 9 + b.phase);
      b.mesh.scale.set(1.2, 1.2 * (Math.sin(t * 0.6 + b.phase) > 0 ? beat * 1.2 : 0.4), 1.2);
    }
    for (const mist of this.mists) {
      (mist.material as THREE.MeshBasicMaterial).color.setHex(light.fog).lerp(new THREE.Color(0xffffff), 0.45);
      mist.position.x = Math.sin(t * 0.02 + mist.position.z) * 4 + camera.position.x * 0.3;
    }
    for (const f of this.built.fires) f.intensity = (this.layout.interior ? 7 : 5) + Math.sin(t * 11) * 0.8 + Math.sin(t * 23) * 0.5;
    for (const f of this.flames) f.scale.set(1 + Math.sin(t * 13 + f.position.x) * 0.08, 1 + Math.sin(t * 17) * 0.15, 1);
    // Windows and lamps: dim and warm by day, over-bright gold (and blooming) by night.
    const lit = this.layout.interior ? 1 : light.lamps;
    for (const mat of this.glowMats) {
      const base = new THREE.Color(mat.userData.baseColor as number);
      const power = mat.userData.power as number;
      mat.color.copy(base).multiplyScalar(0.45 + lit * (power - 0.45));
    }
    for (const h of this.halos) h.material.opacity = lit * (0.42 + Math.sin(t * 2.3 + h.position.x) * 0.06);
    for (const g of this.exitGlows) (g.material as THREE.MeshBasicMaterial).opacity = 0.32 + Math.sin(t * 2.4) * 0.14;
    for (const g of this.glints) {
      g.rotation.z = t * 0.3;
      (g.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * 3.1) * 0.25;
    }
    for (const w of this.built.group.children) {
      if (w.name === 'water-shine') w.position.x += Math.sin(t * 0.6) * 0.004;
      if (w.name === 'backdrop') w.position.x = camera.position.x * (w.userData.parallax as number);
    }
  }
}
