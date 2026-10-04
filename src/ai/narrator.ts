import type { ChronicleEntry } from '../chronicle/types';
import type { AiService } from './service';
import type { AiContext } from './types';

/**
 * Chronicle prose. The Chronicle stores structured entries; prose is a
 * presentation layer on top and never replaces or edits them.
 *
 * `narrate()` uses AI when the server's density permits, and otherwise (the
 * MINIMAL default) a deterministic composition of the entries' own summaries.
 */
/** Bookkeeping events that a richer entry already tells (a purchase implies the ownership change). */
const QUIET_EVENTS = new Set(['ownership.transferred']);
/** Leading verbs that read naturally in lower case mid-sentence; names and other words keep their capitals. */
const VERBS = /^(Arrived|Discovered|Came|Bought|Sold|Accepted|Helped|Invested|Lost|Made|Joined|Left|Fed|Spent|Completed|Failed|Found|Settled)\b/;

export function narrateDeterministic(entries: readonly ChronicleEntry[], placeName: (id: string) => string | undefined): string {
  const lines = entries.filter((e) => e.summary && !QUIET_EVENTS.has(e.event)).slice(-12);
  if (!lines.length) return 'Your story here has not begun yet.';
  const openers = ['First,', 'Then', 'After that,', 'Later,', 'Soon after,', 'In time,'];
  const parts = lines.map((e, i) => {
    const s = e.summary!;
    const where = e.location ? placeName(e.location) : undefined;
    const lead = i === 0 ? openers[0]! : i === lines.length - 1 ? 'Most recently,' : openers[1 + ((i - 1) % (openers.length - 1))]!;
    const body = VERBS.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
    return `${lead} ${body}${where && !s.includes(where) ? ` (${where})` : ''}.`;
  });
  return parts.join(' ').replace(/\.\./g, '.');
}

export async function narrate(
  ai: AiService,
  ctx: AiContext,
  userId: string,
  entries: readonly ChronicleEntry[],
  placeName: (id: string) => string | undefined,
) {
  return ai.withFallback(
    {
      task: 'chronicle-prose',
      userId,
      instruction: 'Retell these events as a short, warm paragraph. Do not invent events.',
      input: { events: entries.filter((e) => e.summary && !QUIET_EVENTS.has(e.event)).slice(-12).map((e) => e.summary!) },
    },
    ctx,
    () => narrateDeterministic(entries, placeName),
  );
}
