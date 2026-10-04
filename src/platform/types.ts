import type { ActorId, OwnerRef, PlatformDomain } from '../core/refs';
import type { Provenance } from '../core/provenance';

/**
 * PLAY / LEARN / WORK / CREATE — shared records.
 *
 * The four domains reuse the same kernel: organizations (a team, a school,
 * a studio), contracts and tasks (a commission, a course, a project), the
 * Chronicle (a Professional or Learning Chronicle is a domain-filtered view),
 * ownership and provenance. Two small additions make the model complete:
 *
 *  - Artifact: something a person made — a document, a design, coursework,
 *    media, a world. An owned asset (kind 'artifact') with provenance.
 *  - Contribution: who did what on what — the raw record of work, never a
 *    judgement of its worth.
 */
export type ArtifactKind = 'document' | 'design' | 'coursework' | 'media' | 'world' | 'code' | 'other';

export interface Artifact {
  readonly id: string;
  kind: ArtifactKind;
  title: string;
  domain: PlatformDomain;
  createdAt: number;
  createdBy: OwnerRef;
  /** Everyone who contributed, in order of first contribution. */
  contributors: ActorId[];
  /** Where the content lives and a hash of it; content itself is not stored in the world. */
  content?: { uri?: string; hash?: string };
  /** Workflow state only — never a quality score. */
  status: 'draft' | 'submitted' | 'accepted' | 'withdrawn';
  tags: string[];
  provenance: Provenance;
}

export interface Contribution {
  readonly id: string;
  readonly actor: ActorId;
  readonly target: { readonly kind: 'artifact' | 'task' | 'contract' | 'organization'; readonly id: string };
  /** e.g. 'author', 'editor', 'reviewer', 'mentor', 'learner'. */
  readonly role: string;
  readonly at: number;
  readonly domain: PlatformDomain;
  readonly note?: string;
  readonly provenance: Provenance;
}
