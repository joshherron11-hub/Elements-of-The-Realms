import { describe, expect, it } from 'vitest';
import { asId, provenance, type OrganizationId, type PropertyId, type RoleId } from '../src/core';
import { ID, baker, makeSim, player } from './helpers/fixture';

describe('Relationships and reputation', () => {
  it('relationships are directed and clamped; first contact is chronicled', () => {
    const { sim } = makeSim();
    sim.relationships.adjust(ID.baker, ID.player, { regard: 500, trust: -5 }, 'test');
    expect(sim.relationships.get(ID.baker, ID.player)).toMatchObject({ regard: 100, trust: 0 });
    expect(sim.relationships.get(ID.player, ID.baker)).toBeUndefined();
    expect(sim.chronicle.personal(ID.player).entries().some((e) => e.event === 'relationship.formed')).toBe(true);
  });

  it('reputation is scoped and refuses a global scope (no universal rank)', () => {
    const { sim } = makeSim();
    const town = { kind: 'location' as const, id: ID.town };
    sim.reputation.adjust(player, town, 150, 'heroics');
    expect(sim.reputation.get(player, town)).toBe(100);
    expect(sim.reputation.get(player, { kind: 'location', id: ID.farm })).toBe(0);
    expect(() => sim.reputation.adjust(player, { kind: 'global' }, 1, 'nope')).toThrow();
    expect(sim.reputation.standingsOf(player)).toHaveLength(1);
  });
});

describe('Organizations and authority', () => {
  const guild = asId<'org'>('org_bakers') as OrganizationId;
  const master = asId<'role'>('role_master') as RoleId;
  const stall = asId<'property'>('property_stall') as PropertyId;

  function setup() {
    const f = makeSim();
    const p = provenance('authored', 'test', 0);
    f.state.organizations[guild] = { id: guild, kind: 'guild', name: 'Bakers', domain: 'PLAY', members: {}, tags: [], provenance: p };
    f.state.roles[master] = { id: master, organizationId: guild, name: 'Master', permissions: ['org.*'] };
    f.state.properties[stall] = { id: stall, name: 'Stall', kind: 'stall', locationId: ID.shop, value: 50, currencyId: ID.coin, forSale: true, tags: [], provenance: p };
    return f;
  }

  it('membership grants role permissions inside the org only', () => {
    const { sim } = setup();
    expect(sim.organizations.join(ID.player, guild, [master]).ok).toBe(true);
    expect(sim.authority.can(ID.player, 'org.invite', { kind: 'organization', id: guild })).toBe(true);
    expect(sim.authority.can(ID.player, 'org.invite', { kind: 'organization', id: 'org_other' })).toBe(false);
    expect(sim.chronicle.personal(ID.player).entries().some((e) => e.event === 'organization.joined')).toBe(true);
  });

  it('owners have implicit property rights; location grants cover nested places', () => {
    const { sim } = setup();
    expect(sim.authority.can(ID.player, 'property.enter', { kind: 'property', id: stall })).toBe(false);
    expect(sim.property.purchase(player, stall).ok).toBe(true);
    expect(sim.authority.can(ID.player, 'property.enter', { kind: 'property', id: stall })).toBe(true);
    expect(sim.authority.can(ID.baker, 'property.enter', { kind: 'property', id: stall })).toBe(false);

    sim.authority.grant({ holder: baker, scope: { kind: 'location', id: ID.town }, permissions: ['property.inspect'], provenance: provenance('system', 'test', 0) });
    expect(sim.authority.can(ID.baker, 'property.inspect', { kind: 'property', id: stall })).toBe(true);
    expect(sim.authority.can(ID.baker, 'property.inspect', { kind: 'location', id: ID.shop })).toBe(true);
    expect(sim.authority.can(ID.baker, 'property.inspect', { kind: 'location', id: ID.farm })).toBe(false);
  });

  it('expired grants no longer apply', () => {
    const { sim, clock } = setup();
    sim.authority.grant({ holder: player, scope: { kind: 'global' }, permissions: ['market.trade'], expiresAt: clock.now() + 10, provenance: provenance('system', 'test', 0) });
    expect(sim.authority.can(ID.player, 'market.trade', { kind: 'location', id: ID.shop })).toBe(true);
    clock.advance(10);
    expect(sim.authority.can(ID.player, 'market.trade', { kind: 'location', id: ID.shop })).toBe(false);
  });

  it('property purchase moves money and records ownership', () => {
    const { sim } = setup();
    sim.property.purchase(player, stall);
    expect(sim.economy.balance(player, ID.coin)).toBe(50);
    expect(sim.property.ownerOf(stall)).toEqual(player);
    expect(sim.property.purchase(player, stall).ok).toBe(false);
  });
});
