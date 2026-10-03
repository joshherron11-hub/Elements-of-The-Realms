import type { ContractId, FamiliarId, ItemId, LocationId, MarketId, PlatformDomain, PropertyId, ResourceNodeId, TaskId, ActorId } from '../core/refs';
import type { InteractionCategory } from '../world/realm';

/**
 * INTENTS
 *
 * An intent is one thing a player asks to do. Presentation (keyboard, UI,
 * future AI agents) only ever produces intents; the IntentService turns them
 * into kernel service calls. Intents are plain data, so they can be logged,
 * replayed or sent over a network later.
 */
export type Intent =
  | { readonly kind: 'travel'; readonly to: LocationId }
  | { readonly kind: 'talk'; readonly with: ActorId }
  | { readonly kind: 'buy'; readonly marketId: MarketId; readonly itemId: ItemId; readonly quantity: number }
  | { readonly kind: 'sell'; readonly marketId: MarketId; readonly itemId: ItemId; readonly quantity: number }
  | { readonly kind: 'gather'; readonly nodeId: ResourceNodeId; readonly amount: number }
  | { readonly kind: 'search' }
  | { readonly kind: 'accept-contract'; readonly contractId: ContractId }
  | { readonly kind: 'complete-task'; readonly taskId: TaskId }
  | { readonly kind: 'purchase-property'; readonly propertyId: PropertyId }
  | { readonly kind: 'familiar-status' }
  | { readonly kind: 'acquire-familiar'; readonly familiarId: FamiliarId }
  | { readonly kind: 'feed-familiar'; readonly familiarId: FamiliarId; readonly itemId: ItemId }
  | { readonly kind: 'rest-familiar'; readonly familiarId: FamiliarId }
  | { readonly kind: 'bond-familiar'; readonly familiarId: FamiliarId };

export type IntentKind = Intent['kind'];

export const INTENT_KINDS: readonly IntentKind[] = [
  'travel',
  'talk',
  'buy',
  'sell',
  'gather',
  'search',
  'accept-contract',
  'complete-task',
  'purchase-property',
  'familiar-status',
  'acquire-familiar',
  'feed-familiar',
  'rest-familiar',
  'bond-familiar',
];

export interface IntentOutcome {
  kind: IntentKind;
  summary: string;
  data?: Record<string, unknown>;
}

/**
 * MODES
 *
 * A mode is an activity frame over the same world: which intents are
 * available and which interaction categories the server must allow.
 */
export const MODE_KEYS = [
  'DUEL',
  'WAR',
  'HUNT',
  'SEARCH',
  'HEIST',
  'EMPIRE',
  'DRIVE',
  'LIVE',
  'VEIL',
  'FORGE',
  'TOURNAMENT',
  'SPECTATE',
  'COMPANION',
  'EXPLORE',
  'INVEST',
  'SCHOLAR',
  'SOCIAL',
] as const;
export type ModeKey = (typeof MODE_KEYS)[number];

export interface ModeDefinition {
  key: ModeKey;
  name: string;
  summary: string;
  /** Only 'implemented' modes can be entered. */
  status: 'implemented' | 'planned';
  domain: PlatformDomain;
  /** Every listed category must be allowed by the server's rules. */
  categories: InteractionCategory[];
  intents: IntentKind[];
  requires?: { pvp?: boolean; war?: boolean };
  /** If set, contract intents only see these contract kinds. */
  contractKinds?: string[];
}
