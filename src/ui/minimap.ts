import type { SceneLayout, Vec2 } from '../render/layout';

/**
 * A small map of the current section: zones, water, paths, exits, people,
 * Familiars and the player. Presentation only.
 */
export interface MinimapMarks {
  player: Vec2;
  facing: number;
  npcs: Vec2[];
  pets: Vec2[];
  readables: Vec2[];
  currentZone?: string;
}

const ZONE_COLORS = ['#5d6b3a', '#7a3b2e', '#55505a', '#9a7a52', '#6b4a2b'];

export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(size = 150) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = size * 2;
    this.canvas.height = size * 2;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.ctx = this.canvas.getContext('2d')!;
  }

  draw(layout: SceneLayout, marks: MinimapMarks): void {
    const c = this.ctx;
    const S = this.canvas.width;
    const [W, D] = layout.size;
    const scale = (S * 0.92) / Math.max(W, D);
    const ox = S / 2;
    const oz = S / 2;
    const px = (x: number) => ox + x * scale;
    const pz = (z: number) => oz + z * scale;
    c.clearRect(0, 0, S, S);
    c.fillStyle = 'rgba(18,12,12,0.85)';
    c.fillRect(0, 0, S, S);
    layout.zones.forEach((z, i) => {
      const [x0, z0, x1, z1] = z.rect;
      c.fillStyle = ZONE_COLORS[i % ZONE_COLORS.length]!;
      c.globalAlpha = z.locationId === marks.currentZone ? 0.95 : 0.55;
      c.fillRect(px(x0), pz(z0), (x1 - x0) * scale, (z1 - z0) * scale);
    });
    c.globalAlpha = 1;
    c.fillStyle = '#1b2433';
    for (const [x0, z0, x1, z1] of layout.water) c.fillRect(px(x0), pz(z0), (x1 - x0) * scale, (z1 - z0) * scale);
    c.fillStyle = 'rgba(255,217,168,0.35)';
    for (const p of layout.paths) {
      const [x0, z0, x1, z1] = p.rect;
      c.fillRect(px(x0), pz(z0), (x1 - x0) * scale, (z1 - z0) * scale);
    }
    const dot = (p: Vec2, r: number, color: string) => {
      c.fillStyle = color;
      c.beginPath();
      c.arc(px(p[0]), pz(p[1]), r, 0, Math.PI * 2);
      c.fill();
    };
    for (const e of layout.exits) dot(e.at, 6, '#ffd9a8');
    for (const r of marks.readables) dot(r, 3, '#e8b04a');
    for (const n of marks.npcs) dot(n, 5, '#d9642b');
    for (const p of marks.pets) dot(p, 4, '#f3ead8');
    // Player: an arrow showing facing.
    c.save();
    c.translate(px(marks.player[0]), pz(marks.player[1]));
    c.rotate(-marks.facing + Math.PI);
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(0, -9);
    c.lineTo(6, 7);
    c.lineTo(-6, 7);
    c.closePath();
    c.fill();
    c.restore();
  }
}
