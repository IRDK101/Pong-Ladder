// Closed-form trajectory helpers (no drag, no spin yet).

import type { GameConfig } from '../config';
import type { Vec3 } from './physics';

/** Highest z the ball will reach from this launch state. Used for the low-hit call. */
export function predictPeak(pos: Vec3, vel: Vec3, gravity: number): number {
  return vel.z > 0 ? pos.z + (vel.z * vel.z) / (2 * gravity) : pos.z;
}

/** Time for a ball at height z0 >= 0 moving up at vz to come down to z = 0. */
function timeToTable(z0: number, vz: number, g: number): number {
  return (vz + Math.sqrt(vz * vz + 2 * g * z0)) / g;
}

/**
 * Launch velocity so the ball peaks at `peak` and first lands on the table at `to`.
 * If the ball is already above `peak`, it is hit flat (vz = 0).
 */
export function solveArc(from: Vec3, to: { x: number; y: number }, peak: number, g: number): Vec3 {
  const apex = Math.max(peak, from.z, 0.01);
  const vz = Math.sqrt(2 * g * (apex - from.z));
  // From the apex, fall `apex` to the table.
  const T = vz / g + Math.sqrt((2 * apex) / g);
  return { x: (to.x - from.x) / T, y: (to.y - from.y) / T, z: vz };
}

/**
 * Serve velocity: the ball peaks at `peak`, bounces once on the table, and its
 * second landing is `to`. Uses the configured restitution and table friction.
 * Returns the velocity and the predicted first-bounce point.
 */
export function solveServe(cfg: GameConfig, from: Vec3, to: { x: number; y: number }, peak: number): { vel: Vec3; firstBounce: { x: number; y: number } } {
  const { gravity: g, restitution: e, tableFriction: f } = cfg.physics;
  const apex = Math.max(peak, from.z, 0.01);
  const vz = Math.sqrt(2 * g * (apex - from.z));
  const T1 = timeToTable(from.z, vz, g);
  const impact = Math.sqrt(2 * g * apex);
  const T2 = (2 * impact * e) / g;
  const span = T1 + f * T2;
  const vel = { x: (to.x - from.x) / span, y: (to.y - from.y) / span, z: vz };
  return { vel, firstBounce: { x: from.x + vel.x * T1, y: from.y + vel.y * T1 } };
}
