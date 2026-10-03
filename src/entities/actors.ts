import { err, ok, type Result } from '../core/result';
import type { ActorId, LocationId, PersonId } from '../core/refs';
import { provenance, type Provenance } from '../core/provenance';
import { emit, type SimContext } from '../world/context';
import type { Actor, ActorController, ActorKind, ActorProfile } from './actor';

export interface NewActor {
  id?: ActorId;
  kind: ActorKind;
  name: string;
  controller?: ActorController;
  personId?: PersonId;
  locationId?: LocationId;
  tags?: string[];
  profile?: ActorProfile;
  provenance?: Provenance;
}

export class ActorService {
  constructor(private readonly ctx: SimContext) {}

  get(id: ActorId): Actor | undefined {
    return this.ctx.state.actors[id];
  }

  create(spec: NewActor): Result<Actor> {
    const id = spec.id ?? this.ctx.ids.next('actor');
    if (this.ctx.state.actors[id]) return err('DUPLICATE_ACTOR', `actor ${id} exists`);
    const now = this.ctx.clock.now();
    const actor: Actor = {
      id,
      kind: spec.kind,
      name: spec.name,
      realmId: this.ctx.state.realm.id,
      personId: spec.personId,
      locationId: spec.locationId,
      controller: spec.controller ?? (spec.kind === 'player' ? 'human' : 'scripted'),
      tags: [...(spec.tags ?? [])],
      profile: spec.profile,
      createdAt: now,
      provenance: spec.provenance ?? provenance('system', 'actors', now, { realmId: this.ctx.state.realm.id }),
    };
    this.ctx.state.actors[id] = actor;
    if (spec.personId) {
      const person = this.ctx.state.persons[spec.personId];
      if (person) person.actors[actor.realmId] = id;
    }
    emit(this.ctx, 'actor.created', { actorId: id, kind: actor.kind }, { sourceSystem: 'actors', actor: id });
    return ok(actor);
  }

  at(locationId: LocationId): Actor[] {
    return Object.values(this.ctx.state.actors).filter((a) => a.locationId === locationId);
  }
}
