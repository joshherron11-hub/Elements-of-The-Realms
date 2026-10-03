import * as THREE from 'three';
import type { Materials } from './materials';
import type { PropSpec, SceneLayout } from './layout';

export interface Label {
  text: string;
  position: THREE.Vector3;
  kind: 'place' | 'sign';
}

export interface BuiltSection {
  group: THREE.Group;
  labels: Label[];
  /** Markers for resource nodes, keyed by node id, so they can show depletion. */
  nodeMarkers: Map<string, THREE.Object3D>;
  exitMarkers: THREE.Object3D[];
}

/** Painted silhouette backdrop: a canvas texture on a far plane (2.5D layering). */
function backdrop(kind: 'hills' | 'treeline', color: number, width: number, height: number, seed: number): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.beginPath();
  ctx.moveTo(0, 256);
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  if (kind === 'hills') {
    for (let x = 0; x <= 1024; x += 16) ctx.lineTo(x, 110 + Math.sin(x / 140 + seed) * 50 + Math.sin(x / 47) * 12);
  } else {
    for (let x = 0; x <= 1024; x += 22) {
      const h = 60 + rnd() * 90;
      ctx.lineTo(x, 256 - h * 0.4);
      ctx.lineTo(x + 11, 256 - h);
    }
  }
  ctx.lineTo(1024, 256);
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: true, depthWrite: false });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
}

function roofed(m: Materials, w: number, d: number, h: number, wall: number, roof: number): THREE.Group {
  const g = new THREE.Group();
  const body = m.mesh(new THREE.BoxGeometry(w, h, d), wall);
  body.position.y = h / 2;
  g.add(body);
  const r = m.mesh(new THREE.ConeGeometry(Math.hypot(w, d) / 2 + 0.3, h * 0.55, 4), roof);
  r.rotation.y = Math.PI / 4;
  r.scale.set(w / Math.hypot(w, d) * 1.45, 1, d / Math.hypot(w, d) * 1.45);
  r.position.y = h + h * 0.275;
  g.add(r);
  // A door and a warm window, so buildings read as homes at a glance.
  const door = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(1.2, w * 0.2), Math.min(2, h * 0.45)), new THREE.MeshBasicMaterial({ color: m.palette.ink }));
  door.position.set(0, Math.min(1, h * 0.225), d / 2 + 0.01);
  g.add(door);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), new THREE.MeshBasicMaterial({ color: m.palette.gold }));
  win.position.set(w * 0.28, h * 0.6, d / 2 + 0.01);
  g.add(win);
  return g;
}

function tree(m: Materials, color: number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const trunk = m.mesh(new THREE.CylinderGeometry(0.18, 0.26, 1.4, 6), m.palette.timber, false);
  trunk.position.y = 0.7;
  g.add(trunk);
  const crown = m.mesh(new THREE.ConeGeometry(1.5, 3.6, 7), color);
  crown.position.y = 3;
  g.add(crown);
  g.scale.setScalar(scale);
  return g;
}

function prop(m: Materials, p: PropSpec, labels: Label[]): THREE.Object3D {
  const P = m.palette;
  const [w, d, h] = p.size ?? [1, 1, 1];
  const c = (fallback: keyof typeof P) => m.color(p.color, fallback);
  let o: THREE.Object3D;
  switch (p.type) {
    case 'building':
      o = roofed(m, w, d, h, c('timber'), m.color(p.roof, 'roof'));
      break;
    case 'gatehouse': {
      const g = new THREE.Group();
      for (const side of [-1, 1]) {
        const t = m.mesh(new THREE.BoxGeometry(w * 0.32, h, d), P.stone);
        t.position.set(side * w * 0.34, h / 2, 0);
        g.add(t);
      }
      const arch = m.mesh(new THREE.BoxGeometry(w * 0.4, h * 0.3, d), P.stone);
      arch.position.y = h * 0.85;
      g.add(arch);
      const gate = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.36, h * 0.7), new THREE.MeshToonMaterial({ color: P.timber }));
      gate.position.set(0, h * 0.35, d / 2 + 0.02);
      g.add(gate);
      o = g;
      break;
    }
    case 'keep': {
      const g = new THREE.Group();
      const body = m.mesh(new THREE.BoxGeometry(w, h, d), P.stone);
      body.position.y = h / 2;
      g.add(body);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const tw = m.mesh(new THREE.CylinderGeometry(1.8, 2, h * 1.25, 8), P.stone);
        tw.position.set((x * w) / 2, (h * 1.25) / 2, (z * d) / 2);
        g.add(tw);
        const cap = m.mesh(new THREE.ConeGeometry(2.4, 4, 8), P.ink);
        cap.position.set((x * w) / 2, h * 1.25 + 2, (z * d) / 2);
        g.add(cap);
      }
      labels.push({ text: 'Blackmere Keep', position: new THREE.Vector3(p.at[0], h * 1.25 + 5, p.at[1]), kind: 'place' });
      o = g;
      break;
    }
    case 'wall':
      o = m.mesh(new THREE.BoxGeometry(w, h, d), c('stone'));
      o.position.y = h / 2;
      break;
    case 'counter': case 'table': {
      const [tw, td, th] = p.type === 'table' ? [2, 1.4, 0.9] : [w, d, h];
      o = m.mesh(new THREE.BoxGeometry(tw, th, td), P.timber);
      o.position.y = th / 2;
      break;
    }
    case 'hearth': {
      const g = new THREE.Group();
      const stone = m.mesh(new THREE.BoxGeometry(1.4, 2.4, 2.6), P.stone);
      stone.position.y = 1.2;
      g.add(stone);
      const fire = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 6), new THREE.MeshBasicMaterial({ color: P.ember }));
      fire.position.set(0.72, 0.5, 0);
      g.add(fire);
      const light = new THREE.PointLight(P.ember, 6, 9, 1.6);
      light.position.set(1.2, 1.2, 0);
      g.add(light);
      o = g;
      break;
    }
    case 'stall': {
      const g = new THREE.Group();
      const counter = m.mesh(new THREE.BoxGeometry(3.4, 1, 2.2), P.timber);
      counter.position.y = 0.5;
      g.add(counter);
      const awning = m.mesh(new THREE.BoxGeometry(3.8, 0.15, 2.8), c('ember'));
      awning.position.y = 2.5;
      awning.rotation.x = -0.15;
      g.add(awning);
      for (const x of [-1.7, 1.7]) {
        const post = m.mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.5, 5), P.timber, false);
        post.position.set(x, 1.25, -1);
        g.add(post);
      }
      o = g;
      break;
    }
    case 'well': {
      const g = new THREE.Group();
      const ring = m.mesh(new THREE.CylinderGeometry(1.1, 1.2, 1, 12), P.stone);
      ring.position.y = 0.5;
      g.add(ring);
      const roof = m.mesh(new THREE.ConeGeometry(1.5, 1, 4), P.roof);
      roof.position.y = 2.6;
      roof.rotation.y = Math.PI / 4;
      g.add(roof);
      o = g;
      break;
    }
    case 'tree':
      o = tree(m, c('ember'), 1);
      break;
    case 'orchard': {
      const g = tree(m, P.moss, 0.8);
      for (let i = 0; i < 5; i++) {
        const a = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), m.toon(P.crimson));
        a.position.set(Math.cos(i * 1.3) * 0.9, 2.2 + (i % 2) * 0.6, Math.sin(i * 1.3) * 0.9);
        g.add(a);
      }
      o = g;
      break;
    }
    case 'deadwood': {
      const g = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const log = m.mesh(new THREE.CylinderGeometry(0.2, 0.22, 2, 6), P.timber);
        log.rotation.z = Math.PI / 2;
        log.rotation.y = i * 0.5;
        log.position.y = 0.2 + i * 0.25;
        g.add(log);
      }
      o = g;
      break;
    }
    case 'field': {
      const g = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const row = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, d / 12), m.toon(i % 2 ? c('gold') : P.ember));
        row.position.set(0, 0.2, -d / 2 + (i + 0.5) * (d / 6));
        g.add(row);
      }
      o = g;
      break;
    }
    case 'fence': {
      const g = new THREE.Group();
      const rail = m.mesh(new THREE.BoxGeometry(w, 0.12, 0.12), P.timber, false);
      rail.position.y = 0.8;
      g.add(rail);
      for (let x = -w / 2; x <= w / 2; x += 2) {
        const post = m.mesh(new THREE.BoxGeometry(0.16, 1.1, 0.16), P.timber, false);
        post.position.set(x, 0.55, 0);
        g.add(post);
      }
      o = g;
      break;
    }
    case 'lamp': {
      const g = new THREE.Group();
      const pole = m.mesh(new THREE.CylinderGeometry(0.06, 0.08, 3, 5), P.ink, false);
      pole.position.y = 1.5;
      g.add(pole);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: P.gold }));
      glow.position.y = 3.1;
      g.add(glow);
      o = g;
      break;
    }
    case 'board': case 'signpost': {
      const g = new THREE.Group();
      const pole = m.mesh(new THREE.BoxGeometry(0.15, 2, 0.15), P.timber, false);
      pole.position.y = 1;
      g.add(pole);
      const board = m.mesh(new THREE.BoxGeometry(1.6, 0.9, 0.1), P.light);
      board.position.y = 2;
      g.add(board);
      if (p.label) labels.push({ text: p.label, position: new THREE.Vector3(p.at[0], 3, p.at[1]), kind: 'sign' });
      o = g;
      break;
    }
    case 'crate':
      o = m.mesh(new THREE.BoxGeometry(1, 1, 1), P.timber);
      o.position.y = 0.5;
      break;
    case 'barrel':
      o = m.mesh(new THREE.CylinderGeometry(0.45, 0.45, 1, 8), P.timber);
      o.position.y = 0.5;
      break;
    case 'rock':
      o = m.mesh(new THREE.DodecahedronGeometry(0.8), P.stone);
      o.position.y = 0.4;
      break;
  }
  const holder = new THREE.Group();
  holder.add(o);
  holder.position.set(p.at[0], 0, p.at[1]);
  if (p.label && p.type === 'building') labels.push({ text: p.label, position: new THREE.Vector3(p.at[0], h * 1.7 + 0.8, p.at[1]), kind: 'place' });
  return holder;
}

/** Build one walkable section from its layout. */
export function buildSection(layout: SceneLayout, m: Materials): BuiltSection {
  const group = new THREE.Group();
  const labels: Label[] = [];
  const [W, D] = layout.size;

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, D), m.toon(m.color(layout.ground, 'ground')));
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  for (const path of layout.paths) {
    const [x0, z0, x1, z1] = path.rect;
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), m.toon(m.color(path.color, 'path')));
    decal.rotation.x = -Math.PI / 2;
    decal.position.set((x0 + x1) / 2, 0.02, (z0 + z1) / 2);
    group.add(decal);
  }

  layout.backdrops.forEach((b, i) => {
    const plane = backdrop(b.kind, m.color(b.color, 'crimson'), W * 2.4, b.height * 2.2, i * 7 + 3);
    plane.position.set(0, b.height * 0.9, -D / 2 - b.distance + 30);
    group.add(plane);
  });

  for (const p of layout.props) group.add(prop(m, p, labels));

  const nodeMarkers = new Map<string, THREE.Object3D>();
  for (const [id, at] of Object.entries(layout.nodes)) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.35, 24), new THREE.MeshBasicMaterial({ color: m.palette.gold, transparent: true, opacity: 0.8 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(at[0], 0.05, at[1]);
    group.add(ring);
    nodeMarkers.set(id, ring);
  }

  const exitMarkers: THREE.Object3D[] = [];
  for (const e of layout.exits) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(e.radius * 0.7, e.radius, 32), new THREE.MeshBasicMaterial({ color: m.palette.light, transparent: true, opacity: 0.55 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(e.at[0], 0.04, e.at[1]);
    group.add(ring);
    exitMarkers.push(ring);
  }

  return { group, labels, nodeMarkers, exitMarkers };
}
