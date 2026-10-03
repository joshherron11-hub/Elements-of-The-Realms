import { ManualClock, SequentialIdFactory, asId, provenance, type ActorId, type CurrencyId, type ItemId, type LocationId, type MarketId, type OwnerRef, type RealmId, type RiskProfileId, type ServerId } from '../../src/core';
import { Simulation } from '../../src/simulation';
import { createWorldState } from '../../src/world';

/**
 * A tiny generic test world — deliberately NOT Happy Fall, to prove the
 * kernel has no Realm-specific assumptions.
 */
export const ID = {
  realm: asId<'realm'>('realm_test') as RealmId,
  server: asId<'server'>('server_test') as ServerId,
  coin: asId<'currency'>('currency_coin') as CurrencyId,
  bread: asId<'item'>('item_bread') as ItemId,
  parcel: asId<'item'>('item_parcel') as ItemId,
  town: asId<'location'>('location_town') as LocationId,
  square: asId<'location'>('location_square') as LocationId,
  shop: asId<'location'>('location_shop') as LocationId,
  farm: asId<'location'>('location_farm') as LocationId,
  island: asId<'location'>('location_island') as LocationId,
  player: asId<'actor'>('actor_player') as ActorId,
  baker: asId<'actor'>('actor_baker') as ActorId,
  farmer: asId<'actor'>('actor_farmer') as ActorId,
  market: asId<'market'>('market_bakery') as MarketId,
  venture: asId<'risk'>('risk_venture') as RiskProfileId,
};

export const player = { kind: 'actor', id: ID.player } as const satisfies OwnerRef;
export const baker = { kind: 'actor', id: ID.baker } as const satisfies OwnerRef;
export const farmer = { kind: 'actor', id: ID.farmer } as const satisfies OwnerRef;

export function makeSim(seed = 7) {
  const clock = new ManualClock(1_000_000);
  const state = createWorldState({
    realm: { id: ID.realm, name: 'Testland', type: 'ANCHORED' },
    server: { id: ID.server, name: 'Test Server', preset: 'PEACEFUL' },
    seed,
    now: clock.now(),
  });
  const sim = new Simulation({ state, clock, ids: new SequentialIdFactory() }).start();
  const p = provenance('authored', 'fixture', clock.now());

  state.currencies[ID.coin] = { id: ID.coin, name: 'Coin', symbol: 'c', minorPerMajor: 1, realmId: ID.realm };
  state.items[ID.bread] = { id: ID.bread, name: 'Bread', category: 'food', tags: [], baseValue: 4, stackable: true };
  state.items[ID.parcel] = { id: ID.parcel, name: 'Parcel', category: 'trade-good', tags: [], baseValue: 10, stackable: true };

  const loc = (id: LocationId, name: string, parentId?: LocationId) =>
    (state.locations[id] = { id, realmId: ID.realm, name, kind: 'district', parentId, tags: [] });
  loc(ID.town, 'Town');
  loc(ID.square, 'Square', ID.town);
  loc(ID.shop, 'Shop', ID.town);
  loc(ID.farm, 'Farm');
  loc(ID.island, 'Island');
  const route = (id: string, from: LocationId, to: LocationId, travelTimeMs: number) =>
    (state.routes[id] = { id: asId<'route'>(id), from, to, kind: 'road', travelTimeMs, status: 'open', bidirectional: true, tags: [] });
  route('route_sq_shop', ID.square, ID.shop, 10);
  route('route_sq_farm', ID.square, ID.farm, 100);
  route('route_shop_farm', ID.shop, ID.farm, 50);

  sim.actors.create({ id: ID.player, kind: 'player', name: 'Wren', locationId: ID.square });
  sim.actors.create({ id: ID.baker, kind: 'npc', name: 'Odo the Baker', locationId: ID.shop, provenance: p });
  sim.actors.create({ id: ID.farmer, kind: 'npc', name: 'Hale the Farmer', locationId: ID.farm, provenance: p });

  state.markets[ID.market] = {
    id: ID.market,
    name: 'Bakery',
    locationId: ID.shop,
    vendor: baker,
    currencyId: ID.coin,
    priceIndex: 1,
    listings: { [ID.bread]: { basePrice: 5, buyable: true, sellable: true, sellSpread: 0.4 } },
  };
  state.risks[ID.venture] = {
    id: ID.venture,
    name: 'Small venture',
    category: 'investment',
    outcomes: [
      { key: 'loss', label: 'Lost it all', weight: 1, valueMultiplier: 0 },
      { key: 'gain', label: 'Paid off', weight: 3, valueMultiplier: 1.5 },
    ],
  };

  sim.economy.mint(player, ID.coin, 100, { reason: 'starting purse' });
  sim.economy.mint(baker, ID.coin, 200, { reason: 'starting purse' });
  sim.inventory.add(baker, ID.bread, 20);

  return { sim, state, clock };
}
