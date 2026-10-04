import { describe, expect, it } from 'vitest';
import { footprint } from '../src/render/footprint';
import { detectQuality, QUALITY } from '../src/render/quality';
import { isBlocked } from '../src/ui/navigation';
import { loadSceneLayouts } from '../src/ui/scenes';
import type { Vec2 } from '../src/render/layout';

/**
 * Presentation guard rails for the visual pass: set dressing must never get in
 * the way of play, and the graphics presets must stay sensible.
 */
const layouts = loadSceneLayouts();

/** Is there open ground within `r` of a point (eight directions at a few distances)? */
function reachableNear(scene: string, at: Vec2, r: number): boolean {
  const layout = layouts.get(scene)!;
  for (const d of [0.6, 1.2, 1.8, r]) {
    for (let k = 0; k < 8; k++) {
      const p: Vec2 = [at[0] + Math.cos((k * Math.PI) / 4) * d, at[1] + Math.sin((k * Math.PI) / 4) * d];
      if (!isBlocked(layout, p)) return true;
    }
  }
  return false;
}

describe('set dressing never blocks play', () => {
  it('every NPC routine spot and stall-tending spot stands on open ground', () => {
    for (const layout of layouts.values()) {
      for (const [loc, spots] of Object.entries(layout.spots)) {
        for (const [name, at] of Object.entries(spots)) expect(isBlocked(layout, at), `${layout.id} ${loc}.${name}`).toBe(false);
      }
      for (const [id, at] of Object.entries(layout.stalls)) expect(isBlocked(layout, at), `${layout.id} stall ${id}`).toBe(false);
    }
  });

  it('every readable and resource node can be reached', () => {
    for (const layout of layouts.values()) {
      for (const r of layout.readables) expect(reachableNear(layout.id, r.at, 2.6), `${layout.id} ${r.id}`).toBe(true);
      for (const [id, at] of Object.entries(layout.nodes)) expect(reachableNear(layout.id, at, 2.4), `${layout.id} ${id}`).toBe(true);
    }
  });

  it('the browser smoke route stays walkable', () => {
    const town: Vec2[] = [[0, 3], [2.4, 2.2], [-20, 2], [19, 0], [17, 0.6], [28, 0], [0, -12], [2.5, -21.5], [5, -4.4], [12, 0], [19, 3], [21, 7.1], [-12, 2], [-21, 12.3]];
    for (const p of town) expect(isBlocked(layouts.get('blackmere-town')!, p), `town ${p}`).toBe(false);
    const out: Vec2[] = [[-20, 0], [8, 7], [18, 8], [16, 6], [8, -6]];
    for (const p of out) expect(isBlocked(layouts.get('blackmere-outskirts')!, p), `outskirts ${p}`).toBe(false);
  });

  it('overhead and flat decoration never blocks, whatever its size', () => {
    for (const type of ['bunting', 'lantern', 'rug', 'banner', 'flowers'] as const) {
      expect(footprint({ type, at: [0, 0], size: [10, 10, 4] })).toBeUndefined();
    }
    expect(footprint({ type: 'woodpile', at: [0, 0] })).toEqual([2, 1]);
  });
});

describe('graphics presets', () => {
  it('phones and small machines start on LOW; capable desktops on HIGH', () => {
    expect(detectQuality({ touch: true, width: 1400 })).toBe('low');
    expect(detectQuality({ touch: false, cores: 4, width: 1400 })).toBe('low');
    expect(detectQuality({ touch: false, cores: 8, memoryGb: 2, width: 1400 })).toBe('low');
    expect(detectQuality({ touch: false, cores: 8, memoryGb: 8, width: 600 })).toBe('low');
    expect(detectQuality({ touch: false, cores: 8, memoryGb: 8, width: 1400 })).toBe('high');
  });

  it('LOW is strictly cheaper than HIGH', () => {
    expect(QUALITY.low.shadows).toBe(false);
    expect(QUALITY.low.bloom).toBe(false);
    expect(QUALITY.low.maxPixelRatio).toBeLessThan(QUALITY.high.maxPixelRatio);
    expect(QUALITY.low.density).toBeLessThan(QUALITY.high.density);
  });
});

describe('character looks (presentation data)', () => {
  it('every Blackmere NPC, the player and every Familiar has an authored look', async () => {
    const { loadLooks } = await import('../src/ui/scenes');
    const { content } = await import('../src/config/content');
    const looks = loadLooks();
    expect(looks.people.player).toBeDefined();
    for (const a of content.pack('realm_happy-fall').actors) expect(looks.people[a.id], a.id).toBeDefined();
    for (const f of content.pack('realm_happy-fall').familiars ?? []) expect(looks.familiars[f.id], f.id).toBeDefined();
  });

  it('the player is visually distinct: no NPC shares their outer colour and hood', async () => {
    const { loadLooks } = await import('../src/ui/scenes');
    const looks = loadLooks();
    const me = looks.people.player!;
    for (const [id, l] of Object.entries(looks.people)) {
      if (id === 'player') continue;
      expect(l.hat === me.hat && l.colors.over === me.colors.over, id).toBe(false);
    }
    expect(me.garments).toContain('lantern');
  });

  it('rejects malformed looks with a path', async () => {
    const { parseLooks } = await import('../src/render/looks');
    const r = parseLooks({ people: { x: { skin: 'pink', hair: '#000000', colors: { body: '#000000', accent: '#000000' }, garments: ['spacesuit'] } } }, 'bad');
    expect(!r.ok && r.error.message).toContain('bad.people.x.skin');
    expect(!r.ok && r.error.message).toContain('bad.people.x.garments[0]');
  });
});

describe('authored prop variants', () => {
  it('a variant must be one the prop type knows', async () => {
    const { parseSceneLayout } = await import('../src/render/layout');
    const base = { id: 'x', name: 'x', size: [10, 10], ground: 'ground', zones: [{ locationId: 'l', rect: [-5, -5, 5, 5] }], playerStart: [0, 0] };
    expect(parseSceneLayout({ ...base, props: [{ type: 'stall', at: [0, 0], variant: 'bakery' }] }).ok).toBe(true);
    const bad = parseSceneLayout({ ...base, props: [{ type: 'stall', at: [0, 0], variant: 'spaceport' }] }, 'bad');
    expect(!bad.ok && bad.error.message).toContain('bad.props[0].variant');
    expect(parseSceneLayout({ ...base, props: [{ type: 'well', at: [0, 0], variant: 'any' }] }).ok).toBe(false);
  });

  it('every market stall in Blackmere has a trade', () => {
    const stalls = layouts.get('blackmere-town')!.props.filter((p) => p.type === 'stall');
    expect(stalls.length).toBeGreaterThanOrEqual(6);
    for (const s of stalls) expect(s.variant, `${s.at}`).toBeDefined();
    expect(new Set(stalls.map((s) => s.variant)).size).toBeGreaterThanOrEqual(4);
  });
});
