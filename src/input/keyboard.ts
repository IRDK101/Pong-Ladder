// Keyboard → TeamInput, using the remappable bindings in config.controls.

import type { GameConfig, TeamControls } from '../config';
import type { TeamId } from '../core/types';
import type { TeamInput } from '../game/game';

export class Keyboard {
  private held = new Set<string>();
  private pressed = new Set<string>();
  /** Presses since the last endFrame(), in order (several can land in one frame). */
  private queue: string[] = [];
  private cfg: GameConfig;

  constructor(cfg: GameConfig, target: Window = window) {
    this.cfg = cfg;
    const bound = new Set(Object.values(cfg.controls).flatMap((c: TeamControls) => Object.values(c)));
    target.addEventListener('keydown', (e) => {
      // Typing in a text box (a character's name, a backup) is not game input: leave the key alone.
      if (isTyping(e.target)) return;
      // Nor are keys on the HTML screens' buttons (Enter / Space press them, arrows move around grids).
      if (inScreen(e.target)) return;
      if (bound.has(e.code)) e.preventDefault();
      if (!e.repeat) {
        this.pressed.add(e.code);
        this.queue.push(e.code);
      }
      this.held.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.held.delete(e.code));
    target.addEventListener('blur', () => this.held.clear());
  }

  /** Was this key pressed since the last endFrame()? */
  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  team(team: TeamId): TeamInput {
    const c = this.cfg.controls[team];
    const nav = this.pressed.has(c.left) || this.pressed.has(c.up) ? -1 : this.pressed.has(c.right) || this.pressed.has(c.down) ? 1 : 0;
    return {
      up: this.held.has(c.up),
      down: this.held.has(c.down),
      left: this.held.has(c.left),
      right: this.held.has(c.right),
      hit: this.pressed.has(c.hit),
      style: this.held.has(c.style3) ? 2 : this.held.has(c.style2) ? 1 : 0,
      nav,
    };
  }

  /** Key presses since the last endFrame(), in the order they happened. */
  presses(): readonly string[] {
    return this.queue;
  }

  /** Call once per frame after reading input. */
  endFrame(): void {
    this.pressed.clear();
    this.queue = [];
  }
}

/** True for elements on the HTML screens over the canvas (#ui). */
export function inScreen(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && typeof el.closest === 'function' && !!el.closest('#ui');
}

/** True for text fields, text areas, selects and editable content, where keys must reach the page. */
export function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea' || tag === 'select' || el.isContentEditable) return true;
  if (tag !== 'input') return false;
  const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
  return !['checkbox', 'radio', 'range', 'button', 'submit', 'file', 'color'].includes(type);
}
