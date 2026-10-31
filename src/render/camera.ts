// Perspective camera for the 3D-looking views. Pure math, no canvas.
//
// World axes are the game's: x along the table (Team A end at 0), y across
// it, z up from the table surface (the floor is at -tableHeight). Screen
// "right" is chosen so the camera behind Team A shows A's left player on the
// left, and the camera behind Team B shows the table turned around.

import type { GameConfig } from '../config';
import type { Vec3 } from '../core/physics';
import type { TeamId } from '../core/types';
import type { ControlFrame } from '../game/game';

export interface Camera {
  eye: Vec3;
  /** Unit vectors: viewing direction, screen-right and screen-up in world space. */
  f: Vec3;
  r: Vec3;
  u: Vec3;
  /** Pixels per unit at depth 1. */
  focal: number;
  /** Screen center (pixels in the viewport). */
  cx: number;
  cy: number;
  near: number;
}

export interface Projected {
  x: number;
  y: number;
  /** Distance along the view direction. */
  depth: number;
  /** Pixels per world meter at this depth. */
  scale: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

export function lookAt(eye: Vec3, target: Vec3, fovYDeg: number, width: number, height: number): Camera {
  const f = norm(sub(target, eye));
  const r = norm(cross({ x: 0, y: 0, z: 1 }, f));
  const u = cross(f, r);
  const focal = height / 2 / Math.tan((fovYDeg * Math.PI) / 360);
  return { eye, f, r, u, focal, cx: width / 2, cy: height / 2, near: 0.05 };
}

/** Camera-space coordinates: (right, up, depth). */
export function toCamera(cam: Camera, p: Vec3): Vec3 {
  const d = sub(p, cam.eye);
  return { x: dot(d, cam.r), y: dot(d, cam.u), z: dot(d, cam.f) };
}

export function projectCam(cam: Camera, c: Vec3): Projected {
  const scale = cam.focal / c.z;
  return { x: cam.cx + c.x * scale, y: cam.cy - c.y * scale, depth: c.z, scale };
}

/** Project a world point, or null if it is behind the camera. */
export function project(cam: Camera, p: Vec3): Projected | null {
  const c = toCamera(cam, p);
  if (c.z < cam.near) return null;
  return projectCam(cam, c);
}

/** Project a polygon, clipped against the near plane (Sutherland–Hodgman). Empty if fully behind. */
export function projectPolygon(cam: Camera, pts: Vec3[]): { x: number; y: number }[] {
  const cs = pts.map((p) => toCamera(cam, p));
  const out: Vec3[] = [];
  for (let i = 0; i < cs.length; i++) {
    const a = cs[i];
    const b = cs[(i + 1) % cs.length];
    const ain = a.z >= cam.near;
    const bin = b.z >= cam.near;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (cam.near - a.z) / (b.z - a.z);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: cam.near });
    }
  }
  return out.map((c) => projectCam(cam, c));
}

/** The behind-the-shoulders camera for a team, sized to a viewport. */
export function teamCamera(cfg: GameConfig, team: TeamId, width: number, height: number): Camera {
  const { length: L, width: W } = cfg.table;
  const c = cfg.camera;
  const back = team === 'A' ? -c.behind : L + c.behind;
  const look = team === 'A' ? L * c.lookAt : L * (1 - c.lookAt);
  return lookAt({ x: back, y: W / 2, z: c.height }, { x: look, y: W / 2, z: c.lookHeight }, c.fovY, width, height);
}

/** Aim-key frame matching a camera: screen-up and screen-right on the table plane. */
export function cameraFrame(cam: Camera): ControlFrame {
  const fl = Math.hypot(cam.f.x, cam.f.y) || 1;
  const rl = Math.hypot(cam.r.x, cam.r.y) || 1;
  const round = (v: number) => Math.round(v * 1e6) / 1e6 || 0; // no -0
  return { up: [round(cam.f.x / fl), round(cam.f.y / fl)], right: [round(cam.r.x / rl), round(cam.r.y / rl)] };
}
