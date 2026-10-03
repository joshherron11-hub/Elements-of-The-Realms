import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Enforces the layering rules from CLAUDE.md: simulation code must not depend
 * on presentation, persistence or AI, nor on ambient time/randomness/DOM.
 */
const ROOT = join(__dirname, '..', 'src');
const SIMULATION_DIRS = ['core', 'world', 'entities', 'economy', 'familiars', 'contracts', 'chronicle', 'identity'];
const SIMULATION_FILES = ['simulation.ts'];
/** The injectable real-time/random implementations are the only allowed exceptions. */
const AMBIENT_ALLOWED = new Set(['core/clock.ts', 'core/ids.ts']);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

const simFiles = [...SIMULATION_DIRS.flatMap((d) => files(join(ROOT, d))), ...SIMULATION_FILES.map((f) => join(ROOT, f))];

describe('architecture boundaries', () => {
  it.each(simFiles.map((f) => [relative(ROOT, f)]))('%s stays pure simulation', (rel) => {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
    for (const i of imports) {
      expect(i, `${rel} imports ${i}`).not.toMatch(/(^|\/)(render|ui|persistence|ai)(\/|$)|^three$|^react/);
    }
    if (!AMBIENT_ALLOWED.has(rel)) {
      const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(code, `${rel} uses ambient time/randomness/DOM`).not.toMatch(/Date\.now\(|Math\.random\(|\bwindow\.|\bdocument\.|localStorage/);
    }
  });

  it('the evidence/Canonical loop does not depend on the economic loop, and vice versa', () => {
    const canonicalFiles = [...files(join(ROOT, 'identity'))];
    for (const f of canonicalFiles) {
      const src = readFileSync(f, 'utf8');
      expect(src, relative(ROOT, f)).not.toMatch(/from\s+['"][^'"]*\/(economy|contracts|familiars)(\/[^'"]*)?['"]/);
    }
    for (const dir of ['economy', 'contracts', 'familiars']) {
      for (const f of files(join(ROOT, dir))) {
        const src = readFileSync(f, 'utf8');
        expect(src, relative(ROOT, f)).not.toMatch(/from\s+['"][^'"]*\/identity(\/[^'"]*)?['"]/);
      }
    }
  });
});
