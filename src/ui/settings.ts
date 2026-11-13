// Settings (saved in this browser): sound volume, how fast the aim marker
// moves, and full screen. Small things each player sets once for themselves.

import { setVolume, sfx, VOLUMES } from '../audio';
import { h, type Overlay } from './dom';

export type AimPace = 'slow' | 'normal' | 'fast';
export const AIM_PACE: Record<AimPace, number> = { slow: 0.75, normal: 1, fast: 1.3 };

export interface Prefs {
  /** Index into VOLUMES (0 = off). */
  volume: number;
  aim: AimPace;
}

export const PREFS_KEY = 'dartmouth-pong/prefs/v1';
export const DEFAULT_PREFS: Prefs = { volume: 2, aim: 'normal' };

export function cleanPrefs(v: unknown): Prefs {
  const o = (v ?? {}) as Partial<Prefs>;
  return {
    volume: typeof o.volume === 'number' && VOLUMES[o.volume] !== undefined ? o.volume : DEFAULT_PREFS.volume,
    aim: o.aim === 'slow' || o.aim === 'fast' ? o.aim : 'normal',
  };
}

export function isFullscreen(): boolean {
  return !!document.fullscreenElement;
}

/** Go full screen, or come back (does nothing where the browser doesn't allow it). */
export function toggleFullscreen(): void {
  try {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  } catch {
    /* not allowed here (an embedded page, for example) */
  }
}

export class SettingsScreen {
  constructor(
    private overlay: Overlay,
    private prefs: Prefs,
    /** Save the prefs and put them into effect. */
    private apply: () => void,
    private back: () => void,
  ) {}

  show(keep = false): void {
    const p = this.prefs;
    const choice = <T,>(label: string, hint: string, options: [T, string][], current: T, set: (v: T) => void) =>
      h(
        'div',
        { class: 'box setting' },
        h('div', {}, h('b', {}, label), h('p', { class: 'dim', style: 'font-size:12px' }, hint)),
        h(
          'div',
          { class: 'chips', role: 'group', 'aria-label': label },
          ...options.map(([v, name]) =>
            h(
              'button',
              {
                class: v === current ? 'on' : '',
                onclick: () => {
                  set(v);
                  this.apply();
                  this.show(true);
                },
              },
              name,
            ),
          ),
        ),
      );
    const full = h(
      'div',
      { class: 'box setting' },
      h('div', {}, h('b', {}, 'Full screen'), h('p', { class: 'dim', style: 'font-size:12px' }, 'F switches it at any time')),
      h('div', { class: 'chips' }, h('button', { class: isFullscreen() ? 'on' : '', onclick: () => (toggleFullscreen(), setTimeout(() => this.overlay.isOpen() && this.show(true), 250)) }, isFullscreen() ? 'On' : 'Off')),
    );
    this.overlay.show(
      h(
        'div',
        { class: 'panel', style: 'max-width:640px' },
        h('div', { class: 'row spread' }, h('h1', {}, 'Settings'), h('button', { class: 'primary', onclick: () => this.back() }, 'Done')),
        choice('Sound', 'M mutes at any time', [[0, 'Off'], [1, 'Low'], [2, 'Medium'], [3, 'High']] as [number, string][], p.volume, (v) => {
          p.volume = v;
          setVolume(VOLUMES[v]);
          sfx.hit(1);
        }),
        choice('Aim speed', 'How fast the marker moves (Shift still slows it)', [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']] as [AimPace, string][], p.aim, (v) => (p.aim = v)),
        full,
      ),
      keep,
    );
  }
}
