import type { SceneLayout, Vec2 } from '../render/layout';
import { footprint } from '../render/footprint';

/**
 * A small map of the current section: zones, water, paths, buildings, exits,
 * people, Familiars and the player. Presentation only.
 */
export interface MinimapMarks {
  player: Vec2;
  facing: number;
  npcs: Vec2[];
  pets: Vec2[];
  readables: Vec2[];
  currentZone?: string;
  /** Place names written on the map (zones, landmarks). */
  places?: { text: string; at: Vec2 }[];
}

const ZONE_COLORS = ['#6f7a40', '#8a4a33', '#5e5868', '#a07a4a', '#7a5a34'];

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
    const scale = (S * 0.9) / Math.max(W, D);
    const px = (x: number) => S / 2 + x * scale;
    const pz = (z: number) => S / 2 + z * scale;
    const rect = (x0: number, z0: number, x1: number, z1: number) => c.fillRect(px(x0), pz(z0), (x1 - x0) * scale, (z1 - z0) * scale);
    c.clearRect(0, 0, S, S);
    c.fillStyle = '#1a1210';
    c.fillRect(0, 0, S, S);
    c.fillStyle = layout.interior ? '#4a3222' : '#3b3424';
    rect(-W / 2, -D / 2, W / 2, D / 2);
    layout.zones.forEach((z, i) => {
      const [x0, z0, x1, z1] = z.rect;
      c.fillStyle = layout.interior ? '#7a5234' : ZONE_COLORS[i % ZONE_COLORS.length]!;
      c.globalAlpha = z.locationId === marks.currentZone ? 0.95 : 0.5;
      rect(x0, z0, x1, z1);
    });
    c.globalAlpha = 1;
    c.fillStyle = '#2a3c5c';
    for (const [x0, z0, x1, z1] of layout.water) rect(x0, z0, x1, z1);
    c.fillStyle = 'rgba(246,226,190,0.55)';
    for (const p of layout.paths) rect(...p.rect);
    // Buildings and big props as dark blocks: the map reads like a plan of the town.
    for (const p of layout.props) {
      const fp = footprint(p);
      if (!fp || fp[0] * fp[1] < 3) continue;
      c.fillStyle = p.type === 'building' || p.type === 'keep' || p.type === 'gatehouse' || p.type === 'wall' ? 'rgba(18,10,8,0.85)' : 'rgba(18,10,8,0.45)';
      rect(p.at[0] - fp[0] / 2, p.at[1] - fp[1] / 2, p.at[0] + fp[0] / 2, p.at[1] + fp[1] / 2);
    }
    const dot = (p: Vec2, r: number, fill: string) => {
      c.beginPath();
      c.arc(px(p[0]), pz(p[1]), r, 0, Math.PI * 2);
      c.fillStyle = fill;
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = 'rgba(10,6,6,0.9)';
      c.stroke();
    };
    for (const e of layout.exits) {
      c.save();
      c.translate(px(e.at[0]), pz(e.at[1]));
      c.rotate(Math.PI / 4);
      c.fillStyle = '#ffd98a';
      c.strokeStyle = 'rgba(10,6,6,0.9)';
      c.lineWidth = 2;
      c.fillRect(-6, -6, 12, 12);
      c.strokeRect(-6, -6, 12, 12);
      c.restore();
    }
    for (const r of marks.readables) dot(r, 3.5, '#e8b04a');
    for (const p of marks.pets) dot(p, 5, '#f6ead6');
    for (const n of marks.npcs) dot(n, 6.5, '#e2683a');
    // Place names, small caps with a dark halo so they read over any colour.
    c.font = `600 ${Math.round(S * 0.045)}px Georgia, serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const pl of marks.places ?? []) {
      c.lineWidth = 4;
      c.strokeStyle = 'rgba(10,6,6,0.85)';
      c.strokeText(pl.text, px(pl.at[0]), pz(pl.at[1]));
      c.fillStyle = '#f6e6c6';
      c.fillText(pl.text, px(pl.at[0]), pz(pl.at[1]));
    }
    // Player: a bright arrow with an outline, pointing where they face.
    c.save();
    c.translate(px(marks.player[0]), pz(marks.player[1]));
    c.rotate(-marks.facing + Math.PI);
    c.beginPath();
    c.moveTo(0, -13);
    c.lineTo(9, 9);
    c.lineTo(0, 4);
    c.lineTo(-9, 9);
    c.closePath();
    c.fillStyle = '#ffffff';
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = '#120c0c';
    c.stroke();
    c.restore();
  }
}
