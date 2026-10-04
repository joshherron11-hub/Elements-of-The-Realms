import type { ActorId, JsonValue, OrganizationId, RealmId } from '../core/refs';
import { provenance as makeProvenance, type Provenance } from '../core/provenance';
import type { DomainEvent, SimContext } from '../world/context';
import type { ChronicleEntry, ChronicleScope, ChronicleVisibility } from './types';

export interface RecordSpec {
  event: string;
  actor?: ActorId;
  location?: ChronicleEntry['location'];
  participants?: ActorId[];
  outcome?: string;
  summary?: string;
  data?: Record<string, JsonValue>;
  visibility?: ChronicleVisibility;
  sourceSystem: string;
  domain?: ChronicleEntry['context']['domain'];
  extraScopes?: ChronicleScope[];
  provenance?: Provenance;
  corrects?: ChronicleEntry['id'];
}

export interface ChronicleQuery {
  /** Event types or prefixes ending in '.' (e.g. 'contract.' or 'familiar.acquired'). */
  events?: string[];
  /** Only entries from these platform domains (PLAY / LEARN / WORK / CREATE). */
  domains?: ChronicleEntry['context']['domain'][];
  location?: string;
  since?: number;
  until?: number;
  /** Include entries where the subject only took part (default true). */
  includeParticipation?: boolean;
  /** Only entries this actor is allowed to see (defaults to no filtering for the subject). */
  viewer?: ActorId;
  order?: 'oldest-first' | 'newest-first';
  offset?: number;
  limit?: number;
}

/** Read access to one chronicle scope. */
export interface ChronicleView {
  readonly scope: ChronicleScope;
  entries(query?: ChronicleQuery): ChronicleEntry[];
}

/** Counts by event family, for summaries ("3 contracts, 1 Familiar, 5 places"). */
export type ChronicleSummary = Record<string, number>;

/** A person's own history in this Realm: everything they did or took part in. */
export interface PersonalChronicle extends ChronicleView {
  readonly scope: { kind: 'personal'; id: ActorId };
  summary(): ChronicleSummary;
  /** Most recent first. */
  latest(n: number): ChronicleEntry[];
}

/**
 * Realm and Organization Chronicles share the query interface. Their
 * collective aggregation (Grandmeta) and prose layers come later.
 */
export interface RealmChronicle extends ChronicleView {
  readonly scope: { kind: 'realm'; id: RealmId };
}
export interface OrganizationChronicle extends ChronicleView {
  readonly scope: { kind: 'organization'; id: OrganizationId };
}

/**
 * The Chronicle: an append-only structured history.
 *
 * It listens to the event bus and records any domain event whose meta has
 * `chronicle: true`, and can also be written to directly. Entries are never
 * edited or deleted; `correct()` appends a new entry citing the original.
 */
export class ChronicleService {
  private unsubscribe?: () => void;

  constructor(private readonly ctx: SimContext) {}

  /** Start recording meaningful events from the bus. */
  attach(): void {
    this.unsubscribe ??= this.ctx.events.on<DomainEvent>('*', (e) => {
      if (!e.meta?.chronicle) return;
      this.record({
        event: e.type,
        actor: e.meta.actor,
        location: e.meta.location,
        participants: e.meta.participants,
        outcome: e.meta.outcome,
        summary: e.meta.summary,
        visibility: e.meta.visibility,
        sourceSystem: e.meta.sourceSystem,
        domain: e.meta.domain,
        data: toJson(e.payload),
      });
    });
  }

  detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  record(spec: RecordSpec): ChronicleEntry {
    const now = this.ctx.clock.now();
    const participants = [...new Set(spec.participants ?? [])].filter((p) => p !== spec.actor);
    const visibility = spec.visibility ?? 'private';
    const scopes: ChronicleScope[] = [];
    if (spec.actor) scopes.push({ kind: 'personal', id: spec.actor });
    for (const p of participants) scopes.push({ kind: 'personal', id: p });
    if (visibility === 'realm' || visibility === 'public') scopes.push({ kind: 'realm', id: this.ctx.state.realm.id });
    const orgId = spec.data?.orgId;
    if (typeof orgId === 'string') scopes.push({ kind: 'organization', id: orgId as OrganizationId });
    scopes.push(...(spec.extraScopes ?? []));

    const entry: ChronicleEntry = {
      id: this.ctx.ids.next('chron'),
      timestamp: now,
      actor: spec.actor,
      event: spec.event,
      location: spec.location,
      context: {
        realmId: this.ctx.state.realm.id,
        serverId: this.ctx.state.server.id,
        domain: spec.domain ?? 'PLAY',
        mode: (spec.actor && this.ctx.state.activeModes[spec.actor]) || this.ctx.mode,
      },
      participants,
      outcome: spec.outcome,
      summary: spec.summary,
      data: spec.data,
      provenance:
        spec.provenance ??
        makeProvenance('system', spec.sourceSystem, now, {
          realmId: this.ctx.state.realm.id,
          createdBy: spec.actor ? { kind: 'actor', id: spec.actor } : undefined,
        }),
      visibility,
      sourceSystem: spec.sourceSystem,
      scopes,
      corrects: spec.corrects,
    };
    this.ctx.state.chronicle.push(entry);
    // Not chronicle-flagged, so this cannot recurse.
    this.ctx.events.emit({ type: 'chronicle.recorded', at: now, payload: { entryId: entry.id }, meta: { sourceSystem: 'chronicle' } } as DomainEvent);
    return entry;
  }

  /** Append a correction. The original stays untouched. */
  correct(originalId: ChronicleEntry['id'], spec: Omit<RecordSpec, 'corrects'>): ChronicleEntry | undefined {
    if (!this.ctx.state.chronicle.some((e) => e.id === originalId)) return undefined;
    return this.record({ ...spec, corrects: originalId });
  }

  forScope(scope: ChronicleScope, query: ChronicleQuery = {}): ChronicleEntry[] {
    let out = this.ctx.state.chronicle.filter((e) => e.scopes.some((s) => s.kind === scope.kind && s.id === scope.id));
    if (scope.kind === 'personal' && query.includeParticipation === false) out = out.filter((e) => e.actor === scope.id);
    if (query.events?.length) out = out.filter((e) => query.events!.some((ev) => (ev.endsWith('.') ? e.event.startsWith(ev) : e.event === ev)));
    if (query.domains?.length) out = out.filter((e) => query.domains!.includes(e.context.domain));
    if (query.location) out = out.filter((e) => e.location === query.location);
    if (query.since !== undefined) out = out.filter((e) => e.timestamp >= query.since!);
    if (query.until !== undefined) out = out.filter((e) => e.timestamp <= query.until!);
    if (query.viewer) out = out.filter((e) => this.canView(query.viewer!, e));
    if (query.order === 'newest-first') out = [...out].reverse();
    const start = query.offset ?? 0;
    return query.limit === undefined ? out.slice(start) : out.slice(start, start + query.limit);
  }

  /**
   * Who may read an entry:
   *  private → the actor only · shared → actor and participants ·
   *  organization → members of the organizations it is scoped to ·
   *  realm / public → anyone.
   */
  canView(viewer: ActorId, e: ChronicleEntry): boolean {
    if (e.actor === viewer) return true;
    switch (e.visibility) {
      case 'public':
      case 'realm':
        return true;
      case 'shared':
        return e.participants.includes(viewer);
      case 'organization':
        return e.scopes.some((s) => s.kind === 'organization' && viewer in (this.ctx.state.organizations[s.id]?.members ?? {}));
      case 'private':
        return false;
    }
  }

  /** An actor's Personal Chronicle: everything they did or took part in. */
  personal(actorId: ActorId): PersonalChronicle {
    const scope = { kind: 'personal', id: actorId } as const;
    return {
      scope,
      entries: (q) => this.forScope(scope, q),
      latest: (n) => this.forScope(scope, { order: 'newest-first', limit: n }),
      summary: () => {
        const out: ChronicleSummary = {};
        for (const e of this.forScope(scope)) {
          const family = e.event.split('.')[0]!;
          out[family] = (out[family] ?? 0) + 1;
        }
        return out;
      },
    };
  }

  /**
   * Domain views over the same personal history. A Professional Chronicle is
   * the WORK slice; a Learning Chronicle the LEARN slice; a Creator Chronicle
   * the CREATE slice. One person, one history, many contexts.
   */
  domain(actorId: ActorId, domain: ChronicleEntry['context']['domain']): ChronicleView {
    const scope = { kind: 'personal', id: actorId } as const;
    return { scope, entries: (q) => this.forScope(scope, { ...q, domains: [domain] }) };
  }

  professional(actorId: ActorId): ChronicleView {
    return this.domain(actorId, 'WORK');
  }

  realm(): RealmChronicle {
    const scope = { kind: 'realm', id: this.ctx.state.realm.id } as const;
    return { scope, entries: (q) => this.forScope(scope, q) };
  }

  organization(id: OrganizationId): OrganizationChronicle {
    const scope = { kind: 'organization', id } as const;
    return { scope, entries: (q) => this.forScope(scope, q) };
  }
}

function toJson(payload: unknown): Record<string, JsonValue> | undefined {
  if (payload === undefined || payload === null || typeof payload !== 'object') return undefined;
  return JSON.parse(JSON.stringify(payload)) as Record<string, JsonValue>;
}
