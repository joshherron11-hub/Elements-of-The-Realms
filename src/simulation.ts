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
import type { WorldState } from './world/world-state';

export interface SimulationOptions {
  state: WorldState;
  clock?: Clock;
  ids?: IdFactory;
  events?: EventBus;
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
    };
    const ctx = this.ctx;

    this.actors = new ActorService(ctx);
    this.world = new WorldService(ctx);
    this.ownership = new OwnershipService(ctx);
    this.inventory = new InventoryService(ctx);
    this.economy = new EconomyService(ctx);
    this.market = new MarketService(ctx, this.economy, this.inventory);
    this.resources = new ResourceService(ctx, this.inventory);
    this.risk = new RiskService(ctx);
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

    this.kernel.register({
      id: 'simulation',
      init: () => {
        this.chronicle.attach();
        this.interactions.attach();
      },
      tick: (dt) => {
        this.resources.tick(dt);
        this.contracts.tick();
      },
      dispose: () => {
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
