// Scripted-scenario helpers for rules-engine tests.

import { makeConfig, type GameConfig } from '../src/config';
import { RulesEngine, type Call } from '../src/core/rules';
import { diagonalOf, laneOf, type Lane } from '../src/core/table';
import type { PlayerId, Side, TeamId } from '../src/core/types';

export const P = (team: TeamId, side: Side): PlayerId => ({ team, side });
export const AL = P('A', 'left');
export const AR = P('A', 'right');
export const BL = P('B', 'left');
export const BR = P('B', 'right');

export const HIGH = 1.5; // comfortably above shoulder height
export const LOW = 0.3;

export class Script {
  eng: RulesEngine;
  cfg: GameConfig;
  calls: Call[] = [];

  constructor(firstServer: PlayerId, overrides: Partial<GameConfig> = {}) {
    this.cfg = makeConfig(overrides);
    this.eng = new RulesEngine(this.cfg, { firstServer });
  }

  get s() {
    return this.eng.state;
  }

  get last(): Call | undefined {
    return this.calls[this.calls.length - 1];
  }

  kinds(): string[] {
    return this.calls.map((c) => c.kind);
  }

  /** Point in the middle of a quarter. */
  spot(team: TeamId, lane: Lane): { x: number; y: number } {
    const { length: L, width: W } = this.cfg.table;
    return { x: team === 'A' ? L * 0.25 : L * 0.75, y: lane === 'low' ? W * 0.25 : W * 0.75 };
  }

  send(ev: Parameters<RulesEngine['dispatch']>[0]) {
    const r = this.eng.dispatch(ev);
    this.calls.push(...r.calls);
    return r;
  }

  hit(p: PlayerId, peak = HIGH) {
    return this.send({ type: 'hit', player: p, peak });
  }

  bounceAt(x: number, y: number) {
    return this.send({ type: 'bounce', x, y });
  }

  bounce(team: TeamId, lane: Lane = 'low') {
    const { x, y } = this.spot(team, lane);
    return this.bounceAt(x, y);
  }

  out() {
    return this.send({ type: 'ballOut' });
  }

  cup(team: TeamId, cupId: string) {
    return this.send({ type: 'cupContact', team, cupId });
  }

  sink(team: TeamId, cupId: string) {
    return this.send({ type: 'sink', team, cupId });
  }

  choose(team: TeamId, cupId: string) {
    return this.send({ type: 'chooseCup', team, cupId });
  }

  /** Server hits, bounces once in own quarter. Ball is in flight toward the receiver. */
  serveToBounce() {
    const server = this.s.server;
    this.hit(server, HIGH);
    this.bounce(server.team, laneOf(server));
  }

  /** A complete legal serve: lands in the diagonal quarter. */
  goodServe() {
    this.serveToBounce();
    const rec = diagonalOf(this.s.server);
    this.bounce(rec.team, laneOf(rec));
  }

  /** Legal rally hit by p: hit high, lands once on the other side. */
  rallyHit(p: PlayerId) {
    this.hit(p, HIGH);
    this.bounce(p.team === 'A' ? 'B' : 'A');
  }

  cupState(team: TeamId, cupId: string) {
    return this.s.cups[team].find((c) => c.id === cupId)!.state;
  }

  tableMiss() {
    this.serveToBounce();
    this.out();
  }
}
