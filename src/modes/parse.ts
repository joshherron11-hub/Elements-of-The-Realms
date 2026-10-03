import { err, ok, type Result } from '../core/result';
import { Validator } from '../core/schema';
import { INTERACTION_CATEGORIES } from '../world/realm';
import { INTENT_KINDS, MODE_KEYS, type ModeDefinition } from './types';

export function parseModes(raw: unknown, source = 'modes'): Result<ModeDefinition[]> {
  const v = new Validator(source);
  const root = v.obj(raw, '');
  const modes = v.arr(root.modes, 'modes', (x, p) => {
    const o = v.obj(x, p);
    v.noExtraKeys(o, ['key', 'name', 'summary', 'status', 'domain', 'categories', 'intents', 'requires', 'contractKinds'], p);
    const def: ModeDefinition = {
      key: v.oneOf(o.key, MODE_KEYS, `${p}.key`),
      name: v.str(o.name, `${p}.name`),
      summary: v.str(o.summary, `${p}.summary`),
      status: v.oneOf(o.status, ['implemented', 'planned'] as const, `${p}.status`),
      domain: v.oneOf(o.domain, ['PLAY', 'LEARN', 'WORK', 'CREATE'] as const, `${p}.domain`),
      categories: v.arr(o.categories, `${p}.categories`, (c, cp) => v.oneOf(c, INTERACTION_CATEGORIES, cp)),
      intents: v.arr(o.intents, `${p}.intents`, (c, cp) => v.oneOf(c, INTENT_KINDS, cp)),
    };
    if (o.requires !== undefined) {
      const r = v.obj(o.requires, `${p}.requires`);
      def.requires = {
        pvp: r.pvp === undefined ? undefined : v.bool(r.pvp, `${p}.requires.pvp`),
        war: r.war === undefined ? undefined : v.bool(r.war, `${p}.requires.war`),
      };
    }
    if (o.contractKinds !== undefined) def.contractKinds = v.arr(o.contractKinds, `${p}.contractKinds`, (c, cp) => v.str(c, cp));
    if (def.status === 'implemented' && !def.intents.length) v.fail(`${p}.intents`, 'an implemented mode needs at least one intent');
    if (def.status === 'planned' && def.intents.length) v.fail(`${p}.intents`, 'a planned mode must not expose intents yet');
    return def;
  });
  const seen = new Set<string>();
  for (const m of modes) {
    if (seen.has(m.key)) v.fail('modes', `duplicate mode ${m.key}`);
    seen.add(m.key);
  }
  for (const k of MODE_KEYS) if (!seen.has(k)) v.fail('modes', `missing mode ${k}`);
  return v.ok ? ok(modes) : err('INVALID_CONTENT', v.errors.join('\n'));
}
