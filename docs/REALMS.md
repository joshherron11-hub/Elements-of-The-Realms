# Realms & Server Constitutions

Everything here is data. Code only parses, validates and resolves it.

| What | Where | Parser |
|---|---|---|
| Realm type meanings | `canon/realm-types.json` | `REALM_TYPE_DEFINITIONS` |
| Technology/magic scales | `canon/technology.json` | `TECHNOLOGY_SCALE`, `MAGIC_SCALE` |
| A Realm + its constitution | `realms/<realm>/realm.json` | `parseRealmDefinition` |
| Server presets | `server-constitutions/*.json` | `parseServerConstitution` |
| Concrete servers | `realms/<realm>/servers/*.json` | `parseServerDefinition` |

All of it is loaded and validated at startup by `src/config/content.ts`. A content
error stops the app and lists every problem with its JSON path.

## Realm types
| Type | History | Technology |
|---|---|---|
| ANCHORED | progresses | fixed ceiling |
| ASCENDANT | progresses | progresses |
| ECHO | frozen (preserved/replayable epoch) | fixed |
| FRACTURE | progresses (alternate branch) | configurable |
| PLANETARY | progresses (planet scale) | configurable |
| INTERREALM | progresses (meeting space) | configurable |

A Realm's `progression` must agree with its type.

## Realm Constitution
- **technology ceiling** (technology + magic)
- **progression**
- **allowed imports and exports** (categories, ceilings, provenance requirement)
- **economic rules** (primary currency, volatility, starting purse)
- **cross-Realm transfer rules**
- **legal interaction categories**
- **server restrictions** (allowed presets, default preset)
- **PvP maximum**
- **property rules**
- **AI density** (default/max)
- **minimum Canonical strictness**
- **maximum persistence**

### Your person travels further than your equipment
`crossRealm.person`, `identity` and `history` must be `"carried"`. Any other value is a
content error. Items, currency and Familiars cross only as both Realms allow:
- Items must be exported by the origin, imported by the destination, carry provenance
  if required, and fit under the destination's ceiling.
- Currency stays home unless both Realms use `exchange`.
- Familiars `form-shift` into their destination form, or stay home if they have none.

`planRealmTransfer(from, to, request)` returns that plan as pure data.

## Server constitutions
Variables: `war, pvp, propertyRisk, economicRisk, crime, familiarDanger, technology,
history, politics, persistence, access, canonicalStrictness, aiDensity`.

| Preset | Summary |
|---|---|
| **PEACEFUL** (default) | War Off · PvP Off · Property Safe · Economic Risk Normal · Crime NPC-only · Familiar Danger Low · Technology Fixed · Politics Light · Persistence Long-term · Access Private · Canonical Standard · AI Minimal |
| PRIVATE | owner-run peaceful world, politics none, low economic risk |
| FAMILY_FRIENDS | invite-only, no crime, no Familiar danger |
| CONSENT_WAR | conflict only by mutual consent (blocked this release) |
| PROTECTED_CIVILIAN | zoned conflict, civilians and property protected (blocked this release) |
| FULL_CONFLICT | open conflict, raidable property (blocked this release) |
| CURATED_ROLEPLAY | invite-only, strict Canon, richer AI |
| EXPERIMENTAL | seasonal sandbox |
| FROZEN_ERA | history does not advance |
| PROGRESSIVE_ERA | history and technology advance (needs a non-ANCHORED Realm) |

Values outside PEACEFUL are first-pass defaults and can be tuned in the JSON.

## Resolution
`resolveServerRules(realm, preset, server, release)` merges preset + owner overrides,
then rejects:
- presets the Realm doesn't allow;
- overrides the preset doesn't permit;
- PvP, property risk, AI density or persistence above the Realm's caps;
- Canonical strictness looser than the Realm's minimum;
- progressive technology or history the Realm forbids;
- war, crime or politics the Realm doesn't recognise;
- **any war at all while `RELEASE.warAllowed` is false** (PEACETIME).

Gameplay asks `allowsInteraction(rules, category)` and `pvpAllowed(rules, …)`. The
resolved rules travel in `SimContext.rules`.

## Happy Fall
`ANCHORED` · medieval / early-fantasy · history progresses, technology fixed. Currency
`currency_mark`. Items within the ceiling cross; currency stays home; Familiars
form-shift. Allowed servers: PEACEFUL (default), PRIVATE, FAMILY_FRIENDS,
CURATED_ROLEPLAY, EXPERIMENTAL, FROZEN_ERA. PvP is capped at CONSENT and property risk at SAFE.
Default server: `server_happy-fall-blackmere` (PEACEFUL).
