import { type Clock, SystemClock } from './core/clock';
import { EventBus } from './core/events';
import { type IdFactory, RandomIdFactory } from './core/ids';
import { Kernel } from './core/kernel';
import { Rng } from './core/rng';
import { ChronicleService } from './chronicle/chronicle';
import { ContractService } from './contracts/contracts';
import { EconomyService } from './economy/economy';
import { InventoryService } from './economy/inventory';
import { MarketService } from './economy/market';
import { OwnershipService } from './economy/ownership';
import { PropertyService } from './economy/property';
import { ResourceService } from './economy/resources';
import { RiskService } from './economy/risk';
import { ActorService } from './entities/actors';
import { AuthorityService, OrganizationService } from './entities/organizations';
import { RelationshipService, ReputationService } from './entities/social';
import { InteractionService } from './identity/evidence';
import { IdentityService } from './identity/identity';
import type { SimContext } from './world/context';
import { WorldService } from './world/world';
import { SearchService } from './world/search';
import { HappeningService } from './world/happenings';
import { ModeService } from './modes/modes';
import type { ModeDefinition } from './modes/types';
import type { WorldState } from './world/world-state';
import type { ResolvedRules } from './world/constitution';

export interface SimulationOptions {
  state: WorldState;
  clock?: Clock;
  ids?: IdFactory;
  events?: EventBus;
  /** Effective Realm + server rules. Optional so kernel tests can run rule-free. */
  rules?: ResolvedRules;
  /** Mode definitions (normally from modes/modes.json). */
  modes?: readonly ModeDefinition[];
}

/**
 * Wires the universal kernel services around one WorldState.
 *
 * This is the only place services are constructed, so dependency direction
 * is visible at a glance. It contains no gameplay rules of its own.
 */
export class Simulation {
  readonly kernel: Kernel;
  readonly ctx: SimContext;

  readonly actors: ActorService;
  readonly world: WorldService;
  readonly ownership: OwnershipService;
  readonly inventory: InventoryService;
  readonly economy: EconomyService;
  readonly market: MarketService;
  readonly resources: ResourceService;
  readonly risk: RiskService;
  readonly property: PropertyService;
  readonly organizations: OrganizationService;
  readonly authority: AuthorityService;
  readonly relationships: RelationshipService;
  readonly reputation: ReputationService;
  readonly contracts: ContractService;
  readonly chronicle: ChronicleService;
  readonly interactions: InteractionService;
  readonly identity: IdentityService;
  readonly search: SearchService;
  readonly happenings: HappeningService;
  readonly modes: ModeService;

  constructor(opts: SimulationOptions) {
    this.kernel = new Kernel({
      clock: opts.clock ?? new SystemClock(),
      ids: opts.ids ?? new RandomIdFactory(),
      events: opts.events ?? new EventBus(),
    });
    this.ctx = {
      state: opts.state,
      clock: this.kernel.clock,
      ids: this.kernel.ids,
      events: this.kernel.events,
      rng: new Rng(opts.state.rng),
      rules: opts.rules,
    };
    const ctx = this.ctx;

    this.actors = new ActorService(ctx);
    this.world = new WorldService(ctx);
    this.ownership = new OwnershipService(ctx);
    this.inventory = new InventoryService(ctx);
    this.economy = new EconomyService(ctx);
    this.risk = new RiskService(ctx);
    this.market = new MarketService(ctx, this.economy, this.inventory, this.risk);
    this.resources = new ResourceService(ctx, this.inventory);
    this.property = new PropertyService(ctx, this.ownership, this.economy);
    this.organizations = new OrganizationService(ctx);
    this.authority = new AuthorityService(ctx, this.ownership, this.world);
    this.relationships = new RelationshipService(ctx);
    this.reputation = new ReputationService(ctx);
    this.contracts = new ContractService(ctx, {
      economy: this.economy,
      inventory: this.inventory,
      risk: this.risk,
      reputation: this.reputation,
      relationships: this.relationships,
      world: this.world,
    });
    this.chronicle = new ChronicleService(ctx);
    this.interactions = new InteractionService(ctx);
    this.identity = new IdentityService(ctx);
    this.search = new SearchService(ctx, this.inventory);
    this.happenings = new HappeningService(ctx, this.relationships, this.reputation);
    this.modes = new ModeService(
      ctx,
      {
        actors: this.actors,
        world: this.world,
        inventory: this.inventory,
        economy: this.economy,
        market: this.market,
        resources: this.resources,
        property: this.property,
        ownership: this.ownership,
        relationships: this.relationships,
        contracts: this.contracts,
        search: this.search,
      },
      opts.modes ?? [],
    );

    this.kernel.register({
      id: 'simulation',
      init: () => {
        this.chronicle.attach();
        this.interactions.attach();
        this.happenings.attach();
      },
      tick: (dt) => {
        this.resources.tick(dt);
        this.market.tick();
        this.contracts.tick();
      },
      dispose: () => {
        this.happenings.detach();
        this.interactions.detach();
        this.chronicle.detach();
      },
    });
  }

  get state(): WorldState {
    return this.ctx.state;
  }

  start(): this {
    this.kernel.start();
    return this;
  }

  tick(dtMs: number): void {
    this.kernel.tick(dtMs);
  }
}
