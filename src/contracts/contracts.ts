import { err, ok, type Result } from '../core/result';
import { sameRef, type ActorId, type ContractId, type LocationId, type OwnerRef, type PlatformDomain, type TaskId } from '../core/refs';
import { provenance, type Provenance } from '../core/provenance';
import { emit, type SimContext } from '../world/context';
import type { EconomyService } from '../economy/economy';
import type { InventoryService } from '../economy/inventory';
import type { RiskService } from '../economy/risk';
import type { RelationshipService, ReputationService } from '../entities/social';
import type { WorldService } from '../world/world';
import type { Contract, ContractTerms, Reward, Task, TaskRequirement } from './types';

export interface NewContract {
  id?: ContractId;
  kind: string;
  title: string;
  description: string;
  domain?: PlatformDomain;
  issuer: OwnerRef;
  tasks: { title: string; requirement: TaskRequirement }[];
  terms: ContractTerms;
  deadline?: number;
  locationId?: LocationId;
  tags?: string[];
  provenance?: Provenance;
}

export interface ContractSettlement {
  contract: Contract;
  /** Present when a stake was resolved through risk. */
  stakeReturned?: number;
  outcome: string;
}

/**
 * Contracts compose everything else: inventory for deliveries, economy for
 * pay and stakes, risk for uncertain returns, reputation and relationships
 * for social reward. No reward logic is duplicated elsewhere.
 *
 * Funding model: rewards are paid by the issuer. If the issuer cannot pay
 * when the work is done, the contract fails with outcome 'issuer-default' —
 * a non-combat economic risk. Stakes are escrowed out of circulation on
 * accept and the risk-adjusted return is paid back into circulation on
 * completion (both visible in the ledger).
 */
export class ContractService {
  constructor(
    private readonly ctx: SimContext,
    private readonly deps: {
      economy: EconomyService;
      inventory: InventoryService;
      risk: RiskService;
      reputation: ReputationService;
      relationships: RelationshipService;
      world: WorldService;
    },
  ) {}

  get(id: ContractId): Contract | undefined {
    return this.ctx.state.contracts[id];
  }

  tasksOf(id: ContractId): Task[] {
    return (this.get(id)?.taskIds ?? []).map((t) => this.ctx.state.tasks[t]!).filter(Boolean);
  }

  available(): Contract[] {
    return Object.values(this.ctx.state.contracts).filter((c) => c.status === 'offered');
  }

  heldBy(holder: OwnerRef): Contract[] {
    return Object.values(this.ctx.state.contracts).filter((c) => c.holder && sameRef(c.holder, holder));
  }

  offer(spec: NewContract): Contract {
    const now = this.ctx.clock.now();
    const id = spec.id ?? this.ctx.ids.next('contract');
    const domain = spec.domain ?? 'PLAY';
    const taskIds = spec.tasks.map((t) => {
      const task: Task = { id: this.ctx.ids.next('task'), contractId: id, title: t.title, domain, requirement: t.requirement, status: 'open' };
      this.ctx.state.tasks[task.id] = task;
      return task.id;
    });
    const contract: Contract = {
      id,
      kind: spec.kind,
      title: spec.title,
      description: spec.description,
      domain,
      issuer: spec.issuer,
      status: 'offered',
      offeredAt: now,
      deadline: spec.deadline,
      taskIds,
      terms: spec.terms,
      locationId: spec.locationId,
      tags: [...(spec.tags ?? [])],
      provenance: spec.provenance ?? provenance('system', 'contracts', now, { createdBy: spec.issuer }),
    };
    this.ctx.state.contracts[id] = contract;
    emit(this.ctx, 'contract.offered', { contractId: id }, { sourceSystem: 'contracts', domain, location: spec.locationId });
    return contract;
  }

  accept(id: ContractId, holder: OwnerRef): Result<Contract> {
    const c = this.get(id);
    if (!c) return err('UNKNOWN_CONTRACT', `no contract ${id}`);
    if (c.status !== 'offered') return err('NOT_OFFERED', `contract is ${c.status}`);
    if (sameRef(c.issuer, holder)) return err('SELF_CONTRACT', 'cannot accept your own contract');
    const stake = c.terms.stake;
    if (stake) {
      const r = this.deps.economy.burn(holder, stake.currencyId, stake.amount, { reason: 'contract stake escrow', sourceSystem: 'contracts', ref: id });
      if (!r.ok) return r;
    }
    c.status = 'accepted';
    c.holder = holder;
    c.acceptedAt = this.ctx.clock.now();
    for (const t of this.tasksOf(id)) t.assignee = holder;
    emit(this.ctx, stake ? 'investment.made' : 'contract.accepted', { contractId: id, kind: c.kind, title: c.title, stake: stake?.amount ?? 0 }, {
      sourceSystem: 'contracts',
      actor: holder.kind === 'actor' ? holder.id : undefined,
      participants: c.issuer.kind === 'actor' ? [c.issuer.id] : [],
      location: c.locationId,
      domain: c.domain,
      outcome: 'accepted',
      summary: stake ? `Invested ${stake.amount} in ${c.title}` : `Accepted contract: ${c.title}`,
      chronicle: true,
    });
    return ok(c);
  }

  /** Check whether a task's requirement is currently satisfied (no side effects). */
  check(taskId: TaskId, actorId: ActorId): Result<true> {
    const task = this.ctx.state.tasks[taskId];
    if (!task) return err('UNKNOWN_TASK', `no task ${taskId}`);
    const actor = this.ctx.state.actors[actorId];
    if (!actor) return err('UNKNOWN_ACTOR', `no actor ${actorId}`);
    const self: OwnerRef = { kind: 'actor', id: actorId };
    const req = task.requirement;
    switch (req.kind) {
      case 'acquire':
      case 'deliver':
        if (!this.deps.inventory.has(self, req.itemId, req.quantity)) return err('MISSING_ITEMS', `need ${req.quantity} × ${req.itemId}`);
        if (req.kind === 'deliver') {
          const recipient = this.ctx.state.actors[req.to];
          if (!recipient) return err('UNKNOWN_ACTOR', `no recipient ${req.to}`);
          if (recipient.locationId !== actor.locationId) return err('NOT_PRESENT', `${recipient.name} is not here`);
        }
        return ok(true);
      case 'visit':
        if (!actor.locationId || !this.deps.world.isWithin(actor.locationId, req.locationId)) return err('NOT_THERE', 'not at the required location');
        return ok(true);
      case 'talk': {
        const other = this.ctx.state.actors[req.actorId];
        if (!other || other.locationId !== actor.locationId) return err('NOT_PRESENT', 'they are not here');
        return ok(true);
      }
      case 'wait': {
        const contract = task.contractId ? this.get(task.contractId) : undefined;
        const since = contract?.acceptedAt;
        if (since === undefined) return err('NOT_STARTED', 'the waiting has not begun');
        const left = since + req.durationMs - this.ctx.clock.now();
        if (left > 0) return err('NOT_YET', `not yet — about ${Math.ceil(left / 1000)}s to go`);
        return ok(true);
      }
      case 'custom':
        return ok(true);
    }
  }

  /** Complete one task (performing any delivery). Completes the contract when all tasks are done. */
  completeTask(taskId: TaskId, actorId: ActorId): Result<{ task: Task; settlement?: ContractSettlement }> {
    const task = this.ctx.state.tasks[taskId];
    if (!task) return err('UNKNOWN_TASK', `no task ${taskId}`);
    if (task.status !== 'open') return err('TASK_CLOSED', `task is ${task.status}`);
    const contract = task.contractId ? this.get(task.contractId) : undefined;
    if (contract && contract.status !== 'accepted') return err('NOT_ACCEPTED', `contract is ${contract.status}`);
    if (contract && !(contract.holder && sameRef(contract.holder, { kind: 'actor', id: actorId }))) {
      return err('NOT_HOLDER', 'only the contract holder can complete its tasks');
    }
    const ready = this.check(taskId, actorId);
    if (!ready.ok) return ready;
    const req = task.requirement;
    if (req.kind === 'deliver') {
      const moved = this.deps.inventory.move({ kind: 'actor', id: actorId }, { kind: 'actor', id: req.to }, req.itemId, req.quantity, 'delivery');
      if (!moved.ok) return moved;
    }
    task.status = 'done';
    task.completedAt = this.ctx.clock.now();
    emit(this.ctx, 'task.completed', { taskId, contractId: task.contractId ?? null }, { sourceSystem: 'contracts', actor: actorId, domain: task.domain });

    if (contract && this.tasksOf(contract.id).every((t) => t.status === 'done')) {
      const settled = this.settle(contract.id);
      if (!settled.ok) return settled;
      return ok({ task, settlement: settled.value });
    }
    return ok({ task });
  }

  /** Pay out a contract whose tasks are all done. */
  settle(id: ContractId): Result<ContractSettlement> {
    const c = this.get(id);
    if (!c) return err('UNKNOWN_CONTRACT', `no contract ${id}`);
    if (c.status !== 'accepted' || !c.holder) return err('NOT_ACCEPTED', `contract is ${c.status}`);
    if (this.tasksOf(id).some((t) => t.status !== 'done')) return err('TASKS_OPEN', 'not all tasks are done');
    const holder = c.holder;

    // Issuer must be able to fund every currency/item reward, or it defaults.
    if (!this.issuerCanFund(c)) {
      return ok(this.close(c, 'failed', 'issuer-default', `${this.ownerName(c.issuer)} could not pay for: ${c.title}`));
    }

    let stakeReturned: number | undefined;
    let outcome = 'completed';
    const stake = c.terms.stake;
    if (stake) {
      if (c.terms.riskProfileId) {
        const res = this.deps.risk.resolve(c.terms.riskProfileId, stake.amount);
        if (!res.ok) return res;
        stakeReturned = res.value.returned;
        outcome = res.value.outcome.key;
      } else {
        stakeReturned = stake.amount;
      }
      if (stakeReturned > 0) {
        this.deps.economy.mint(holder, stake.currencyId, stakeReturned, { reason: 'contract stake return', sourceSystem: 'contracts', ref: id });
      }
    }
    for (const r of c.terms.rewards) this.applyReward(r, c.issuer, holder, id, 1);
    if (stake && stakeReturned !== undefined && stakeReturned !== stake.amount) {
      const lost = stakeReturned < stake.amount;
      const diff = Math.abs(stake.amount - stakeReturned);
      emit(this.ctx, lost ? 'economy.loss' : 'economy.gain', { contractId: id, amount: diff, currencyId: stake.currencyId }, {
        sourceSystem: 'contracts',
        actor: holder.kind === 'actor' ? holder.id : undefined,
        location: c.locationId,
        domain: c.domain,
        outcome: outcome,
        summary: lost ? `Lost ${diff} on ${c.title}` : `Made ${diff} on ${c.title}`,
        chronicle: true,
      });
    }
    const summary = stake
      ? `Settled ${c.title}: staked ${stake.amount}, returned ${stakeReturned} (${outcome})`
      : c.issuer.kind === 'actor'
        ? `Helped ${this.ownerName(c.issuer)}: ${c.title}`
        : `Completed contract: ${c.title}`;
    return ok({ ...this.close(c, 'completed', outcome, summary), stakeReturned });
  }

  /** Fail an accepted contract, applying penalties. Stakes are forfeit. */
  fail(id: ContractId, reason: string): Result<ContractSettlement> {
    const c = this.get(id);
    if (!c) return err('UNKNOWN_CONTRACT', `no contract ${id}`);
    if (c.status !== 'accepted' || !c.holder) return err('NOT_ACCEPTED', `contract is ${c.status}`);
    for (const p of c.terms.penalties) this.applyReward(p, c.holder, c.issuer, id, -1);
    for (const t of this.tasksOf(id)) if (t.status === 'open') t.status = 'failed';
    return ok(this.close(c, 'failed', reason, `Failed contract: ${c.title} (${reason})`));
  }

  cancel(id: ContractId): Result<Contract> {
    const c = this.get(id);
    if (!c) return err('UNKNOWN_CONTRACT', `no contract ${id}`);
    if (c.status !== 'offered') return err('NOT_OFFERED', 'only offered contracts can be cancelled');
    c.status = 'cancelled';
    c.closedAt = this.ctx.clock.now();
    emit(this.ctx, 'contract.cancelled', { contractId: id }, { sourceSystem: 'contracts' });
    return ok(c);
  }

  /** Expire contracts past their deadline. Accepted ones fail; offered ones simply expire. */
  tick(): void {
    const now = this.ctx.clock.now();
    for (const c of Object.values(this.ctx.state.contracts)) {
      if (c.deadline === undefined || c.deadline > now) continue;
      if (c.status === 'accepted') this.fail(c.id, 'deadline-missed');
      else if (c.status === 'offered') {
        c.status = 'expired';
        c.closedAt = now;
        emit(this.ctx, 'contract.expired', { contractId: c.id }, { sourceSystem: 'contracts' });
      }
    }
  }

  private issuerCanFund(c: Contract): boolean {
    const needs = new Map<string, number>();
    for (const r of c.terms.rewards) {
      if (r.kind === 'currency') needs.set(`c:${r.currencyId}`, (needs.get(`c:${r.currencyId}`) ?? 0) + r.amount);
      if (r.kind === 'item') needs.set(`i:${r.itemId}`, (needs.get(`i:${r.itemId}`) ?? 0) + r.quantity);
    }
    for (const [k, amount] of needs) {
      const id = k.slice(2);
      const okay = k.startsWith('c:')
        ? this.deps.economy.canAfford(c.issuer, id as never, amount)
        : this.deps.inventory.has(c.issuer, id as never, amount);
      if (!okay) return false;
    }
    return true;
  }

  /**
   * direction 1: reward flows from `payer` to `payee`.
   * direction -1: a penalty — currency/items flow from `payer` (holder) to `payee` (issuer)
   * as far as they can afford; reputation/relationship deltas are negated.
   */
  private applyReward(r: Reward, payer: OwnerRef, payee: OwnerRef, ref: string, direction: 1 | -1): void {
    const opts = { reason: direction === 1 ? 'contract reward' : 'contract penalty', sourceSystem: 'contracts', ref };
    switch (r.kind) {
      case 'currency': {
        const amount = direction === 1 ? r.amount : Math.min(r.amount, this.deps.economy.balance(payer, r.currencyId));
        if (amount > 0) this.deps.economy.transfer(payer, payee, r.currencyId, amount, opts);
        return;
      }
      case 'item': {
        const qty = direction === 1 ? r.quantity : Math.min(r.quantity, this.deps.inventory.count(payer, r.itemId));
        if (qty > 0) this.deps.inventory.move(payer, payee, r.itemId, qty, opts.reason);
        return;
      }
      case 'reputation': {
        const subject = direction === 1 ? payee : payer;
        this.deps.reputation.adjust(subject, r.scope, r.amount * direction, opts.reason);
        return;
      }
      case 'relationship': {
        const subject = direction === 1 ? payee : payer;
        if (subject.kind !== 'actor') return;
        // The NPC's view of the player changes.
        this.deps.relationships.adjust(r.with, subject.id, { regard: (r.regard ?? 0) * direction, trust: (r.trust ?? 0) * direction, familiarity: 5 }, opts.reason);
        return;
      }
    }
  }

  private close(c: Contract, status: 'completed' | 'failed', outcome: string, summary: string): ContractSettlement {
    c.status = status;
    c.outcome = outcome;
    c.closedAt = this.ctx.clock.now();
    const holder = c.holder;
    emit(this.ctx, status === 'completed' ? 'contract.completed' : 'contract.failed', { contractId: c.id, kind: c.kind, outcome }, {
      sourceSystem: 'contracts',
      actor: holder?.kind === 'actor' ? holder.id : undefined,
      participants: c.issuer.kind === 'actor' ? [c.issuer.id] : [],
      location: c.locationId,
      domain: c.domain,
      outcome,
      summary,
      chronicle: true,
    });
    return { contract: c, outcome };
  }

  private ownerName(ref: OwnerRef): string {
    return ref.kind === 'actor'
      ? this.ctx.state.actors[ref.id]?.name ?? ref.id
      : this.ctx.state.organizations[ref.id]?.name ?? ref.id;
  }
}
