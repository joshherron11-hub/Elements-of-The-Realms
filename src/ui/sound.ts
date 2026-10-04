import type { KernelEvent } from '../core/events';

/**
 * SOUND HOOKS
 *
 * Gameplay never plays sounds; the presentation layer maps simulation events
 * (and a few UI moments) to named cues. A `SoundPlayer` turns cues into audio.
 * The default player synthesises short tones with WebAudio (no asset files);
 * real recorded sounds can replace it without touching any caller.
 */
export const SOUND_CUES = [
  'coin-in', 'coin-out', 'door', 'step', 'discover', 'quest', 'quest-done', 'bark', 'chirp', 'caw',
  'page', 'bell', 'hearth', 'warm', 'error', 'save',
] as const;
export type SoundCue = (typeof SOUND_CUES)[number];

/** Map a simulation event to a cue, from the player's point of view. Pure. */
export function eventToCue(e: KernelEvent & { meta?: { actor?: string; participants?: string[] } }, playerId: string): SoundCue | undefined {
  const mine = e.meta?.actor === playerId;
  const p = e.payload as Record<string, unknown> | undefined;
  switch (e.type) {
    case 'market.purchase':
      return mine ? 'coin-out' : undefined;
    case 'market.sale':
    case 'stall.sale':
      return mine ? 'coin-in' : undefined;
    case 'contract.accepted':
    case 'investment.made':
      return mine ? 'quest' : undefined;
    case 'contract.completed':
      return mine ? 'quest-done' : undefined;
    case 'contract.failed':
    case 'economy.loss':
      return mine ? 'error' : undefined;
    case 'location.discovered':
      return mine ? 'discover' : undefined;
    case 'search.found':
      return mine ? 'chirp' : undefined;
    case 'familiar.acquired':
    case 'familiar.fed':
    case 'familiar.bonded':
      return mine ? 'bark' : undefined;
    case 'happening.occurred':
    case 'relationship.formed':
      return mine || (p?.to === playerId) ? 'warm' : undefined;
    case 'market.price-changed':
    case 'market.restocked':
      return 'bell';
    case 'property.purchased':
      return mine ? 'quest-done' : undefined;
    case 'actor.travelled':
      return p?.actorId === playerId ? 'step' : undefined;
    default:
      return undefined;
  }
}

export interface SoundPlayer {
  play(cue: SoundCue): void;
  setMuted(muted: boolean): void;
  readonly muted: boolean;
}

export class SilentPlayer implements SoundPlayer {
  muted = true;
  readonly played: SoundCue[] = [];
  play(cue: SoundCue): void {
    this.played.push(cue);
  }
  setMuted(m: boolean): void {
    this.muted = m;
  }
}

/** Tiny procedural synth: each cue is a couple of shaped tones. Starts muted until the player unmutes. */
export class SynthPlayer implements SoundPlayer {
  private ctx?: AudioContext;
  muted = true;

  setMuted(m: boolean): void {
    this.muted = m;
    if (!m && !this.ctx) {
      const AC = (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
      if (AC) this.ctx = new AC();
    }
    void this.ctx?.resume();
  }

  play(cue: SoundCue): void {
    if (this.muted || !this.ctx) return;
    const notes: Record<SoundCue, [number, number, OscillatorType][]> = {
      'coin-in': [[880, 0.06, 'triangle'], [1320, 0.1, 'triangle']],
      'coin-out': [[660, 0.06, 'triangle'], [440, 0.1, 'triangle']],
      door: [[140, 0.12, 'sawtooth']],
      step: [[90, 0.03, 'square']],
      discover: [[523, 0.1, 'sine'], [659, 0.1, 'sine'], [784, 0.18, 'sine']],
      quest: [[392, 0.1, 'triangle'], [523, 0.16, 'triangle']],
      'quest-done': [[523, 0.1, 'triangle'], [659, 0.1, 'triangle'], [1046, 0.25, 'triangle']],
      bark: [[300, 0.05, 'square'], [220, 0.07, 'square']],
      chirp: [[1800, 0.04, 'sine'], [2200, 0.05, 'sine']],
      caw: [[260, 0.12, 'sawtooth']],
      page: [[2000, 0.03, 'triangle']],
      bell: [[1046, 0.3, 'sine']],
      hearth: [[70, 0.2, 'sawtooth']],
      warm: [[440, 0.12, 'sine'], [554, 0.2, 'sine']],
      error: [[200, 0.15, 'square']],
      save: [[784, 0.08, 'sine'], [988, 0.12, 'sine']],
    };
    let t = this.ctx.currentTime;
    for (const [freq, dur, type] of notes[cue]) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      t += dur * 0.8;
    }
  }
}
