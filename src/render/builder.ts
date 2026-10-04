import * as THREE from 'three';
import type { Materials } from './materials';
import type { PropSpec, SceneLayout, Rect } from './layout';
import { footprint } from './footprint';
import { cobbleTexture, dirtTexture, groundTexture, plankTexture, softDisc } from './textures';

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
  /** Lamps and windows that light up at night. */
  nightLights: THREE.Object3D[];
  /** Water surfaces (animated). */
  water: THREE.Mesh[];
  /** Hearth lights (flicker). */
  fires: THREE.PointLight[];
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

/** A timber-framed house: stone plinth, beams, lit windows, gable roof with overhang, chimney. */
function roofed(m: Materials, w: number, d: number, h: number, wall: number, roof: number): THREE.Group {
  const P = m.palette;
  const g = new THREE.Group();
  const plinth = m.mesh(new THREE.BoxGeometry(w + 0.3, 0.55, d + 0.3), P.stone, true, 0.05);
  plinth.position.y = 0.27;
  g.add(plinth);
  const body = m.mesh(new THREE.BoxGeometry(w, h - 0.5, d), wall);
  body.position.y = 0.5 + (h - 0.5) / 2;
  g.add(body);
  // Dark timber framing on the street face: corner posts, a mid rail, a cross brace.
  const beam = P.ink === wall ? P.timber : 0x2e1d14;
  const front = d / 2 + 0.04;
  for (const x of [-w / 2 + 0.1, w / 2 - 0.1, 0]) {
    if (x === 0 && w < 6) continue;
    const post = m.mesh(new THREE.BoxGeometry(0.2, h - 0.5, 0.1), beam, false);
    post.position.set(x, 0.5 + (h - 0.5) / 2, front);
    g.add(post);
  }
  const rail = m.mesh(new THREE.BoxGeometry(w, 0.18, 0.1), beam, false);
  rail.position.set(0, h * 0.55, front);
  g.add(rail);
  const eave = m.mesh(new THREE.BoxGeometry(w, 0.2, 0.1), beam, false);
  eave.position.set(0, h - 0.1, front);
  g.add(eave);
  // Door with a frame and a step.
  const dw = Math.min(1.2, w * 0.2);
  const dh = Math.min(2.1, h * 0.5);
  const doorX = w >= 8 ? w * 0.3 : 0;
  const door = m.mesh(new THREE.BoxGeometry(dw, dh, 0.08), 0x3a2416, false);
  door.position.set(doorX, 0.5 + dh / 2, front + 0.02);
  g.add(door);
  const lintel = m.mesh(new THREE.BoxGeometry(dw + 0.3, 0.18, 0.14), beam, false);
  lintel.position.set(doorX, 0.5 + dh + 0.09, front + 0.03);
  g.add(lintel);
  const step = m.mesh(new THREE.BoxGeometry(dw + 0.5, 0.18, 0.5), P.stone, false);
  step.position.set(doorX, 0.09, d / 2 + 0.35);
  g.add(step);
  // Warm windows (they glow at night) with frames and sills.
  const winY = Math.max(1.6, h * 0.42);
  const xs = w >= 8 ? [-w * 0.3, -w * 0.05] : w >= 5 ? [-w * 0.28, w * 0.28] : [w * 0.25];
  for (const x of xs) {
    if (Math.abs(x - doorX) < dw) continue;
    const frame = m.mesh(new THREE.BoxGeometry(1.05, 0.9, 0.08), beam, false);
    frame.position.set(x, winY, front + 0.01);
    g.add(frame);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.65), m.glow(P.gold, 2.6));
    pane.position.set(x, winY, front + 0.06);
    pane.name = 'window-glow';
    g.add(pane);
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.65, 0.04), m.toon(beam));
    mullion.position.set(x, winY, front + 0.08);
    g.add(mullion);
    const sill = m.mesh(new THREE.BoxGeometry(1.2, 0.12, 0.3), beam, false);
    sill.position.set(x, winY - 0.5, front + 0.12);
    g.add(sill);
    if (h > 4) {
      const upper = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.55), m.glow(P.gold, 2.6));
      upper.position.set(x, h * 0.78, front + 0.06);
      upper.name = 'window-glow';
      g.add(upper);
    }
  }
  // Gable roof: an extruded triangle with overhang, plus a ridge beam.
  const rh = Math.max(1.6, h * 0.5);
  const half = d / 2 + 0.5;
  const shape = new THREE.Shape([new THREE.Vector2(-half, 0), new THREE.Vector2(half, 0), new THREE.Vector2(0, rh)]);
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: w + 0.7, bevelEnabled: false });
  roofGeo.translate(0, 0, -(w + 0.7) / 2);
  roofGeo.rotateY(Math.PI / 2);
  const r = m.mesh(roofGeo, roof, true, 0.08);
  r.position.y = h - 0.05;
  g.add(r);
  const ridge = m.mesh(new THREE.BoxGeometry(w + 0.9, 0.16, 0.16), beam, false);
  ridge.position.y = h + rh - 0.05;
  g.add(ridge);
  const chimney = m.mesh(new THREE.BoxGeometry(0.7, rh + 0.9, 0.7), P.stone, true, 0.05);
  chimney.position.set(-w * 0.32, h + (rh + 0.9) / 2 - 0.1, -d * 0.15);
  g.add(chimney);
  return g;
}

function tree(m: Materials, color: number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const trunk = m.mesh(new THREE.CylinderGeometry(0.2, 0.32, 2, 6), m.palette.timber, true, 0.04);
  trunk.position.y = 1;
  g.add(trunk);
  // Two faceted crown blobs: a painterly autumn silhouette from very few triangles.
  const crown = m.mesh(new THREE.IcosahedronGeometry(1.7, 0), color, true, 0.08);
  crown.position.y = 3.1;
  g.add(crown);
  const top = m.mesh(new THREE.IcosahedronGeometry(1.15, 0), color, true, 0.07);
  top.position.set(0.35, 4.3, -0.2);
  top.rotation.y = 0.7;
  g.add(top);
  g.scale.setScalar(scale);
  return g;
}

/** A lantern on a post (or hanging): glowing core and a soft halo that shows at night. */
function lantern(m: Materials, height: number, withPost: boolean): THREE.Group {
  const P = m.palette;
  const g = new THREE.Group();
  if (withPost) {
    const pole = m.mesh(new THREE.CylinderGeometry(0.07, 0.1, height, 6), P.ink, false);
    pole.position.y = height / 2;
    g.add(pole);
    const arm = m.mesh(new THREE.BoxGeometry(0.6, 0.07, 0.07), P.ink, false);
    arm.position.set(0.25, height - 0.05, 0);
    g.add(arm);
  }
  const x = withPost ? 0.5 : 0;
  const cage = m.mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.45, 6), P.ink, false);
  cage.position.set(x, height - 0.4, 0);
  g.add(cage);
  const cap = m.mesh(new THREE.ConeGeometry(0.28, 0.25, 6), P.ink, false);
  cap.position.set(x, height - 0.05, 0);
  g.add(cap);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), m.glow(P.gold, 3));
  core.position.set(x, height - 0.4, 0);
  core.name = 'lamp-glow';
  g.add(core);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDisc(), color: P.gold, transparent: true, opacity: 0, depthWrite: false }));
  halo.scale.setScalar(2.6);
  halo.position.set(x, height - 0.4, 0);
  halo.name = 'lamp-halo';
  g.add(halo);
  return g;
}

function prop(m: Materials, p: PropSpec, labels: Label[], layout: SceneLayout): THREE.Object3D {
  const interior = layout.interior;
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
    case 'wall': {
      // Interiors are dioramas: the wall nearest the camera is cut away to a low sill.
      const near = interior && p.at[1] >= layout.size[1] / 2 - 1.5;
      const wh = near ? Math.min(h, 0.9) : h;
      const g = new THREE.Group();
      const body = m.mesh(new THREE.BoxGeometry(w, wh, d), c(interior ? 'timber' : 'stone'));
      body.position.y = wh / 2;
      g.add(body);
      if (interior && !near) {
        // Wainscot and a top beam give the room a lived-in frame.
        const panel = m.mesh(new THREE.BoxGeometry(w + 0.02, 1.1, d + 0.04), 0x3a2416, false);
        panel.position.y = 0.55;
        g.add(panel);
        const beam = m.mesh(new THREE.BoxGeometry(w + 0.1, 0.25, d + 0.1), 0x2e1d14, false);
        beam.position.y = wh - 0.12;
        g.add(beam);
      } else if (!interior) {
        const cap = m.mesh(new THREE.BoxGeometry(w + 0.2, 0.25, d + 0.2), 0x6e6870, false);
        cap.position.y = wh;
        g.add(cap);
      }
      o = g;
      break;
    }
    case 'counter': case 'table': {
      const [tw, td, th] = p.type === 'table' ? [2, 1.4, 0.9] : [w, d, h];
      o = m.mesh(new THREE.BoxGeometry(tw, th, td), P.timber);
      o.position.y = th / 2;
      break;
    }
    case 'hearth': {
      const g = new THREE.Group();
      const stone = m.mesh(new THREE.BoxGeometry(1.4, 2.6, 2.8), P.stone);
      stone.position.y = 1.3;
      g.add(stone);
      const mantle = m.mesh(new THREE.BoxGeometry(1.8, 0.25, 3.1), P.timber, false);
      mantle.position.y = 2.0;
      g.add(mantle);
      const mouth = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.2), new THREE.MeshBasicMaterial({ color: 0x1a0c08 }));
      mouth.rotation.y = Math.PI / 2;
      mouth.position.set(0.71, 0.75, 0);
      g.add(mouth);
      for (const [y, s, c, pw] of [[0.45, 1, P.ember, 2.6], [0.4, 0.6, P.gold, 3.2]] as const) {
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.42 * s, 1.0 * s, 6), m.glow(c, pw));
        flame.position.set(0.75, y + 0.1, 0);
        flame.name = 'flame';
        g.add(flame);
      }
      const logs = m.mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 5), P.timber, false);
      logs.rotation.x = Math.PI / 2;
      logs.position.set(0.75, 0.15, 0);
      g.add(logs);
      const light = new THREE.PointLight(0xff8a3c, 7, 12, 1.5);
      light.position.set(1.4, 1.2, 0);
      g.add(light);
      o = g;
      break;
    }
    case 'stall': {
      const g = new THREE.Group();
      const counter = m.mesh(new THREE.BoxGeometry(3.4, 1, 2.2), P.timber);
      counter.position.y = 0.5;
      g.add(counter);
      const cloth = m.mesh(new THREE.BoxGeometry(3.5, 0.5, 0.06), c('ember'), false);
      cloth.position.set(0, 0.72, 1.13);
      g.add(cloth);
      // Striped awning: alternating colour bands read as "market" from across the square.
      const stripe = [c('ember'), P.light];
      for (let i = 0; i < 6; i++) {
        const band = m.mesh(new THREE.BoxGeometry(3.9 / 6, 0.12, 3), stripe[i % 2]!, false);
        band.position.set(-3.9 / 2 + (i + 0.5) * (3.9 / 6), 2.75, 0.1);
        band.rotation.x = -0.22;
        g.add(band);
        const flap = m.mesh(new THREE.BoxGeometry(3.9 / 6, 0.35, 0.04), stripe[i % 2]!, false);
        flap.position.set(-3.9 / 2 + (i + 0.5) * (3.9 / 6), 2.28, 1.62);
        g.add(flap);
      }
      for (const [x, z] of [[-1.8, -1.1], [1.8, -1.1], [-1.8, 1.1], [1.8, 1.1]] as const) {
        const post = m.mesh(new THREE.CylinderGeometry(0.08, 0.08, z < 0 ? 3.1 : 2.4, 5), P.timber, false);
        post.position.set(x, z < 0 ? 1.55 : 1.2, z);
        g.add(post);
      }
      // Wares: apples, loaves, jars, a cloth bundle.
      const wares = [P.crimson, P.gold, P.ember, P.moss, P.light];
      for (let i = 0; i < 7; i++) {
        const ware = new THREE.Mesh(i % 3 === 0 ? new THREE.BoxGeometry(0.34, 0.24, 0.3) : new THREE.SphereGeometry(0.17, 7, 5), m.toon(wares[(i + Math.round(p.at[0])) % wares.length]!));
        ware.position.set(-1.3 + i * 0.43, 1.12, 0.35 + (i % 2) * 0.35);
        ware.castShadow = true;
        g.add(ware);
      }
      const basket = m.mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.35, 8), P.gold, true, 0.04);
      basket.position.set(2.1, 0.18, 1);
      g.add(basket);
      o = g;
      break;
    }
    case 'well': {
      const g = new THREE.Group();
      const ring = m.mesh(new THREE.CylinderGeometry(1.1, 1.2, 1, 12), P.stone);
      ring.position.y = 0.5;
      g.add(ring);
      const water = new THREE.Mesh(new THREE.CircleGeometry(0.95, 14), m.toon(0x1b2433));
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.85;
      g.add(water);
      for (const x of [-1, 1]) {
        const post = m.mesh(new THREE.BoxGeometry(0.16, 2.4, 0.16), P.timber, false);
        post.position.set(x, 1.2, 0);
        g.add(post);
      }
      const crank = m.mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 6), P.timber, false);
      crank.rotation.z = Math.PI / 2;
      crank.position.y = 1.9;
      g.add(crank);
      const bucket = m.mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.32, 8), P.timber, true, 0.03);
      bucket.position.set(0.2, 1.45, 0);
      g.add(bucket);
      const roof = m.mesh(new THREE.ConeGeometry(1.6, 1, 4), P.roof, true, 0.06);
      roof.position.y = 2.75;
      roof.rotation.y = Math.PI / 4;
      g.add(roof);
      o = g;
      break;
    }
    case 'tree':
      o = tree(m, c('ember'), 0.95 + ((Math.abs(p.at[0] * 13 + p.at[1] * 7) % 10) / 10) * 0.35);
      o.rotation.y = p.at[0];
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
    case 'lamp':
      o = lantern(m, 3.3, true);
      break;
    case 'lantern': {
      // Hanging lantern; indoors it also lights the room.
      const g = lantern(m, p.size?.[2] ?? 3.4, false);
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 4), m.toon(P.ink));
      chain.position.y = (p.size?.[2] ?? 3.4) + 0.5;
      g.add(chain);
      if (interior) {
        const l = new THREE.PointLight(0xffb060, 3.2, 8, 1.6);
        l.position.y = (p.size?.[2] ?? 3.4) - 0.6;
        g.add(l);
      }
      o = g;
      break;
    }
    case 'board': case 'signpost': {
      const g = new THREE.Group();
      const pole = m.mesh(new THREE.BoxGeometry(0.15, 2, 0.15), P.timber, false);
      pole.position.y = 1;
      g.add(pole);
      const board = m.mesh(new THREE.BoxGeometry(p.type === 'board' ? 2 : 1.6, p.type === 'board' ? 1.3 : 0.6, 0.12), p.type === 'board' ? P.timber : P.light, true, 0.04);
      board.position.y = p.type === 'board' ? 2.1 : 2.2;
      g.add(board);
      if (p.type === 'board') {
        // Pinned notices.
        for (let i = 0; i < 4; i++) {
          const note = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.5), m.toon(i % 2 ? P.light : 0xf3ead8));
          note.position.set(-0.65 + i * 0.43, 2.1 + (i % 2 ? 0.15 : -0.12), 0.07);
          note.rotation.z = (i - 1.5) * 0.08;
          g.add(note);
        }
        const roof = m.mesh(new THREE.BoxGeometry(2.4, 0.12, 0.5), P.roof, false);
        roof.position.y = 2.85;
        g.add(roof);
      } else {
        const arrow = m.mesh(new THREE.ConeGeometry(0.3, 0.4, 3), P.light, false);
        arrow.rotation.z = -Math.PI / 2;
        arrow.position.set(0.95, 2.2, 0);
        g.add(arrow);
      }
      if (p.label) labels.push({ text: p.label, position: new THREE.Vector3(p.at[0], 3, p.at[1]), kind: 'sign' });
      o = g;
      break;
    }
    case 'crate': {
      const g = new THREE.Group();
      const box = m.mesh(new THREE.BoxGeometry(1, 1, 1), 0x7a5232);
      box.position.y = 0.5;
      g.add(box);
      for (const y of [0.15, 0.85]) {
        const slat = m.mesh(new THREE.BoxGeometry(1.04, 0.12, 1.04), P.timber, false);
        slat.position.y = y;
        g.add(slat);
      }
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), m.toon(P.crimson));
      top.position.set(0.15, 1.1, 0.1);
      g.add(top);
      g.rotation.y = (p.at[0] * 7) % 1;
      o = g;
      break;
    }
    case 'barrel': {
      const g = new THREE.Group();
      const body = m.mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.05, 10), 0x7a5232);
      body.position.y = 0.52;
      g.add(body);
      for (const y of [0.18, 0.86]) {
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.035, 4, 14), m.toon(P.ink));
        hoop.rotation.x = Math.PI / 2;
        hoop.position.y = y;
        g.add(hoop);
      }
      o = g;
      break;
    }
    case 'sack': {
      const g = new THREE.Group();
      const body = m.mesh(new THREE.SphereGeometry(0.42, 8, 6), 0xc9a878, true, 0.04);
      body.scale.set(1, 1.15, 0.9);
      body.position.y = 0.45;
      g.add(body);
      const tie = m.mesh(new THREE.ConeGeometry(0.16, 0.25, 6), 0xc9a878, false);
      tie.position.y = 0.98;
      g.add(tie);
      o = g;
      break;
    }
    case 'woodpile': {
      const g = new THREE.Group();
      for (let i = 0; i < 9; i++) {
        const row = i < 4 ? 0 : i < 7 ? 1 : 2;
        const col = i < 4 ? i : i < 7 ? i - 4 : i - 7;
        const log = m.mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.6, 6), i % 2 ? P.timber : 0x7a5232, false);
        log.rotation.x = Math.PI / 2;
        log.position.set(-0.6 + col * 0.4 + row * 0.2, 0.2 + row * 0.36, 0);
        g.add(log);
      }
      o = g;
      break;
    }
    case 'pumpkins': {
      const g = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const s = 0.28 + (i % 3) * 0.1;
        const pk = m.mesh(new THREE.SphereGeometry(s, 10, 6), i === 2 ? P.gold : P.ember, true, 0.03);
        pk.scale.y = 0.75;
        pk.position.set(Math.cos(i * 1.9) * 0.4, s * 0.7, Math.sin(i * 1.9) * 0.4);
        g.add(pk);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.14, 4), m.toon(P.moss));
        stem.position.set(pk.position.x, s * 1.35, pk.position.z);
        g.add(stem);
      }
      o = g;
      break;
    }
    case 'bush': {
      const g = new THREE.Group();
      const col = c('moss');
      for (let i = 0; i < 3; i++) {
        const b = m.mesh(new THREE.IcosahedronGeometry(0.55 + (i % 2) * 0.15, 0), col, true, 0.05);
        b.position.set(Math.cos(i * 2.1) * 0.4, 0.45, Math.sin(i * 2.1) * 0.35);
        g.add(b);
      }
      o = g;
      break;
    }
    case 'planter': {
      const g = new THREE.Group();
      const box = m.mesh(new THREE.BoxGeometry(w || 1.6, 0.45, 0.55), P.timber);
      box.position.y = 0.23;
      g.add(box);
      for (let i = 0; i < 5; i++) {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 4), m.toon(i % 2 ? P.crimson : P.gold));
        f.position.set(-0.6 + i * 0.3, 0.55, (i % 2) * 0.1);
        g.add(f);
      }
      o = g;
      break;
    }
    case 'bunting': {
      // Flags strung between two poles across a lane.
      const g = new THREE.Group();
      const span = p.size?.[0] ?? 8;
      const height = p.size?.[2] ?? 4.2;
      for (const x of [-span / 2, span / 2]) {
        const pole = m.mesh(new THREE.CylinderGeometry(0.07, 0.09, height, 5), P.timber, false);
        pole.position.set(x, height / 2, 0);
        g.add(pole);
      }
      const string = new THREE.Group();
      string.name = 'bunting';
      const flags = Math.max(4, Math.round(span / 0.7));
      const colors = [P.crimson, P.gold, P.ember, P.light];
      const flagGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.22, 0, 0), new THREE.Vector3(0.22, 0, 0), new THREE.Vector3(0, -0.5, 0)]);
      flagGeo.computeVertexNormals();
      for (let i = 0; i < flags; i++) {
        const k = (i + 0.5) / flags;
        const sag = Math.sin(k * Math.PI) * 0.7;
        const flag = new THREE.Mesh(flagGeo, new THREE.MeshToonMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide }));
        flag.position.set(-span / 2 + k * span, height - 0.15 - sag, 0);
        string.add(flag);
      }
      g.add(string);
      o = g;
      break;
    }
    case 'rock':
      o = m.mesh(new THREE.DodecahedronGeometry(0.8), P.stone);
      o.position.y = 0.4;
      break;
    case 'scarecrow': {
      const g = new THREE.Group();
      const post = m.mesh(new THREE.BoxGeometry(0.15, 2.4, 0.15), P.timber, false);
      post.position.y = 1.2;
      const arms = m.mesh(new THREE.BoxGeometry(1.8, 0.12, 0.12), P.timber, false);
      arms.position.y = 1.8;
      const coat = m.mesh(new THREE.ConeGeometry(0.55, 1.1, 6), P.crimson);
      coat.position.y = 1.5;
      const head = m.mesh(new THREE.SphereGeometry(0.28, 8, 6), P.gold);
      head.position.y = 2.3;
      const hat = m.mesh(new THREE.ConeGeometry(0.45, 0.5, 8), P.ink);
      hat.position.y = 2.65;
      g.add(post, arms, coat, head, hat);
      o = g;
      break;
    }
    case 'haystack':
      o = m.mesh(new THREE.SphereGeometry(1.1, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2), P.gold);
      break;
    case 'cart': {
      const g = new THREE.Group();
      const bed = m.mesh(new THREE.BoxGeometry(2.6, 0.5, 1.4), P.timber);
      bed.position.y = 0.9;
      bed.rotation.z = 0.12; // the broken axle sags
      g.add(bed);
      for (const x of [-0.9, 0.9]) {
        const wheel = m.mesh(new THREE.TorusGeometry(0.45, 0.08, 6, 14), P.ink, false);
        wheel.position.set(x, 0.45, 0.75);
        g.add(wheel);
      }
      const fallen = m.mesh(new THREE.TorusGeometry(0.45, 0.08, 6, 14), P.ink, false);
      fallen.rotation.x = Math.PI / 2;
      fallen.position.set(0.9, 0.08, -1.1);
      g.add(fallen);
      o = g;
      break;
    }
    case 'bed': {
      const g = new THREE.Group();
      const frame = m.mesh(new THREE.BoxGeometry(2, 0.5, 3), P.timber);
      frame.position.y = 0.25;
      const quilt = m.mesh(new THREE.BoxGeometry(1.8, 0.2, 2.2), c('crimson'), false);
      quilt.position.set(0, 0.6, 0.3);
      const pillow = m.mesh(new THREE.BoxGeometry(1.4, 0.2, 0.5), P.light, false);
      pillow.position.set(0, 0.6, -1.1);
      g.add(frame, quilt, pillow);
      o = g;
      break;
    }
    case 'chest': {
      const g = new THREE.Group();
      const box = m.mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), P.timber);
      box.position.y = 0.35;
      const band = m.mesh(new THREE.BoxGeometry(1.25, 0.1, 0.85), P.gold, false);
      band.position.y = 0.55;
      g.add(box, band);
      o = g;
      break;
    }
    case 'bench':
      o = m.mesh(new THREE.BoxGeometry(2, 0.5, 0.6), P.timber);
      o.position.y = 0.25;
      break;
    case 'shelf': {
      const g = new THREE.Group();
      const back = m.mesh(new THREE.BoxGeometry(2.2, 2, 0.4), P.timber);
      back.position.y = 1;
      g.add(back);
      for (let i = 0; i < 6; i++) {
        const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 6), m.toon(i % 2 ? P.gold : P.ember));
        jar.position.set(-0.8 + i * 0.32, 0.75 + (i % 2) * 0.7, 0.25);
        g.add(jar);
      }
      o = g;
      break;
    }
    case 'shrine': {
      const g = new THREE.Group();
      const stone = m.mesh(new THREE.BoxGeometry(0.8, 1.2, 0.5), P.stone);
      stone.position.y = 0.6;
      const roof = m.mesh(new THREE.ConeGeometry(0.7, 0.5, 4), P.moss);
      roof.position.y = 1.45;
      roof.rotation.y = Math.PI / 4;
      const offering = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), m.toon(P.crimson));
      offering.position.set(0, 0.1, 0.45);
      g.add(stone, roof, offering);
      o = g;
      break;
    }
    case 'memorial': {
      const g = new THREE.Group();
      const stone = m.mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.8, 6), P.stone);
      stone.position.y = 0.9;
      g.add(stone);
      o = g;
      break;
    }
    case 'boat': {
      const g = new THREE.Group();
      const hull = m.mesh(new THREE.CylinderGeometry(0.7, 0.4, 3, 6, 1, false, 0, Math.PI), P.timber);
      hull.rotation.z = Math.PI / 2;
      hull.rotation.y = Math.PI / 2;
      hull.position.y = 0.25;
      g.add(hull);
      o = g;
      break;
    }
    case 'flowers': {
      const g = new THREE.Group();
      for (let i = 0; i < 7; i++) {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), m.toon(i % 3 === 0 ? P.gold : i % 3 === 1 ? P.crimson : P.ember));
        f.position.set(Math.cos(i * 2.4) * 0.6, 0.25, Math.sin(i * 2.4) * 0.6);
        g.add(f);
      }
      o = g;
      break;
    }
    case 'banner': {
      const g = new THREE.Group();
      const pole = m.mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.6, 5), P.ink, false);
      pole.position.y = 1.8;
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.4), new THREE.MeshToonMaterial({ color: c('crimson'), side: THREE.DoubleSide }));
      cloth.position.set(0.42, 2.8, 0);
      cloth.name = 'banner-cloth';
      g.add(pole, cloth);
      o = g;
      break;
    }
    case 'rug': {
      o = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m.toon(c('crimson')));
      o.rotation.x = -Math.PI / 2;
      o.position.y = 0.03;
      break;
    }
    case 'pen': {
      const g = new THREE.Group();
      for (const [x, z, len, rot] of [[0, -d / 2, w, 0], [0, d / 2, w, 0], [-w / 2, 0, d, Math.PI / 2], [w / 2, 0, d, Math.PI / 2]] as const) {
        const rail = m.mesh(new THREE.BoxGeometry(len, 0.12, 0.12), P.timber, false);
        rail.position.set(x, 0.7, z);
        rail.rotation.y = rot;
        g.add(rail);
      }
      o = g;
      break;
    }
  }
  const holder = new THREE.Group();
  holder.add(o);
  holder.position.set(p.at[0], 0, p.at[1]);
  if (p.label && p.type === 'building') labels.push({ text: p.label, position: new THREE.Vector3(p.at[0], h * 1.7 + 0.8, p.at[1]), kind: 'place' });
  return holder;
}

/** Presentation-only pseudo-random in [0,1). */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Scale a plane's UVs so a shared tiling texture repeats every `tile` metres. */
function tileUv(geo: THREE.BufferGeometry, w: number, d: number, tile: number): THREE.BufferGeometry {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile);
  uv.needsUpdate = true;
  return geo;
}

function flat(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  return mesh;
}

function shadeHex(c: number, k: number): number {
  return new THREE.Color(c).multiplyScalar(k).getHex();
}

const inside = (x: number, z: number, [x0, z0, x1, z1]: Rect, pad = 0) => x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad;

/**
 * Ground scatter: grass tufts, pebbles and leaf drifts as three instanced
 * meshes (three draw calls for hundreds of pieces). Kept off paths, water,
 * exits and solid props.
 */
function scatter(layout: SceneLayout, m: Materials, density: number): THREE.Object3D[] {
  const P = m.palette;
  const [W, D] = layout.size;
  const solids = layout.props.map((p) => ({ p, fp: footprint(p) })).filter((x) => x.fp);
  const free = (x: number, z: number) =>
    !layout.paths.some((p) => inside(x, z, p.rect, 0.4)) &&
    !layout.water.some((r) => inside(x, z, r, 0.3)) &&
    !layout.exits.some((e) => Math.hypot(e.at[0] - x, e.at[1] - z) < e.radius + 0.5) &&
    !solids.some(({ p, fp }) => Math.abs(p.at[0] - x) < fp![0] / 2 + 0.3 && Math.abs(p.at[1] - z) < fp![1] / 2 + 0.3);
  const kinds = [
    { geo: new THREE.ConeGeometry(0.16, 0.55, 4), colors: [P.moss, P.gold, 0x7c7a3a, P.ember], n: 0.07, y: 0.25, s: [0.7, 1.5] },
    { geo: new THREE.DodecahedronGeometry(0.2, 0), colors: [P.stone, 0x6e6870, 0x8a8278], n: 0.02, y: 0.06, s: [0.6, 1.4] },
    { geo: new THREE.IcosahedronGeometry(0.26, 0).scale(1.3, 0.2, 0.8), colors: [P.ember, P.crimson, P.gold], n: 0.03, y: 0.03, s: [0.6, 1.2] },
  ];
  const out: THREE.Object3D[] = [];
  const mat = m.toon(0xffffff);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  kinds.forEach((k, ki) => {
    const want = Math.round(W * D * k.n * density);
    const mesh = new THREE.InstancedMesh(k.geo, mat, want);
    let n = 0;
    for (let i = 0; i < want * 3 && n < want; i++) {
      const x = (hash(i * 3.1 + ki * 101) - 0.5) * (W - 1);
      const z = (hash(i * 7.3 + ki * 53) - 0.5) * (D - 1);
      if (!free(x, z)) continue;
      const sc = k.s[0]! + hash(i + ki) * (k.s[1]! - k.s[0]!);
      dummy.position.set(x, k.y * sc, z);
      dummy.rotation.set(ki === 0 ? (hash(i + 5) - 0.5) * 0.4 : 0, hash(i + 9) * Math.PI * 2, 0);
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      mesh.setColorAt(n, color.setHex(k.colors[Math.floor(hash(i + 17) * k.colors.length)]!));
      n++;
    }
    mesh.count = n;
    mesh.receiveShadow = true;
    out.push(mesh);
  });
  return out;
}

/**
 * The world beyond the walkable edge: a ring of autumn trees on three sides
 * and low hedges on the camera side (so they frame the view without hiding
 * the player). Instanced: a handful of draw calls.
 */
function surroundings(layout: SceneLayout, m: Materials, density: number): THREE.Object3D[] {
  const P = m.palette;
  const [W, D] = layout.size;
  const hw = W / 2;
  const hd = D / 2;
  const spots: { x: number; z: number; s: number; low: boolean }[] = [];
  const step = 4.6 / Math.max(0.6, density);
  let seed = 1;
  const band = (x0: number, x1: number, z0: number, z1: number, low: boolean) => {
    for (let x = x0; x <= x1; x += step) {
      for (let z = z0; z <= z1; z += step) {
        seed++;
        spots.push({ x: x + (hash(seed) - 0.5) * step * 0.8, z: z + (hash(seed + 0.5) - 0.5) * step * 0.8, s: 0.8 + hash(seed + 0.3) * 0.7, low });
      }
    }
  };
  band(-hw - 14, hw + 14, -hd - 16, -hd - 2.5, false); // far side
  band(-hw - 16, -hw - 2.5, -hd, hd + 4, false); // left
  band(hw + 2.5, hw + 16, -hd, hd + 4, false); // right
  band(-hw - 4, hw + 4, hd + 1.5, hd + 4, true); // near side: low hedges only
  const trees = spots.filter((s) => !s.low);
  const hedges = spots.filter((s) => s.low);
  const colors = [P.ember, P.gold, P.crimson, P.ember, 0x9a5a2a, P.moss];
  const out: THREE.Object3D[] = [];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const make = (geo: THREE.BufferGeometry, mat: THREE.Material, list: typeof spots, place: (d: THREE.Object3D, s: (typeof spots)[number], i: number) => void, tint?: (i: number) => number, cast = true) => {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((s, i) => {
      dummy.rotation.set(0, hash(i + 3) * 6.28, 0);
      dummy.scale.setScalar(s.s);
      place(dummy, s, i);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (tint) mesh.setColorAt(i, color.setHex(tint(i)));
    });
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    out.push(mesh);
  };
  const white = m.toon(0xffffff);
  const crown = new THREE.IcosahedronGeometry(2, 0);
  const shell = crown.clone().scale(1.07, 1.07, 1.07);
  make(new THREE.CylinderGeometry(0.25, 0.38, 2.6, 6), m.toon(P.timber), trees, (d, s) => d.position.set(s.x, 1.3 * s.s, s.z));
  make(crown, white, trees, (d, s) => d.position.set(s.x, 3.6 * s.s, s.z), (i) => colors[Math.floor(hash(i * 1.7) * colors.length)]!);
  make(shell, m.outline, trees, (d, s) => d.position.set(s.x, 3.6 * s.s, s.z), undefined, false);
  make(new THREE.IcosahedronGeometry(0.9, 0), white, hedges, (d, s) => d.position.set(s.x, 0.6, s.z), (i) => [P.moss, 0x7c7a3a, P.ember][i % 3]!);
  return out;
}

/** Build one walkable section from its layout. `density` scales decoration for the graphics preset. */
export function buildSection(layout: SceneLayout, m: Materials, density = 1): BuiltSection {
  const P = m.palette;
  const group = new THREE.Group();
  const labels: Label[] = [];
  const [W, D] = layout.size;
  const groundColor = m.color(layout.ground, 'ground');

  if (layout.interior) {
    const floor = flat(tileUv(new THREE.PlaneGeometry(W, D), W, D, 5), m.textured(plankTexture(groundColor)), 0, 0, 0);
    group.add(floor);
    // Dark warm surroundings instead of a black void.
    const outside = flat(new THREE.PlaneGeometry(W + 80, D + 80), new THREE.MeshBasicMaterial({ color: 0x1d120d }), 0, -0.05, 0);
    group.add(outside);
  } else {
    const tex = groundTexture(groundColor, [P.ember, P.gold, P.crimson]);
    group.add(flat(tileUv(new THREE.PlaneGeometry(W, D), W, D, 7), m.textured(tex), 0, 0, 0));
    // The land carries on past the walkable edge and fades into the fog.
    const skirt = flat(tileUv(new THREE.PlaneGeometry(W + 260, D + 260), W + 260, D + 260, 7), m.textured(tex, 0xd6c8b8), 0, -0.04, 0);
    group.add(skirt);
  }

  layout.paths.forEach((path, i) => {
    const [x0, z0, x1, z1] = path.rect;
    const w = x1 - x0;
    const d = z1 - z0;
    const base = m.color(path.color, 'path');
    const surface = path.surface ?? 'dirt';
    const lift = i * 0.002;
    if (surface !== 'plain') {
      // A darker kerb so walkways read clearly against the ground.
      group.add(flat(new THREE.PlaneGeometry(w + 0.7, d + 0.7), m.toon(shadeHex(base, 0.58)), (x0 + x1) / 2, 0.012 + lift, (z0 + z1) / 2));
    }
    const tex = surface === 'cobble' ? cobbleTexture(base, shadeHex(base, 0.5)) : surface === 'dirt' ? dirtTexture(base) : undefined;
    const mat = tex ? m.textured(tex) : m.toon(base);
    group.add(flat(tileUv(new THREE.PlaneGeometry(w, d), w, d, surface === 'cobble' ? 3 : 6), mat, (x0 + x1) / 2, 0.022 + lift, (z0 + z1) / 2));
  });

  layout.backdrops.forEach((b, i) => {
    const plane = backdrop(b.kind, m.color(b.color, 'crimson'), W * 2.6, b.height * 2.2, i * 7 + 3);
    plane.position.set(0, b.height * 0.9, -D / 2 - b.distance + 30);
    plane.name = 'backdrop';
    plane.userData.parallax = 0.25 + i * 0.25; // further layers follow the camera more (2.5D depth)
    group.add(plane);
  });

  for (const p of layout.props) group.add(prop(m, p, labels, layout));
  if (!layout.interior) {
    for (const o of scatter(layout, m, density)) group.add(o);
    for (const o of surroundings(layout, m, density)) group.add(o);
  }

  const nodeMarkers = new Map<string, THREE.Object3D>();
  for (const [id, at] of Object.entries(layout.nodes)) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.35, 32), m.glow(P.gold, 1.3, 0.85));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(at[0], 0.05, at[1]);
    group.add(ring);
    nodeMarkers.set(id, ring);
  }

  const exitMarkers: THREE.Object3D[] = [];
  for (const e of layout.exits) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(e.radius * 0.72, e.radius, 40), new THREE.MeshBasicMaterial({ color: P.light, transparent: true, opacity: 0.5, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(e.at[0], 0.04, e.at[1]);
    group.add(ring);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(e.radius * 0.72, 32), new THREE.MeshBasicMaterial({ map: softDisc(), color: P.gold, transparent: true, opacity: 0.35, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(e.at[0], 0.035, e.at[1]);
    glow.name = 'exit-glow';
    group.add(glow);
    exitMarkers.push(ring);
  }

  const nightLights: THREE.Object3D[] = [];
  const fires: THREE.PointLight[] = [];
  group.traverse((o) => {
    if (o instanceof THREE.PointLight) fires.push(o);
    if (o.name === 'lamp-glow' || o.name === 'window-glow' || o.name === 'lamp-halo') nightLights.push(o);
  });

  const water: THREE.Mesh[] = [];
  for (const [x0, z0, x1, z1] of layout.water) {
    const bank = flat(new THREE.PlaneGeometry(x1 - x0 + 1.2, z1 - z0 + 1.2), m.toon(shadeHex(groundColor, 0.6)), (x0 + x1) / 2, 0.03, (z0 + z1) / 2);
    const surface = flat(new THREE.PlaneGeometry(x1 - x0, z1 - z0, 12, 12), new THREE.MeshToonMaterial({ color: 0x23304a, transparent: true, opacity: 0.94 }), (x0 + x1) / 2, 0.06, (z0 + z1) / 2);
    group.add(bank, surface);
    for (let k = 0; k < 3; k++) {
      const shine = new THREE.Mesh(new THREE.PlaneGeometry((x1 - x0) * (0.25 + k * 0.12), 0.12), m.glow(P.light, 1.1, 0.4));
      shine.rotation.x = -Math.PI / 2;
      shine.position.set(x0 + (x1 - x0) * (0.3 + k * 0.2), 0.08, z0 + (z1 - z0) * (0.3 + k * 0.22));
      shine.name = 'water-shine';
      group.add(shine);
    }
    water.push(surface);
  }

  return { group, labels, nodeMarkers, exitMarkers, nightLights, water, fires };
}
