import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { CLIPS, chooseClip, createHumanoid, humanoidOf, animateHumanoid } from '../src/render/characters/humanoid';
import { HumanoidAsset } from '../src/render/characters/library';
import { activityGesture } from '../src/render/characters';
import { paletteFromLook, SLOTS } from '../src/render/characters/palette';
import { parseLooks } from '../src/render/looks';
import looksJson from '../realms/happy-fall/looks/blackmere.json';

const glb = readFileSync(new URL('../assets/characters/blackmere-humanoid.glb', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('../assets/characters/blackmere-humanoid.manifest.json', import.meta.url), 'utf8')) as {
  slots: string[];
  bones: number;
};

async function loadAsset(): Promise<HumanoidAsset> {
  const buf = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
  const gltf = await new GLTFLoader().parseAsync(buf, '');
  return new HumanoidAsset('blackmere-humanoid', gltf);
}

const looks = parseLooks(looksJson);
const pip = looks.ok ? looks.value.people['actor_pip-ashdown']! : undefined;

describe('Blackmere humanoid asset', () => {
  it('ships a shared skeleton, every animation state and three LODs', async () => {
    const a = await loadAsset();
    expect(a.boneNames.length).toBe(manifest.bones);
    for (const c of CLIPS) expect(a.clips.has(c), c).toBe(true);
    expect(a.lodCount).toBe(3);
    for (const b of ['hips', 'spine', 'chest', 'neck', 'head', 'jaw', 'upper_armL', 'forearmL', 'handL', 'fingersL', 'thighL', 'shinL', 'footL', 'socket_handR', 'socket_back'])
      expect(a.boneNames, b).toContain(b);
  });

  it('palette slots baked into the asset match the runtime palette', () => {
    expect(manifest.slots).toEqual([...SLOTS]);
  });

  it('has every part the reference look uses, and budgets per LOD', async () => {
    const a = await loadAsset();
    expect(pip?.model).toBeDefined();
    for (const p of pip!.model!.parts) expect(a.has(p), p).toBe(true);
    const tris = [0, 1, 2].map((l) => a.triangles(pip!.model!.parts, l));
    expect(tris[0]).toBeLessThan(24_000);
    expect(tris[1]).toBeLessThan(tris[0]! * 0.5);
    expect(tris[2]).toBeLessThan(4_500);
  });

  it('hides covered body segments and swaps hair for its under-hat variant', async () => {
    const a = await loadAsset();
    const names = a.resolve(pip!.model!.parts).map((p) => p.name);
    expect(names).toContain('body_neck');
    expect(names).not.toContain('body_torso'); // under the tunic
    expect(names).not.toContain('body_feet'); // in boots
    expect(names).toContain('hair_tousled_hat');
    expect(names).not.toContain('hair_tousled');
    const bare = a.resolve(['body_base', 'head_a']).map((p) => p.name);
    expect(bare).toContain('body_torso');
  });

  it('assembles a character that animates through the clip library', async () => {
    const a = await loadAsset();
    const fig = createHumanoid(a, { parts: pip!.model!.parts, palette: paletteFromLook(pip!), height: pip!.height, groundShadow: false }, 4);
    const r = humanoidOf(fig)!;
    const meshes: THREE.SkinnedMesh[] = [];
    fig.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh);
    });
    expect(meshes.length).toBe(3); // one merged mesh per LOD (no outline requested)
    expect(new Set(meshes.map((m) => m.skeleton)).size).toBe(1);
    const thigh = r.bones.get('thighL')!;
    const rest = thigh.quaternion.clone();
    animateHumanoid(fig, { t: 0, dt: 0.4, walk: 1 });
    expect(r.current).toBe('walk');
    animateHumanoid(fig, { t: 0, dt: 0.25, walk: 1 });
    expect(thigh.quaternion.angleTo(rest)).toBeGreaterThan(0.05);
  });

  it('geometry is shared between characters wearing the same parts', async () => {
    const a = await loadAsset();
    expect(a.geometry(['body_base', 'head_a'], 0)).toBe(a.geometry(['head_a', 'body_base'], 0));
  });
});

describe('humanoid presentation rules', () => {
  it('chooses clips from the same pose input as the old figures', () => {
    expect(chooseClip({ t: 0, walk: 0 }).clip).toBe('idle');
    expect(chooseClip({ t: 0, walk: 1 }).clip).toBe('walk');
    expect(chooseClip({ t: 0, walk: 1.4 }).clip).toBe('run');
    expect(chooseClip({ t: 0, walk: 0, talking: true }).clip).toBe('talk');
    expect(chooseClip({ t: 0, walk: 0, seated: true }).clip).toBe('sit');
    expect(chooseClip({ t: 0, walk: 0, sleeping: true }).clip).toBe('sleep');
    expect(chooseClip({ t: 0, walk: 0, turn: 0.05 }).clip).toBe('turn');
    expect(chooseClip({ t: 0, walk: 0 }, 'work').clip).toBe('work');
    expect(chooseClip({ t: 0, walk: 0 }, 'celebrate').clip).toBe('celebrate');
    expect(chooseClip({ t: 0, walk: 1 }, 'carry').clip).toBe('carry');
  });

  it('maps routine activities to gestures without touching the routine', () => {
    expect(activityGesture('deliveries')).toBe('carry');
    expect(activityGesture('orchard-work')).toBe('work');
    expect(activityGesture('sorting-letters')).toBe('interact');
    expect(activityGesture('asleep')).toBeUndefined();
  });

  it('palettes come from the look, with per-model overrides', () => {
    const p = paletteFromLook(pip!, { iris: 0x123456 });
    expect(p.skin).toBe(pip!.skin);
    expect(p.top).toBe(pip!.colors.body);
    expect(p.iris).toBe(0x123456);
  });

  it('validates the model block in looks data', () => {
    const bad = parseLooks({ people: { x: { skin: '#ffffff', hair: '#000000', colors: { body: '#111111', accent: '#222222' }, model: { asset: 'a', parts: 'nope' } } } });
    expect(bad.ok).toBe(false);
  });
});
