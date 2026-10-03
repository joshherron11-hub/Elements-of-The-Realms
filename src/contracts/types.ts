import type {
  ActorId,
  ContractId,
  CurrencyId,
  ItemId,
  LocationId,
  OwnerRef,
  PlatformDomain,
  RiskProfileId,
  ScopeRef,
  TaskId,
} from '../core/refs';
import type { Provenance } from '../core/provenance';

/**
 * A Contract is an agreement between an issuer and a holder: tasks to do,
 * rewards on completion, penalties on failure, optional stake and risk. The
 * same structure covers a delivery job, an investment, an apprenticeship or a
 * work commission.
 */
export type ContractStatus = 'offered' | 'accepted' | 'completed' | 'failed' | 'cancelled' | 'expired';

export type Reward =
  | { readonly kind: 'currency'; readonly currencyId: CurrencyId; readonly amount: number }
  | { readonly kind: 'item'; readonly itemId: ItemId; readonly quantity: number }
  | { readonly kind: 'reputation'; readonly scope: ScopeRef; readonly amount: number }
  | { readonly kind: 'relationship'; readonly with: ActorId; readonly regard?: number; readonly trust?: number };

export interface ContractTerms {
  rewards: Reward[];
  /** Applied to the holder if the contract fails. */
  penalties: Reward[];
  /** Currency the holder puts up when accepting (e.g. an investment). */
  stake?: { currencyId: CurrencyId; amount: number };
  /** If set, the stake's return is resolved through this risk profile on completion. */
  riskProfileId?: RiskProfileId;
}

export interface Contract {
  readonly id: ContractId;
  /** 'delivery', 'search', 'merchant', 'investment', 'commission', ... */
  kind: string;
  title: string;
  description: string;
  domain: PlatformDomain;
  issuer: OwnerRef;
  holder?: OwnerRef;
  status: ContractStatus;
  offeredAt: number;
  acceptedAt?: number;
  closedAt?: number;
  deadline?: number;
  taskIds: TaskId[];
  terms: ContractTerms;
  locationId?: LocationId;
  /** Free-form outcome key set when closed, e.g. a risk outcome. */
  outcome?: string;
  tags: string[];
  provenance: Provenance;
}

/** What a task asks for. Checked deterministically. */
export type TaskRequirement =
  | { readonly kind: 'deliver'; readonly itemId: ItemId; readonly quantity: number; readonly to: ActorId }
  | { readonly kind: 'acquire'; readonly itemId: ItemId; readonly quantity: number }
  | { readonly kind: 'visit'; readonly locationId: LocationId }
  | { readonly kind: 'talk'; readonly actorId: ActorId }
  | { readonly kind: 'custom'; readonly key: string };

export type TaskStatus = 'open' | 'done' | 'failed';

/**
 * A unit of work. Tasks may belong to a contract or stand alone (future Work
 * and Learn products reuse them for projects and practice).
 */
export interface Task {
  readonly id: TaskId;
  contractId?: ContractId;
  title: string;
  domain: PlatformDomain;
  requirement: TaskRequirement;
  status: TaskStatus;
  assignee?: OwnerRef;
  completedAt?: number;
}
