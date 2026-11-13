// Sound effects, made on the spot with the Web Audio API (no files): paddle
// hits, table bounces, cup clinks, sink splashes, menu ticks and end-of-game
// stings. The game itself knows nothing about sound: `GameSounds` watches a
// game's state each frame and plays what changed, so it works the same for a
// local match and for an online mirror.

import type { TeamId } from './core/types';
import type { Game } from './game/game';

/** Volume steps for the Settings screen (0 = off). */
export const VOLUMES = [0, 0.35, 0.7, 1] as const;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let volume = 0.7;
let noiseBuf: AudioBuffer | null = null;

/** Browsers only allow sound after a key press or click: call this from one. */
export function unlockAudio(): void {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume * 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function setVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
  if (master) master.gain.value = volume * 0.5;
}
export function getVolume(): number {
  return volume;
}

function ready(): AudioContext | null {
  return ctx && master && volume > 0 && ctx.state === 'running' ? ctx : null;
}

/** A short pitched blip: `type` wave from f0 sliding to f1 over `dur` seconds. */
function tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, delay = 0): void {
  const a = ready();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** A burst of filtered noise (splashes, whiffs). */
function noise(freq: number, q: number, dur: number, gain: number, delay = 0, sweepTo = freq): void {
  const a = ready();
  if (!a) return;
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = a.currentTime + delay;
  const s = a.createBufferSource();
  s.buffer = noiseBuf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master!);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}

export const sfx = {
  /** A paddle hit: brighter and snappier the better the timing (0..1). */
  hit(quality: number): void {
    const f = 520 + quality * 520;
    tone('triangle', f, f * 0.55, 0.07, 0.55);
    noise(2600, 1.2, 0.03, 0.25);
    if (quality > 0.85) tone('sine', 1560, 2080, 0.12, 0.18, 0.02);
  },
  whiff(): void {
    noise(900, 0.8, 0.16, 0.3, 0, 300);
  },
  bounce(): void {
    tone('sine', 880, 500, 0.05, 0.4);
    noise(3200, 2, 0.02, 0.12);
  },
  cupHit(): void {
    tone('triangle', 1250, 900, 0.09, 0.4);
    tone('sine', 1900, 1500, 0.14, 0.2, 0.01);
  },
  sink(): void {
    tone('sine', 420, 110, 0.22, 0.6);
    noise(1800, 0.7, 0.35, 0.45, 0.03, 500);
    tone('sine', 660, 990, 0.1, 0.25, 0.2);
    tone('sine', 880, 1320, 0.12, 0.25, 0.3);
  },
  fault(): void {
    tone('square', 220, 150, 0.16, 0.16);
  },
  move(): void {
    tone('square', 660, 620, 0.03, 0.1);
  },
  select(): void {
    tone('square', 620, 930, 0.06, 0.14);
  },
  win(): void {
    [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.16, 0.4, i * 0.11));
    tone('triangle', 1319, 1319, 0.4, 0.4, 0.44);
  },
  lose(): void {
    [392, 330, 262].forEach((f, i) => tone('triangle', f, f * 0.97, 0.22, 0.35, i * 0.17));
  },
};

const msgKey = (g: Game) => {
  const m = g.messages[g.messages.length - 1];
  return m ? `${m.time}|${m.text}` : '';
};

/** Plays a game's sounds by watching what changed since the last frame. */
export class GameSounds {
  private game: Game | null = null;
  private hits = '';
  private fx = new Set<string>();
  private vz = 0;
  private fbTime = -1;
  private lastMsg = '';
  private over = false;
  private lastBounce = 0;

  /** Call once per frame with the game on screen and the team to cheer for (null: cheer the winner). */
  watch(game: Game, you: TeamId | null): void {
    const first = game !== this.game;
    const st = game.engine.peek();
    const hits = JSON.stringify(game.hitTimes);
    const fxKeys = game.cupFx.map((f) => `${f.kind}:${f.cupId}:${f.time}`);
    if (!first) {
      const fb = game.feedback;
      const swung = fb && fb.time !== this.fbTime;
      if (hits !== this.hits) sfx.hit(swung && fb.quality !== null ? fb.quality : 0.5);
      else if (swung && fb.quality === null) sfx.whiff();
      for (let i = 0; i < fxKeys.length; i++) {
        if (this.fx.has(fxKeys[i])) continue;
        if (game.cupFx[i].kind === 'sink') sfx.sink();
        else sfx.cupHit();
      }
      // A table bounce: the ball was falling and now rises, right at the surface.
      const b = game.ball;
      if (b.status === 'flying' && this.vz < -0.3 && b.vel.z > 0.1 && b.pos.z < 0.1 && b.pos.z > -0.02 && hits === this.hits && Math.abs(game.time - this.lastBounce) > 0.04) {
        sfx.bounce();
        this.lastBounce = game.time;
      }
      // Calls that end a point without a sink (a miss, a fault).
      const text = msgKey(game);
      if (text !== this.lastMsg) {
        if (/miss|out|double|low hit|volley|wrong/i.test(text) && !/SINK|Cup hit|Save/i.test(text)) sfx.fault();
      }
      const over = st.phase === 'gameOver';
      if (over && !this.over) {
        if (you === null || st.winner === you) sfx.win();
        else sfx.lose();
      }
    }
    this.game = game;
    this.hits = hits;
    this.fx = new Set(fxKeys);
    this.vz = game.ball.vel.z;
    this.fbTime = game.feedback?.time ?? -1;
    this.lastMsg = msgKey(game);
    this.over = st.phase === 'gameOver';
  }
}
