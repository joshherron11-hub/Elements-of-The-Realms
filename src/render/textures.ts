import * as THREE from 'three';

/**
 * Painted procedural textures (no image assets). Small canvases tiled across
 * the ground: soft colour blotches, fallen leaves, cobbles, planks. Seeded, so
 * a scene looks the same every time it is drawn.
 */

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

function shade(c: number, k: number): number {
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((c >> s) & 255) * k)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function finish(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

const cache = new Map<string, THREE.CanvasTexture>();

function cached(key: string, make: () => HTMLCanvasElement): THREE.CanvasTexture {
  let t = cache.get(key);
  if (!t) {
    t = finish(make());
    cache.set(key, t);
  }
  return t;
}

/** Earth or grass: blotches of lighter and darker colour, a scatter of leaves. */
export function groundTexture(base: number, leaves: number[]): THREE.CanvasTexture {
  return cached(`ground:${base}:${leaves.join(',')}`, () => {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d')!;
    const r = rng(base);
    x.fillStyle = hex(base);
    x.fillRect(0, 0, S, S);
    // Soft blotches (drawn wrapped so the tile repeats seamlessly).
    for (let i = 0; i < 60; i++) {
      const px = r() * S;
      const py = r() * S;
      const rad = 10 + r() * 34;
      x.fillStyle = hex(shade(base, r() < 0.5 ? 0.86 : 1.12));
      x.globalAlpha = 0.35;
      for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]] as const) {
        x.beginPath();
        x.ellipse(px + ox, py + oy, rad, rad * 0.7, r() * 3, 0, Math.PI * 2);
        x.fill();
      }
    }
    // Leaves and specks.
    x.globalAlpha = 0.9;
    for (let i = 0; i < 140; i++) {
      x.fillStyle = hex(i % 4 === 0 && leaves.length ? leaves[i % leaves.length]! : shade(base, 0.7 + r() * 0.2));
      const px = r() * S;
      const py = r() * S;
      x.save();
      x.translate(px, py);
      x.rotate(r() * Math.PI);
      x.fillRect(-2, -1, 4 + r() * 3, 2);
      x.restore();
    }
    return c;
  });
}

/** Rounded cobbles with dark joints: the town square and the market lane. */
export function cobbleTexture(base: number, joint: number): THREE.CanvasTexture {
  return cached(`cobble:${base}:${joint}`, () => {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d')!;
    const r = rng(base + 7);
    x.fillStyle = hex(joint);
    x.fillRect(0, 0, S, S);
    const rows = 8;
    const h = S / rows;
    for (let row = 0; row < rows; row++) {
      const off = row % 2 ? h * 0.5 : 0;
      for (let col = -1; col < rows + 1; col++) {
        const w = h * (0.9 + r() * 0.35);
        const cx = col * h + off + h / 2;
        const cy = row * h + h / 2;
        x.fillStyle = hex(shade(base, 0.82 + r() * 0.3));
        x.beginPath();
        x.ellipse(cx, cy, w * 0.44, h * 0.4, (r() - 0.5) * 0.3, 0, Math.PI * 2);
        x.fill();
        // A little light on the top edge of each stone.
        x.fillStyle = hex(shade(base, 1.25));
        x.globalAlpha = 0.35;
        x.beginPath();
        x.ellipse(cx - w * 0.06, cy - h * 0.12, w * 0.26, h * 0.14, 0, 0, Math.PI * 2);
        x.fill();
        x.globalAlpha = 1;
      }
    }
    return c;
  });
}

/** Packed earth road with cart ruts. */
export function dirtTexture(base: number): THREE.CanvasTexture {
  return cached(`dirt:${base}`, () => {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d')!;
    const r = rng(base + 3);
    x.fillStyle = hex(base);
    x.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) {
      x.fillStyle = hex(shade(base, 0.75 + r() * 0.45));
      x.globalAlpha = 0.5;
      x.beginPath();
      x.arc(r() * S, r() * S, 1 + r() * 3, 0, Math.PI * 2);
      x.fill();
    }
    x.globalAlpha = 0.25;
    x.fillStyle = hex(shade(base, 0.7));
    for (const y of [S * 0.32, S * 0.68]) x.fillRect(0, y, S, 6);
    return c;
  });
}

/** Floorboards for interiors. */
export function plankTexture(base: number): THREE.CanvasTexture {
  return cached(`plank:${base}`, () => {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d')!;
    const r = rng(base + 11);
    const n = 8;
    const h = S / n;
    for (let i = 0; i < n; i++) {
      x.fillStyle = hex(shade(base, 0.85 + r() * 0.3));
      x.fillRect(0, i * h, S, h);
      x.fillStyle = hex(shade(base, 0.55));
      x.fillRect(0, i * h, S, 2);
      const seam = r() * S;
      x.fillRect(seam, i * h, 2, h);
      x.globalAlpha = 0.25;
      for (let k = 0; k < 4; k++) x.fillRect(r() * S, i * h + r() * h, 30 + r() * 40, 1);
      x.globalAlpha = 1;
    }
    return c;
  });
}

/** A soft round shadow (and glow) sprite. */
export function softDisc(): THREE.CanvasTexture {
  return cached('disc', () => {
    const S = 64;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
    return c;
  });
}
