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

/** Read access to one chronicle scope. Implemented fully for personal scope. */
export interface ChronicleView {
  readonly scope: ChronicleScope;
  entries(): ChronicleEntry[];
}

/** Interfaces reserved for later phases; queries already work via forScope(). */
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
        mode: this.ctx.mode,
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

  forScope(scope: ChronicleScope): ChronicleEntry[] {
    return this.ctx.state.chronicle.filter((e) => e.scopes.some((s) => s.kind === scope.kind && s.id === scope.id));
  }

  /** An actor's personal Chronicle: everything they did or took part in. */
  personal(actorId: ActorId): ChronicleView {
    const scope = { kind: 'personal', id: actorId } as const;
    return { scope, entries: () => this.forScope(scope) };
  }

  realm(): RealmChronicle {
    const scope = { kind: 'realm', id: this.ctx.state.realm.id } as const;
    return { scope, entries: () => this.forScope(scope) };
  }

  organization(id: OrganizationId): OrganizationChronicle {
    const scope = { kind: 'organization', id } as const;
    return { scope, entries: () => this.forScope(scope) };
  }
}

function toJson(payload: unknown): Record<string, JsonValue> | undefined {
  if (payload === undefined || payload === null || typeof payload !== 'object') return undefined;
  return JSON.parse(JSON.stringify(payload)) as Record<string, JsonValue>;
}
