import * as THREE from 'three';
import { inHours } from '../world/living';
import type { BuiltSection } from './builder';
import { createFigure } from './figures';
import type { ExtraSpec, SceneLayout, Vec2 } from './layout';
import type { Lighting } from './lighting';
import type { Materials } from './materials';

/**
 * Ambient life: presentation only. Leaves drift, smoke rises, fireflies come
 * out at night, banners sway, hearths flicker, villagers walk their rounds,
 * hens peck and crows hop. Nothing here touches the simulation; the time of
 * day is read from it to decide what is lit and who is about.
 */
interface ExtraView {
  spec: ExtraSpec;
  obj: THREE.Object3D;
  seed: number;
}

function animal(m: Materials, kind: ExtraSpec['kind'], color?: string): THREE.Group {
  const P = m.palette;
  const g = new THREE.Group();
  switch (kind) {
    case 'chicken': {
      const body = m.mesh(new THREE.SphereGeometry(0.28, 8, 6), 0xf3ead8);
      body.position.y = 0.32;
      const comb = m.mesh(new THREE.BoxGeometry(0.06, 0.12, 0.14), P.crimson, false);
      comb.position.set(0, 0.6, 0.18);
      g.add(body, comb);
      break;
    }
    case 'sheep': {
      const body = m.mesh(new THREE.SphereGeometry(0.55, 10, 8), 0xefe9df);
      body.scale.set(1, 0.8, 1.3);
      body.position.y = 0.6;
      const head = m.mesh(new THREE.SphereGeometry(0.22, 8, 6), P.ink);
      head.position.set(0, 0.75, 0.7);
      g.add(body, head);
      break;
    }
    case 'crow': {
      const body = m.mesh(new THREE.ConeGeometry(0.16, 0.5, 5), P.ink, false);
      body.rotation.x = Math.PI / 2.3;
      body.position.y = 0.25;
      g.add(body);
      break;
    }
    case 'cat': {
      const body = m.mesh(new THREE.BoxGeometry(0.3, 0.3, 0.6), m.color(color, 'ember'));
      body.position.y = 0.2;
      const head = m.mesh(new THREE.SphereGeometry(0.17, 8, 6), m.color(color, 'ember'));
      head.position.set(0, 0.42, 0.32);
      for (const x of [-0.08, 0.08]) {
        const ear = m.mesh(new THREE.ConeGeometry(0.05, 0.12, 4), P.ink, false);
        ear.position.set(x, 0.58, 0.32);
        g.add(ear);
      }
      g.add(body, head);
      break;
    }
    default:
      break;
  }
  return g;
}

/** Deterministic pseudo-random in [0,1) from a seed (presentation only). */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export class Ambient {
  private readonly extras: ExtraView[] = [];
  private leaves?: THREE.Points;
  private leafVel: Float32Array = new Float32Array();
  private readonly smoke: { sprite: THREE.Mesh; base: THREE.Vector3; t: number }[] = [];
  private fireflies?: THREE.Points;
  private readonly banners: THREE.Object3D[] = [];

  constructor(
    private readonly layout: SceneLayout,
    private readonly m: Materials,
    private readonly built: BuiltSection,
  ) {
    const group = built.group;
    layout.extras.forEach((spec, i) => {
      const obj =
        spec.kind === 'villager' || spec.kind === 'patron'
          ? createFigure(m, { body: m.color(spec.color, 'stone'), accent: m.palette.timber, height: spec.kind === 'patron' ? 1.6 : 2 })
          : animal(m, spec.kind, spec.color);
      const start = spec.at ?? spec.path![0]!;
      obj.position.set(start[0], 0, start[1]);
      if (spec.kind === 'patron') obj.position.y = -0.25; // seated
      group.add(obj);
      this.extras.push({ spec, obj, seed: i * 13.7 + start[0] });
    });

    const [W, D] = layout.size;
    if (layout.ambient.leaves > 0) {
      const n = layout.ambient.leaves;
      const pos = new Float32Array(n * 3);
      this.leafVel = new Float32Array(n * 3);
      const colors = new Float32Array(n * 3);
      const palette = [m.palette.ember, m.palette.gold, m.palette.crimson].map((c) => new THREE.Color(c));
      for (let i = 0; i < n; i++) {
        pos.set([(hash(i) - 0.5) * W, hash(i + 99) * 12, (hash(i + 7) - 0.5) * D], i * 3);
        this.leafVel.set([0.4 + hash(i + 3) * 0.6, -(0.4 + hash(i + 5) * 0.5), 0.2 * (hash(i + 11) - 0.5)], i * 3);
        const c = palette[i % 3]!;
        colors.set([c.r, c.g, c.b], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      this.leaves = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, opacity: 0.9 }));
      group.add(this.leaves);
    }

    for (const [x, z, h] of layout.ambient.smoke) {
      for (let k = 0; k < 4; k++) {
        const sprite = new THREE.Mesh(new THREE.CircleGeometry(0.45, 10), new THREE.MeshBasicMaterial({ color: 0xcfc4b8, transparent: true, opacity: 0.35, depthWrite: false }));
        const base = new THREE.Vector3(x + 0.8, h, z);
        sprite.position.copy(base);
        group.add(sprite);
        this.smoke.push({ sprite, base, t: k / 4 });
      }
    }

    if (layout.ambient.fireflies) {
      const n = 40;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) pos.set([(hash(i + 1) - 0.5) * W * 0.8, 0.6 + hash(i + 2) * 2.2, (hash(i + 3) - 0.5) * D * 0.8], i * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.fireflies = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.22, color: m.palette.gold, transparent: true, opacity: 0 }));
      group.add(this.fireflies);
    }

    group.traverse((o) => {
      if (o.name === 'banner-cloth') this.banners.push(o);
    });
  }

  update(dtMs: number, tMs: number, hour: number, light: Lighting, camera: THREE.Camera): void {
    const dt = dtMs / 1000;
    const t = tMs / 1000;
    const [W, D] = this.layout.size;

    for (const e of this.extras) {
      const present = !e.spec.hours || inHours(Math.floor(hour), e.spec.hours[0], e.spec.hours[1]);
      e.obj.visible = present;
      if (!present) continue;
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
        e.obj.position.y = Math.abs(Math.sin(t * 6 + e.seed)) * 0.06;
      } else if (e.spec.at) {
        const home: Vec2 = e.spec.at;
        const slot = Math.floor((t + e.seed) / 3);
        const wander = e.spec.kind === 'chicken' || e.spec.kind === 'sheep' || e.spec.kind === 'cat' ? 1.2 : e.spec.kind === 'crow' ? 0.6 : 0;
        const tx = home[0] + (hash(slot + e.seed) - 0.5) * 2 * wander;
        const tz = home[1] + (hash(slot + e.seed + 50) - 0.5) * 2 * wander;
        const dx = tx - e.obj.position.x;
        const dz = tz - e.obj.position.z;
        if (Math.hypot(dx, dz) > 0.05) {
          e.obj.position.x += dx * Math.min(1, dt * 1.5);
          e.obj.position.z += dz * Math.min(1, dt * 1.5);
          e.obj.rotation.y = Math.atan2(dx, dz);
        }
        if (e.spec.kind === 'chicken') e.obj.rotation.x = Math.max(0, Math.sin(t * 5 + e.seed)) * 0.5; // pecking
        if (e.spec.kind === 'crow') e.obj.position.y = Math.max(0, Math.sin(t * 3 + e.seed)) * 0.4; // hopping
        if (e.spec.kind === 'patron') e.obj.rotation.y = Math.sin(t * 0.7 + e.seed) * 0.6;
      }
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

    for (const s of this.smoke) {
      s.t = (s.t + dt * 0.18) % 1;
      s.sprite.position.set(s.base.x + Math.sin(s.t * 4) * 0.4 + s.t * 1.2, s.base.y + s.t * 4, s.base.z);
      s.sprite.scale.setScalar(0.6 + s.t * 1.6);
      (s.sprite.material as THREE.MeshBasicMaterial).opacity = 0.4 * (1 - s.t);
      s.sprite.quaternion.copy(camera.quaternion);
    }

    if (this.fireflies) {
      (this.fireflies.material as THREE.PointsMaterial).opacity = light.lamps * (0.55 + Math.sin(t * 3) * 0.35);
      this.fireflies.position.y = Math.sin(t * 0.8) * 0.3;
    }

    for (const b of this.banners) b.rotation.y = Math.sin(t * 1.6 + b.position.x) * 0.35;
    for (const f of this.built.fires) f.intensity = 5 + Math.sin(t * 11) * 0.8 + Math.sin(t * 23) * 0.5;
    for (const l of this.built.nightLights) {
      const mat = (l as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.color.setHex(light.lamps > 0.5 ? this.m.palette.gold : this.m.palette.stone);
    }
    for (const w of this.built.group.children) {
      if (w.name === 'water-shine') w.position.x += Math.sin(t * 0.6) * 0.004;
      if (w.name === 'backdrop') w.position.x = camera.position.x * (w.userData.parallax as number);
    }
  }
}
