import { err, ok, type Result } from '../core/result';
import { Validator } from '../core/schema';
import type { WorldState } from './world-state';

/**
 * LIVING WORLD CONFIGURATION
 *
 * Authored rules that make a place feel inhabited: the calendar, NPC daily
 * routines, merchant hours and restocking, how off-screen townsfolk shop at
 * player stalls, situational NPC lines and Familiar personality reactions.
 *
 * These are *rules*, loaded with the content like modes and constitutions —
 * not copied into saves — so existing worlds pick up routines and reactions
 * without migration. Everything here is deterministic. All numbers are
 * PROVISIONAL placeholders (see docs/PROVISIONAL.md).
 */
export interface CalendarConfig {
  /** Real milliseconds per in-game day. */
  dayLengthMs: number;
  /** In-game hour at which a new world begins. */
  startHour: number;
}

/** Hours are [from, to); `from > to` wraps past midnight (e.g. 22 → 6). */
export interface RoutineEntry {
  from: number;
  to: number;
  locationId: string;
  activity: string;
  /** Named spot inside the location, for presentation (e.g. 'bar', 'stall', 'hearth'). */
  spot?: string;
}

export interface MarketRules {
  openHour: number;
  closeHour: number;
  /** Morning deliveries: stock is topped up to these levels once per day. */
  restock: { itemId: string; target: number }[];
}

export interface StallRules {
  /** Chance per open hour, per listed item, that a passer-by buys one at the reference price. */
  baseChancePerHour: number;
  /** Above this multiple of the reference price nothing sells. */
  maxPriceMultiple: number;
  openHour: number;
  closeHour: number;
  /** At most this many hours are simulated in one go (returning after a long absence). */
  maxCatchUpHours: number;
}

export type FamiliarReactionKind = 'acquired' | 'fed' | 'rested' | 'home' | 'bonded' | 'hungry' | 'tired' | 'idle';

export interface NpcLines {
  /** Line when talked to during a given routine activity. */
  activities?: Record<string, string>;
  /** Greeting once they think well of you. */
  friendly?: string;
  /** Short reactions after a trade. */
  barks?: string[];
}

export interface LivingConfig {
  calendar: CalendarConfig;
  routines: Record<string, RoutineEntry[]>;
  markets: Record<string, MarketRules>;
  stall: StallRules;
  npcLines: Record<string, NpcLines>;
  /** Keyed by Familiar id (individual personality) or species id (fallback). */
  familiarReactions: Record<string, Partial<Record<FamiliarReactionKind, string[]>>>;
}

/** PROVISIONAL defaults used when a Realm supplies no living configuration. */
export const DEFAULT_LIVING: LivingConfig = {
  calendar: { dayLengthMs: 24 * 60_000, startHour: 9 },
  routines: {},
  markets: {},
  stall: { baseChancePerHour: 0.35, maxPriceMultiple: 2.5, openHour: 7, closeHour: 20, maxCatchUpHours: 48 },
  npcLines: {},
  familiarReactions: {},
};

/* ------------------------------------------------------------------ */
/* Calendar — pure functions of world creation time and the clock      */
/* ------------------------------------------------------------------ */

export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';

export interface GameTime {
  /** Hours since the world began, counting from the start hour of day 0. */
  totalHours: number;
  day: number;
  hour: number;
  minute: number;
  phase: DayPhase;
}

export function phaseOf(hour: number): DayPhase {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 18) return 'day';
  if (hour >= 18 && hour < 21) return 'dusk';
  return 'night';
}

export function gameTime(state: Pick<WorldState, 'createdAt'>, now: number, cal: CalendarConfig): GameTime {
  const totalHours = cal.startHour + ((now - state.createdAt) / cal.dayLengthMs) * 24;
  const day = Math.floor(totalHours / 24);
  const hourF = totalHours - day * 24;
  const hour = Math.floor(hourF);
  return { totalHours, day, hour, minute: Math.floor((hourF - hour) * 60), phase: phaseOf(hour) };
}

export const inHours = (hour: number, from: number, to: number): boolean => (from <= to ? hour >= from && hour < to : hour >= from || hour < to);

/** The routine entry in force at an hour, if any. First match wins. */
export function routineAt(entries: readonly RoutineEntry[] | undefined, hour: number): RoutineEntry | undefined {
  return entries?.find((e) => inHours(hour, e.from, e.to));
}

/** Deterministic pick from a list (no RNG consumed): the same key always gives the same line. */
export function pickLine(lines: readonly string[] | undefined, key: string): string | undefined {
  if (!lines?.length) return undefined;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return lines[(h >>> 0) % lines.length];
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

const hour = (v: Validator, x: unknown, p: string) => v.num(x, p, 0, 24);
const REACTIONS: readonly FamiliarReactionKind[] = ['acquired', 'fed', 'rested', 'home', 'bonded', 'hungry', 'tired', 'idle'];

export function parseLiving(raw: unknown, source = 'living'): Result<LivingConfig> {
  const v = new Validator(source);
  const o = v.obj(raw, '');
  v.noExtraKeys(o, ['realmId', 'calendar', 'routines', 'markets', 'stall', 'npcLines', 'familiarReactions'], '');
  const cal = v.obj(o.calendar, 'calendar');
  const stall = v.obj(o.stall ?? {}, 'stall');
  const strings = (x: unknown, p: string) => v.arr(x, p, (s, sp) => v.str(s, sp));
  const cfg: LivingConfig = {
    calendar: { dayLengthMs: v.num(cal.dayLengthMs, 'calendar.dayLengthMs', 60_000), startHour: hour(v, cal.startHour, 'calendar.startHour') },
    routines: Object.fromEntries(
      Object.entries(v.obj(o.routines ?? {}, 'routines')).map(([actor, list]) => [
        actor,
        v.arr(list, `routines.${actor}`, (e, p) => {
          const eo = v.obj(e, p);
          v.noExtraKeys(eo, ['from', 'to', 'locationId', 'activity', 'spot'], p);
          return { from: hour(v, eo.from, `${p}.from`), to: hour(v, eo.to, `${p}.to`), locationId: v.str(eo.locationId, `${p}.locationId`), activity: v.str(eo.activity, `${p}.activity`), spot: v.optStr(eo.spot, `${p}.spot`) };
        }),
      ]),
    ),
    markets: Object.fromEntries(
      Object.entries(v.obj(o.markets ?? {}, 'markets')).map(([id, m]) => {
        const p = `markets.${id}`;
        const mo = v.obj(m, p);
        return [id, {
          openHour: hour(v, mo.openHour, `${p}.openHour`),
          closeHour: hour(v, mo.closeHour, `${p}.closeHour`),
          restock: v.arr(mo.restock ?? [], `${p}.restock`, (r, rp) => {
            const ro = v.obj(r, rp);
            return { itemId: v.str(ro.itemId, `${rp}.itemId`), target: v.num(ro.target, `${rp}.target`, 0, 10_000) };
          }),
        }];
      }),
    ),
    stall: {
      baseChancePerHour: v.num(stall.baseChancePerHour ?? DEFAULT_LIVING.stall.baseChancePerHour, 'stall.baseChancePerHour', 0, 1),
      maxPriceMultiple: v.num(stall.maxPriceMultiple ?? DEFAULT_LIVING.stall.maxPriceMultiple, 'stall.maxPriceMultiple', 1.01, 20),
      openHour: hour(v, stall.openHour ?? DEFAULT_LIVING.stall.openHour, 'stall.openHour'),
      closeHour: hour(v, stall.closeHour ?? DEFAULT_LIVING.stall.closeHour, 'stall.closeHour'),
      maxCatchUpHours: v.num(stall.maxCatchUpHours ?? DEFAULT_LIVING.stall.maxCatchUpHours, 'stall.maxCatchUpHours', 1, 24 * 30),
    },
    npcLines: Object.fromEntries(
      Object.entries(v.obj(o.npcLines ?? {}, 'npcLines')).map(([id, l]) => {
        const p = `npcLines.${id}`;
        const lo = v.obj(l, p);
        v.noExtraKeys(lo, ['activities', 'friendly', 'barks'], p);
        return [id, {
          activities: lo.activities === undefined ? undefined : Object.fromEntries(Object.entries(v.obj(lo.activities, `${p}.activities`)).map(([k, s]) => [k, v.str(s, `${p}.activities.${k}`)])),
          friendly: v.optStr(lo.friendly, `${p}.friendly`),
          barks: lo.barks === undefined ? undefined : strings(lo.barks, `${p}.barks`),
        }];
      }),
    ),
    familiarReactions: Object.fromEntries(
      Object.entries(v.obj(o.familiarReactions ?? {}, 'familiarReactions')).map(([id, r]) => {
        const p = `familiarReactions.${id}`;
        const ro = v.obj(r, p);
        return [id, Object.fromEntries(Object.entries(ro).map(([k, lines]) => [v.oneOf(k, REACTIONS, `${p}.${k}`), strings(lines, `${p}.${k}`)]))];
      }),
    ),
  };
  if (cfg.stall.openHour >= cfg.stall.closeHour) v.fail('stall', 'openHour must be before closeHour');
  return v.ok ? ok(cfg) : err('INVALID_CONTENT', v.errors.join('\n'));
}

/** Cross-check a living config against the world it will run in. */
export function validateLiving(cfg: LivingConfig, known: { actors: Set<string>; locations: Set<string>; markets: Set<string>; items: Set<string>; familiars: Set<string> }): Result<true> {
  const problems: string[] = [];
  for (const [actor, entries] of Object.entries(cfg.routines)) {
    if (!known.actors.has(actor)) problems.push(`routine for unknown actor ${actor}`);
    for (const e of entries) if (!known.locations.has(e.locationId)) problems.push(`routine for ${actor} uses unknown location ${e.locationId}`);
    for (let h = 0; h < 24; h++) if (!routineAt(entries, h)) problems.push(`routine for ${actor} has no entry at hour ${h}`);
  }
  for (const [id, m] of Object.entries(cfg.markets)) {
    if (!known.markets.has(id)) problems.push(`rules for unknown market ${id}`);
    for (const r of m.restock) if (!known.items.has(r.itemId)) problems.push(`market ${id} restocks unknown item ${r.itemId}`);
  }
  for (const id of Object.keys(cfg.npcLines)) if (!known.actors.has(id)) problems.push(`lines for unknown actor ${id}`);
  return problems.length ? err('INVALID_CONTENT', problems.join('\n')) : ok(true);
}
