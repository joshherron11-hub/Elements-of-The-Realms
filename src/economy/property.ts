import { err, ok, type Result } from '../core/result';
import type { OwnerRef, PropertyId } from '../core/refs';
import { provenance } from '../core/provenance';
import { emit, type SimContext } from '../world/context';
import type { EconomyService } from './economy';
import type { OwnershipService } from './ownership';
import type { Property } from './types';

/**
 * Property composes ownership + economy. Buying property moves money through
 * the economy and the deed through the ownership registry.
 */
export class PropertyService {
  constructor(
    private readonly ctx: SimContext,
    private readonly ownership: OwnershipService,
    private readonly economy: EconomyService,
  ) {}

  get(id: PropertyId): Property | undefined {
    return this.ctx.state.properties[id];
  }

  ownerOf(id: PropertyId): OwnerRef | undefined {
    return this.ownership.ownerOf({ kind: 'property', id });
  }

  /** Buy a property that is for sale. Pays the current owner, or burns to the Realm if unowned. */
  purchase(buyer: OwnerRef, id: PropertyId): Result<Property> {
    const property = this.get(id);
    if (!property) return err('UNKNOWN_PROPERTY', `no property ${id}`);
    if (!property.forSale) return err('NOT_FOR_SALE', `${property.name} is not for sale`);
    if (!this.economy.canAfford(buyer, property.currencyId, property.value)) return err('INSUFFICIENT_FUNDS', 'not enough money');
    const asset = { kind: 'property' as const, id };
    const seller = this.ownership.ownerOf(asset);
    if (seller && seller.kind === buyer.kind && seller.id === buyer.id) return err('ALREADY_OWNER', 'you already own this');

    const opts = { reason: `purchase ${property.name}`, sourceSystem: 'property', ref: id };
    if (seller) {
      this.economy.transfer(buyer, seller, property.currencyId, property.value, opts);
      this.ownership.transfer(asset, seller, buyer, 'purchase');
    } else {
      this.economy.burn(buyer, property.currencyId, property.value, opts);
      this.ownership.register(asset, buyer, provenance('system', 'property', this.ctx.clock.now(), { createdBy: buyer }), 'purchase');
    }
    property.forSale = false;
    emit(this.ctx, 'property.purchased', { propertyId: id, price: property.value }, {
      sourceSystem: 'property',
      actor: buyer.kind === 'actor' ? buyer.id : undefined,
      location: property.locationId,
      participants: seller?.kind === 'actor' ? [seller.id] : [],
      outcome: 'owned',
      summary: `Bought ${property.name} for ${property.value}`,
      chronicle: true,
    });
    return ok(property);
  }
}
