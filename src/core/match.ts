// Match = one game or best of 3. Each game gets a fresh engine and a fresh
// random first server; formation and ends stay the same. [Q13]

import type { GameConfig } from '../config';
import { RulesEngine } from './rules';
import type { TeamId } from './types';

export class Match {
  readonly cfg: GameConfig;
  private rng: () => number;
  readonly games: RulesEngine[] = [];
  readonly wins: Record<TeamId, number> = { A: 0, B: 0 };

  private names: Record<string, string>;

  constructor(cfg: GameConfig, rng: () => number = Math.random, names: Record<string, string> = {}) {
    this.cfg = cfg;
    this.rng = rng;
    this.names = names;
    this.games.push(new RulesEngine(cfg, { rng, names }));
  }

  get current(): RulesEngine {
    return this.games[this.games.length - 1];
  }

  get gamesToWin(): number {
    return this.cfg.matchFormat === 'bestOf3' ? 2 : 1;
  }

  get winner(): TeamId | null {
    if (this.wins.A >= this.gamesToWin) return 'A';
    if (this.wins.B >= this.gamesToWin) return 'B';
    return null;
  }

  /**
   * Call after the current game ends. Records the result and starts the next
   * game if the match is still undecided. Returns the match winner, if any.
   */
  finishGame(): TeamId | null {
    const w = this.current.state.winner;
    if (!w) throw new Error('current game is not over');
    if (this.games.length > this.wins.A + this.wins.B) this.wins[w]++;
    if (!this.winner) this.games.push(new RulesEngine(this.cfg, { rng: this.rng, names: this.names }));
    return this.winner;
  }
}
