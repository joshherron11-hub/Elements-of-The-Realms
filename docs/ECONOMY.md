# Economy, Contracts, Property and Risk

## Pieces (all kernel services; see `docs/KERNEL.md`)
- **Currency:** integer amounts on a full ledger. Happy Fall uses the Mark (`mk`).
- **Inventory:** stacks per owner.
- **Markets:** a price table over a vendor's own inventory and wallet, plus a
  `priceIndex` that drifts.
- **Resources:** nodes that regrow (Brindle orchard → apples, Hollowmere deadwood →
  timber).
- **Routes:** open, closed or hazardous, with travel times.
- **Property:** a deed in the shared ownership registry. Owners get implicit
  `property.*` authority.
- **Reputation** is always scoped to a place or an organization; there is no global
  number. **Relationships** are directed, with regard, trust and familiarity.
- **Organizations** cover the council, guilds, clans and factions in one structure.

## Blackmere's first economy (`realms/happy-fall/content/20-blackmere-life.json`)
| Kind | Title | Issuer | What you do | Reward |
|---|---|---|---|---|
| merchant | Apples for Quill's | Tobias Quill | gather 3 apples at Brindle Farm, deliver them | 20 mk, Blackmere +4, Merchants' Circle +6, Tobias's regard |
| search | The Lost Satchel | Pip Ashdown | search Hollowmere Wood (the satchel only appears once you've taken the job), return it | 15 mk, Blackmere +5, Pip's regard and trust |
| investment | A Share in the Cider Press | Hester Brindle | stake 20 mk, wait about a minute, settle with Hester | stake × outcome: lost (0), modest (×1.25) or thrived (×1.8) |
| social happening | A toast with a stranger | (talking to Sela) | fires once | Sela and Maren warm to you, Blackmere +2 |

Property for sale, recorded by the Reeve at the Keep gatehouse (a `civic` location):
- Market Stall No. 4: 30 mk.
- Wicket Cottage: 160 mk.

The Town Council is paid.

Organizations:
- Blackmere Town Council (government; the Reeve)
- Merchants' Circle (guild)
- The Wayfarers' Post (guild)
- Clan Brindle (clan placeholder)
- The Blackmere Commons (faction placeholder)

## Risk without war
| Risk | How it happens |
|---|---|
| Market fluctuation | Quill's Sundries redraws its price index every 2 minutes from `risk_market-drift` (glut ×0.85 · steady · shortage ×1.2). It is recorded in the Realm Chronicle. |
| Investment loss | The cider-press stake can return nothing. |
| Contract failure | An issuer who can't pay defaults (`issuer-default`). A missed deadline fails the contract and applies penalties. |
| Lost shipment | `risk_shipment` profile exists for later trade-route content. |

All risk uses the seeded RNG stored in the world, so outcomes are reproducible and
survive save/load.

## Money buys opportunity, not Canonical truth
Money can buy goods, property (and the authority that comes with it), stakes, access
and scale. Purchases show up as raw `system-observed` interactions. Nothing economic
can author derived Canonical records or Recognition: this is enforced by module
boundaries and validators and tested in `tests/blackmere-economy.test.ts`.

## New general mechanisms
- **`wait` task requirement:** satisfied once a duration has passed since acceptance.
- **Market `drift`:** a periodic price index driven by a risk profile.
- **Happenings** (`state.happenings`): authored, once-per-player moments triggered by
  `talk` or `arrive`. Their effects go through the relationship and reputation services
  and they are chronicled.
- **Civic offices:** properties can be bought where they stand or at a location tagged
  `civic` in the same settlement.
