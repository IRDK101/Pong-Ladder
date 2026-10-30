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
