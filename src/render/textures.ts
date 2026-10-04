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

// ── Art kit surfaces ────────────────────────────────────────────────────────
// Every surface is painted on a small canvas: a light value pattern that the
// material colour tints, so one texture serves many tones.

function canvas(S = 256, H = S): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = S;
  c.height = H;
  return [c, c.getContext('2d')!];
}

const grey = (v: number, a = 1) => `rgba(${v},${v},${v},${a})`;

/** Wood: long grain streaks, a couple of knots, plank seams every 64px. */
export function woodTexture(): THREE.CanvasTexture {
  return cached('kit:wood', () => {
    const [c, x] = canvas();
    const r = rng(41);
    x.fillStyle = grey(228);
    x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) {
      const y = r() * 256;
      x.strokeStyle = grey(170 + r() * 50, 0.55);
      x.lineWidth = 1 + r() * 2;
      x.beginPath();
      x.moveTo(0, y);
      for (let px = 0; px <= 256; px += 32) x.lineTo(px, y + Math.sin(px / 40 + i) * 2.5);
      x.stroke();
    }
    for (let i = 0; i < 4; i++) {
      x.strokeStyle = grey(140, 0.7);
      x.lineWidth = 1.5;
      x.beginPath();
      x.ellipse(r() * 256, r() * 256, 6 + r() * 5, 3 + r() * 2, 0, 0, Math.PI * 2);
      x.stroke();
    }
    x.fillStyle = grey(110, 0.9);
    for (let y = 0; y < 256; y += 64) x.fillRect(0, y, 256, 3);
    return c;
  });
}

/** End grain for log ends. */
export function endGrainTexture(): THREE.CanvasTexture {
  return cached('kit:endgrain', () => {
    const [c, x] = canvas(128);
    x.fillStyle = grey(230);
    x.fillRect(0, 0, 128, 128);
    for (let r = 6; r < 64; r += 6) {
      x.strokeStyle = grey(160, 0.7);
      x.lineWidth = 2;
      x.beginPath();
      x.arc(64, 64, r, 0, Math.PI * 2);
      x.stroke();
    }
    return c;
  });
}

/** Dressed stone courses with mortar and chipped faces. */
export function stoneTexture(): THREE.CanvasTexture {
  return cached('kit:stone', () => {
    const [c, x] = canvas();
    const r = rng(53);
    x.fillStyle = grey(120);
    x.fillRect(0, 0, 256, 256);
    const rows = 5;
    const h = 256 / rows;
    for (let row = 0; row < rows; row++) {
      let px = row % 2 ? -30 : 0;
      while (px < 256) {
        const w = 50 + r() * 50;
        x.fillStyle = grey(190 + r() * 50);
        x.beginPath();
        x.roundRect(px + 3, row * h + 3, w - 6, h - 6, 6);
        x.fill();
        x.fillStyle = grey(255, 0.25);
        x.fillRect(px + 6, row * h + 5, w - 14, 4);
        x.fillStyle = grey(90, 0.25);
        for (let k = 0; k < 4; k++) x.fillRect(px + r() * w, row * h + r() * h, 4, 3);
        px += w;
      }
    }
    return c;
  });
}

/** Lime plaster with soft stains (for half-timbered walls). */
export function plasterTexture(): THREE.CanvasTexture {
  return cached('kit:plaster', () => {
    const [c, x] = canvas();
    const r = rng(67);
    x.fillStyle = grey(236);
    x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 40; i++) {
      x.fillStyle = grey(200 + r() * 40, 0.35);
      x.beginPath();
      x.ellipse(r() * 256, r() * 256, 10 + r() * 30, 8 + r() * 20, r() * 3, 0, Math.PI * 2);
      x.fill();
    }
    return c;
  });
}

/** Overlapping roof shingles in staggered rows. */
export function shingleTexture(): THREE.CanvasTexture {
  return cached('kit:shingle', () => {
    const [c, x] = canvas();
    const r = rng(71);
    x.fillStyle = grey(90);
    x.fillRect(0, 0, 256, 256);
    const rows = 8;
    const h = 256 / rows;
    for (let row = 0; row < rows; row++) {
      const off = row % 2 ? 16 : 0;
      for (let px = -32 + off; px < 256; px += 32) {
        x.fillStyle = grey(185 + r() * 60);
        x.beginPath();
        x.moveTo(px + 2, row * h);
        x.lineTo(px + 30, row * h);
        x.lineTo(px + 30, row * h + h - 6);
        x.quadraticCurveTo(px + 16, row * h + h + 2, px + 2, row * h + h - 6);
        x.closePath();
        x.fill();
      }
    }
    return c;
  });
}

/** Straw and thatch: dense short strokes. */
export function strawTexture(): THREE.CanvasTexture {
  return cached('kit:straw', () => {
    const [c, x] = canvas();
    const r = rng(83);
    x.fillStyle = grey(200);
    x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      const px = r() * 256;
      const py = r() * 256;
      x.strokeStyle = grey(150 + r() * 105, 0.8);
      x.lineWidth = 1.2;
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + (r() - 0.5) * 6, py + 10 + r() * 10);
      x.stroke();
    }
    return c;
  });
}

/** Burlap and canvas: a coarse weave. */
export function weaveTexture(): THREE.CanvasTexture {
  return cached('kit:weave', () => {
    const [c, x] = canvas(128);
    x.fillStyle = grey(225);
    x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 128; i += 4) {
      x.fillStyle = grey(180, 0.5);
      x.fillRect(i, 0, 1.5, 128);
      x.fillRect(0, i, 128, 1.5);
    }
    return c;
  });
}

/** Two-colour stripes (awnings, cushions, banners). */
export function stripeTexture(a: number, b: number, stripes = 6): THREE.CanvasTexture {
  return cached(`kit:stripe:${a}:${b}:${stripes}`, () => {
    const [c, x] = canvas(256, 64);
    const w = 256 / stripes;
    for (let i = 0; i < stripes; i++) {
      x.fillStyle = hex(i % 2 ? b : a);
      x.fillRect(i * w, 0, w, 64);
      x.fillStyle = 'rgba(0,0,0,0.12)';
      x.fillRect(i * w, 0, 2, 64);
    }
    return c;
  });
}

/** A woven rug: border, field and a central lozenge. */
export function rugTexture(field: number, border: number, accent: number): THREE.CanvasTexture {
  return cached(`kit:rug:${field}:${border}:${accent}`, () => {
    const [c, x] = canvas(256, 160);
    x.fillStyle = hex(border);
    x.fillRect(0, 0, 256, 160);
    x.fillStyle = hex(field);
    x.fillRect(16, 16, 224, 128);
    x.fillStyle = hex(accent);
    x.beginPath();
    x.moveTo(128, 30);
    x.lineTo(200, 80);
    x.lineTo(128, 130);
    x.lineTo(56, 80);
    x.closePath();
    x.fill();
    x.fillStyle = hex(field);
    x.beginPath();
    x.moveTo(128, 55);
    x.lineTo(165, 80);
    x.lineTo(128, 105);
    x.lineTo(91, 80);
    x.closePath();
    x.fill();
    x.fillStyle = hex(accent);
    for (let i = 24; i < 236; i += 16) {
      x.fillRect(i, 6, 8, 4);
      x.fillRect(i, 150, 8, 4);
    }
    return c;
  });
}

/** Leaded diamond panes for windows (drawn over the glow colour). */
export function latticeTexture(): THREE.CanvasTexture {
  return cached('kit:lattice', () => {
    const [c, x] = canvas(128);
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(40,24,16,0.85)';
    x.lineWidth = 4;
    for (let i = -128; i < 256; i += 32) {
      x.beginPath();
      x.moveTo(i, 0);
      x.lineTo(i + 128, 128);
      x.stroke();
      x.beginPath();
      x.moveTo(i + 128, 0);
      x.lineTo(i, 128);
      x.stroke();
    }
    x.lineWidth = 8;
    x.strokeRect(0, 0, 128, 128);
    x.fillRect(60, 0, 8, 128);
    return c;
  });
}

/** Handwritten paper notices. */
export function paperTexture(seed = 1): THREE.CanvasTexture {
  return cached(`kit:paper:${seed}`, () => {
    const [c, x] = canvas(96, 128);
    const r = rng(seed * 97);
    x.fillStyle = '#f2e6cc';
    x.fillRect(0, 0, 96, 128);
    x.fillStyle = '#3a2416';
    x.font = 'bold 16px Georgia, serif';
    x.fillText(['WANTED', 'NOTICE', 'FOR SALE', 'LOST'][seed % 4]!, 8, 22);
    for (let y = 36; y < 120; y += 12) x.fillRect(8, y, 40 + r() * 40, 2);
    x.fillStyle = '#a3302a';
    x.beginPath();
    x.arc(48, 6, 4, 0, Math.PI * 2);
    x.fill();
    return c;
  });
}

/** A painted signboard: border, lettering, optional emblem. */
export type SignEmblem = 'ladle' | 'arrow' | 'coin' | 'leaf' | 'key' | 'loaf' | 'jug' | 'spool' | 'apple';

export function signTexture(text: string, bg: number, ink: number, emblem?: SignEmblem): THREE.CanvasTexture {
  return cached(`kit:sign:${text}:${bg}:${ink}:${emblem ?? ''}`, () => {
    const [c, x] = canvas(512, 160);
    x.fillStyle = hex(bg);
    x.fillRect(0, 0, 512, 160);
    x.strokeStyle = hex(ink);
    x.lineWidth = 8;
    x.strokeRect(12, 12, 488, 136);
    x.fillStyle = hex(ink);
    let left = 30;
    if (emblem) {
      x.save();
      x.translate(80, 80);
      x.lineWidth = 9;
      x.strokeStyle = hex(ink);
      x.beginPath();
      if (emblem === 'ladle') {
        x.arc(-10, 20, 24, 0, Math.PI);
        x.moveTo(14, 20);
        x.lineTo(30, -50);
      } else if (emblem === 'arrow') {
        x.moveTo(-40, 0);
        x.lineTo(30, 0);
        x.moveTo(10, -22);
        x.lineTo(34, 0);
        x.lineTo(10, 22);
      } else if (emblem === 'coin') {
        x.arc(0, 0, 36, 0, Math.PI * 2);
        x.moveTo(-14, 0);
        x.lineTo(14, 0);
      } else if (emblem === 'key') {
        x.arc(-20, 0, 16, 0, Math.PI * 2);
        x.moveTo(-4, 0);
        x.lineTo(40, 0);
        x.lineTo(40, 16);
      } else if (emblem === 'loaf') {
        x.ellipse(0, 6, 42, 24, 0, 0, Math.PI * 2);
        for (const dx of [-18, 0, 18]) {
          x.moveTo(dx - 8, -6);
          x.lineTo(dx + 8, 14);
        }
      } else if (emblem === 'jug') {
        x.moveTo(-18, 36);
        x.quadraticCurveTo(-34, 0, -12, -20);
        x.lineTo(-12, -36);
        x.lineTo(12, -36);
        x.lineTo(12, -20);
        x.quadraticCurveTo(34, 0, 18, 36);
        x.closePath();
        x.moveTo(22, -14);
        x.quadraticCurveTo(44, 0, 26, 18);
      } else if (emblem === 'spool') {
        x.rect(-26, -36, 52, 10);
        x.rect(-26, 26, 52, 10);
        x.moveTo(-14, -26);
        x.lineTo(14, -14);
        x.moveTo(-14, -14);
        x.lineTo(14, -2);
        x.moveTo(-14, -2);
        x.lineTo(14, 10);
        x.moveTo(-14, 10);
        x.lineTo(14, 22);
      } else if (emblem === 'apple') {
        x.arc(-10, 8, 22, Math.PI * 0.3, Math.PI * 1.7);
        x.arc(10, 8, 22, Math.PI * 1.3, Math.PI * 0.7);
        x.moveTo(0, -14);
        x.lineTo(6, -34);
      } else {
        x.ellipse(0, 0, 20, 40, 0.5, 0, Math.PI * 2);
        x.moveTo(-20, 34);
        x.lineTo(18, -32);
      }
      x.stroke();
      x.restore();
      left = 140;
    }
    let size = 64;
    x.font = `bold ${size}px 'Cinzel', Georgia, serif`;
    while (x.measureText(text).width > 512 - left - 30 && size > 24) {
      size -= 4;
      x.font = `bold ${size}px 'Cinzel', Georgia, serif`;
    }
    x.textBaseline = 'middle';
    x.fillText(text, left, 84);
    return c;
  });
}

/** Banner emblem: a sun-leaf device over a cloth field with a trim. */
export function bannerTexture(field: number, device: number): THREE.CanvasTexture {
  return cached(`kit:banner:${field}:${device}`, () => {
    const [c, x] = canvas(128, 256);
    x.fillStyle = hex(field);
    x.fillRect(0, 0, 128, 256);
    x.fillStyle = hex(device);
    x.fillRect(0, 0, 128, 14);
    x.fillRect(8, 14, 6, 242);
    x.fillRect(114, 14, 6, 242);
    x.save();
    x.translate(64, 100);
    for (let i = 0; i < 8; i++) {
      x.rotate(Math.PI / 4);
      x.beginPath();
      x.moveTo(0, -22);
      x.lineTo(7, -46);
      x.lineTo(-7, -46);
      x.closePath();
      x.fill();
    }
    x.beginPath();
    x.arc(0, 0, 20, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = hex(field);
    x.beginPath();
    x.ellipse(0, 0, 7, 14, 0.6, 0, Math.PI * 2);
    x.fill();
    x.restore();
    return c;
  });
}

/** Carved runes on a stone face. */
export function runeTexture(): THREE.CanvasTexture {
  return cached('kit:runes', () => {
    const [c, x] = canvas(128, 256);
    const r = rng(101);
    x.fillStyle = grey(225);
    x.fillRect(0, 0, 128, 256);
    x.strokeStyle = grey(70);
    x.lineWidth = 4;
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 3; col++) {
        const cx = 26 + col * 38;
        const cy = 40 + row * 30;
        x.beginPath();
        x.moveTo(cx, cy - 10);
        x.lineTo(cx, cy + 10);
        x.moveTo(cx, cy - 4);
        x.lineTo(cx + (r() - 0.5) * 18, cy + (r() - 0.5) * 16);
        x.stroke();
      }
    }
    return c;
  });
}

/** Ground decal: soft chevrons leading out (exits). */
export function chevronDecal(): THREE.CanvasTexture {
  return cached('kit:chevron', () => {
    const [c, x] = canvas(128);
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(255,255,255,0.95)';
    x.lineWidth = 9;
    x.lineCap = 'round';
    for (const y of [44, 72]) {
      x.beginPath();
      x.moveTo(40, y + 12);
      x.lineTo(64, y - 8);
      x.lineTo(88, y + 12);
      x.stroke();
    }
    return c;
  });
}

/** Ground decal: a painted target ring with four notches (tap-to-walk). */
export function targetDecal(): THREE.CanvasTexture {
  return cached('kit:target', () => {
    const [c, x] = canvas(128);
    x.strokeStyle = 'rgba(255,255,255,0.95)';
    x.lineWidth = 7;
    x.beginPath();
    x.arc(64, 64, 40, 0, Math.PI * 2);
    x.stroke();
    x.lineWidth = 9;
    x.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      x.beginPath();
      x.moveTo(64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50);
      x.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60);
      x.stroke();
    }
    return c;
  });
}

/** Ground decal: a scatter of glints (gatherable resources). */
export function sparkleDecal(): THREE.CanvasTexture {
  return cached('kit:sparkle', () => {
    const [c, x] = canvas(128);
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    x.fillStyle = 'rgba(255,255,255,0.95)';
    const r = rng(7);
    for (let i = 0; i < 9; i++) {
      const px = 20 + r() * 88;
      const py = 20 + r() * 88;
      const s = 3 + r() * 4;
      x.beginPath();
      x.moveTo(px, py - s * 2);
      x.lineTo(px + s * 0.5, py);
      x.lineTo(px, py + s * 2);
      x.lineTo(px - s * 0.5, py);
      x.closePath();
      x.fill();
    }
    return c;
  });
}

/** Barrel and bucket staves: vertical boards with dark seams (uses the lathe's own UVs). */
export function staveTexture(): THREE.CanvasTexture {
  return cached('kit:stave', () => {
    const [c, x] = canvas(256, 128);
    const r = rng(113);
    for (let i = 0; i < 16; i++) {
      x.fillStyle = grey(200 + r() * 40);
      x.fillRect(i * 16, 0, 16, 128);
      x.fillStyle = grey(110, 0.9);
      x.fillRect(i * 16, 0, 2, 128);
      x.fillStyle = grey(170, 0.4);
      for (let k = 0; k < 3; k++) x.fillRect(i * 16 + 4 + r() * 8, r() * 128, 1, 20 + r() * 30);
    }
    return c;
  });
}

/** Vertical stripes (awnings drape front to back). */
export function stripeTextureV(a: number, b: number, stripes = 6): THREE.CanvasTexture {
  return cached(`kit:stripeV:${a}:${b}:${stripes}`, () => {
    const [c, x] = canvas(64, 256);
    const h = 256 / stripes;
    for (let i = 0; i < stripes; i++) {
      x.fillStyle = hex(i % 2 ? b : a);
      x.fillRect(0, i * h, 64, h);
      x.fillStyle = 'rgba(0,0,0,0.12)';
      x.fillRect(0, i * h, 64, 2);
    }
    return c;
  });
}

/** A single leaf with a midrib (for falling-leaf particles). */
export function leafSprite(): THREE.CanvasTexture {
  return cached('kit:leaf', () => {
    const [c, x] = canvas(64);
    x.translate(32, 32);
    x.rotate(-0.6);
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.moveTo(0, -26);
    x.quadraticCurveTo(18, -8, 0, 26);
    x.quadraticCurveTo(-18, -8, 0, -26);
    x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.35)';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(0, -22);
    x.lineTo(0, 24);
    x.stroke();
    return c;
  });
}
