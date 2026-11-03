// The Zeta Psi basement in 3D, after the reference photos. Everything here
// is laid out in basement meters (basement.ts) and mapped into the game's
// world frame for whichever table is being played, so the whole room — the
// other tables, the pillars and beams, the bar, the stage, the doors — sits
// around the game.

import type { GameConfig, TableDesign, Venue } from '../config';
import { DESIGNS, paintDesign } from './designs';
import { buildFormation } from '../core/formation';
import type { Vec3 } from '../core/physics';
import type { Theme } from '../theme';
import { BAR, BEAMS, BENCH, FIXTURES, FRIDGES, PILLARS, ROOM, ROW_Y, SOFFIT, STAGE, VENUE_ORDER, basementToWorld, tableToBasement, type Paint } from './basement';
import { project, type Camera } from './camera';
import { cylinder, disc, trashCan, floorSpecks, line, poly, screenEllipse, shadeHex, stripe, textBitmap, texturedTop, xbox, type Xf } from './prims';

/** Height where the black painted header band starts on the walls. */
const HEADER_Z = 1.5;
/** Underside of the ceiling beams. */
const BEAM_Z = 1.6;

/** A wall as a 2D surface: along-wall distance t (reading left to right from the room side), height z, pushed `o` meters out into the room. World coordinates out. */
type WallMap = (t: number, z: number, o?: number) => Vec3;

function facesCamera(cam: Camera, m: WallMap, t: number, z: number): boolean {
  const a = m(t, z, 0);
  const n = m(t, z, 1);
  return (cam.eye.x - a.x) * (n.x - a.x) + (cam.eye.y - a.y) * (n.y - a.y) + (cam.eye.z - a.z) * (n.z - a.z) > 0;
}

function wallQuad(m: WallMap, t0: number, t1: number, z0: number, z1: number, out = 0): Vec3[] {
  return [m(t0, z0, out), m(t1, z0, out), m(t1, z1, out), m(t0, z1, out)];
}

/** Paint text onto a wall, fitted (keeping its proportions) and centered in the box t0..t1 by z0..z1. Skipped when the wall faces away. */
function wallText(b: CanvasRenderingContext2D, cam: Camera, m: WallMap, text: string, font: string, fill: string, t0: number, t1: number, z0: number, z1: number, out = 0.004): void {
  if (!facesCamera(cam, m, (t0 + t1) / 2, (z0 + z1) / 2)) return;
  // Skip writing seen almost edge-on or right over the camera: at this resolution it only
  // turns into noise. Writing at a shallow angle fades out instead of popping.
  const view = legibility(cam, m, t0, t1, z0, z1, out);
  if (view <= 0) return;
  const img = textBitmap(text, font, fill, '');
  const aspect = img.width / img.height;
  let w = t1 - t0;
  let h = z1 - z0;
  if (w / h > aspect) w = h * aspect;
  else h = w / aspect;
  const tc = (t0 + t1) / 2;
  const zc = (z0 + z1) / 2;
  const ta = tc - w / 2;
  const za = zc + h / 2;
  // Long writing is drawn in vertical strips, each with its own affine map, so it follows the
  // perspective instead of smearing when seen at a steep angle close up.
  const n = Math.max(1, Math.min(32, Math.ceil(w / 0.25)));
  const sw = img.width / n;
  for (let i = 0; i < n; i++) {
    const a = ta + (i / n) * w;
    const c = ta + ((i + 1) / n) * w;
    const tl = project(cam, m(a, za, out));
    const tr = project(cam, m(c, za, out));
    const bl = project(cam, m(a, za - h, out));
    const br = project(cam, m(c, za - h, out));
    if (!tl || !tr || !bl || !br) continue;
    b.save();
    b.beginPath();
    b.moveTo(tl.x, tl.y);
    b.lineTo(tr.x + (tr.x - tl.x) * 0.1, tr.y + (tr.y - tl.y) * 0.1);
    b.lineTo(br.x + (br.x - bl.x) * 0.1, br.y + (br.y - bl.y) * 0.1);
    b.lineTo(bl.x, bl.y);
    b.closePath();
    b.clip();
    b.setTransform((tr.x - tl.x) / sw, (tr.y - tl.y) / sw, (bl.x - tl.x) / img.height, (bl.y - tl.y) / img.height, tl.x, tl.y);
    const span = Math.min(sw * 1.2, img.width - i * sw);
    b.globalAlpha = view;
    b.drawImage(img, i * sw, 0, span, img.height, 0, 0, span, img.height);
    b.restore();
  }
}

/**
 * 0..1: how readable a patch of wall writing is from the camera. 0 when any
 * part is closer than 1.2 m, or the wall is seen at under ~14 degrees; it
 * ramps to 1 by ~30 degrees.
 */
function legibility(cam: Camera, m: WallMap, t0: number, t1: number, z0: number, z1: number, out: number): number {
  let near = Infinity;
  for (const [t, z] of [
    [t0, z0],
    [t1, z0],
    [t0, z1],
    [t1, z1],
  ]) {
    const p = m(t, z, out);
    near = Math.min(near, (p.x - cam.eye.x) * cam.f.x + (p.y - cam.eye.y) * cam.f.y + (p.z - cam.eye.z) * cam.f.z);
  }
  if (near < 1.2) return 0;
  const c = m((t0 + t1) / 2, (z0 + z1) / 2, out);
  const n = m((t0 + t1) / 2, (z0 + z1) / 2, out + 1);
  const nx = n.x - c.x;
  const ny = n.y - c.y;
  const nz = n.z - c.z;
  const dx = cam.eye.x - c.x;
  const dy = cam.eye.y - c.y;
  const dz = cam.eye.z - c.z;
  const cos = (nx * dx + ny * dy + nz * dz) / (Math.hypot(nx, ny, nz) * Math.hypot(dx, dy, dz) || 1);
  return Math.max(0, Math.min(1, (cos - 0.24) / 0.26));
}

function wallShape(b: CanvasRenderingContext2D, cam: Camera, m: WallMap, pts: [number, number][], fill: string, out = 0.006): void {
  if (!facesCamera(cam, m, pts[0][0], pts[0][1])) return;
  poly(b, cam, pts.map(([t, z]) => m(t, z, out)), fill);
}

function rectPts(t0: number, t1: number, z0: number, z1: number): [number, number][] {
  return [[t0, z0], [t1, z0], [t1, z1], [t0, z1]];
}

function circlePts(t: number, z: number, r: number, n = 18, a0 = 0): [number, number][] {
  return Array.from({ length: n }, (_, i) => [t + Math.cos(a0 + (i / n) * Math.PI * 2) * r, z + Math.sin(a0 + (i / n) * Math.PI * 2) * r] as [number, number]);
}

/** A sign: dark edge, white (or colored) plate, black (or given) lettering. */
function sign(b: CanvasRenderingContext2D, theme: Theme, cam: Camera, m: WallMap, text: string, t0: number, t1: number, z0: number, z1: number, plate?: string, ink?: string, font = 'bold 18px sans-serif'): void {
  const R = theme.room;
  wallShape(b, cam, m, rectPts(t0, t1, z0, z1), R.signEdge);
  wallShape(b, cam, m, rectPts(t0 + 0.02, t1 - 0.02, z0 + 0.02, z1 - 0.02), plate ?? R.signWhite, 0.007);
  wallText(b, cam, m, text, font, ink ?? R.signInk, t0 + 0.04, t1 - 0.04, z0 + 0.03, z1 - 0.03, 0.008);
}

function paint(theme: Theme, p: Paint): string {
  return theme.room[p.color];
}

// ------------------------------------------------------------------ room

/** Draw the whole basement around the table `venue` (every table but that one is drawn here too). */
/**
 * The design of a background table at spot `spot` while the game is played at
 * `playSpot` on `design`. Each spot normally has its own table; if that is the
 * table being played on, the two swap, so no table shows twice.
 */
export function backgroundDesign(spot: Venue, playSpot: Venue, design: TableDesign): TableDesign {
  return spot === design ? playSpot : spot;
}

export function drawBasement(b: CanvasRenderingContext2D, theme: Theme, cfg: GameConfig, cam: Camera, venue: Venue): void {
  const R = theme.room;
  const xf = basementToWorld(cfg, venue);
  const { x0, x1, y0, y1, ceilZ } = ROOM;
  const floorZ = -cfg.physics.tableHeight;
  const bpoly = (pts: Vec3[], fill: string) => poly(b, cam, pts.map(xf), fill);
  const plane = (ax: number, ay: number, bx: number, by: number, z: number, fill: string) =>
    bpoly([{ x: ax, y: ay, z }, { x: bx, y: ay, z }, { x: bx, y: by, z }, { x: ax, y: by, z }], fill);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // Ceiling: sooty black with paler water stains, and the red-painted bit by the bathroom.
  plane(x0, y0, x1, y1, ceilZ, R.ceiling);
  plane(x0, y0, 3.9, 1.6, ceilZ - 0.001, R.ceilingRed);
  for (let i = 0; i < 46; i++) disc(b, cam, xf({ x: x0 + rnd() * (x1 - x0), y: y0 + rnd() * (y1 - y0), z: ceilZ - 0.002 }), 0.2 + rnd() * 0.6, R.ceilingStain, 10);

  // Floor: rust-red stained concrete, patchy, with worn and wet spots.
  plane(x0, y0, x1, y1, floorZ, R.floor);
  const patch = [R.floorDark, R.floorLight, R.floorWorn, R.floorWet];
  for (let i = 0; i < 260; i++) disc(b, cam, xf({ x: x0 + rnd() * (x1 - x0), y: y0 + rnd() * (y1 - y0), z: floorZ + 0.0005 }), 0.06 + rnd() * rnd() * 0.45, patch[i % 4], 10);
  for (const sp of floorSpecks(x0, x1, y0, y1)) {
    const p = project(cam, xf({ x: sp.x, y: sp.y, z: floorZ }));
    if (!p) continue;
    b.fillStyle = sp.light ? R.floorSpeck : R.floorDark;
    b.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
  }
  // Light washes under the tubes, and a shadow under every table.
  for (const fx of FIXTURES) {
    const p = project(cam, xf({ x: fx.x, y: fx.y, z: floorZ }));
    if (!p) continue;
    const r = p.scale * 1.3;
    const gr = b.createRadialGradient(p.x, p.y, 1, p.x, p.y, r);
    gr.addColorStop(0, R.floorGlow);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = gr;
    b.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  }
  const { length: L, width: W } = cfg.table;
  for (const v of VENUE_ORDER) {
    const t = tableToBasement(cfg, v);
    bpoly([t({ x: -0.05, y: -0.08, z: floorZ + 0.001 }), t({ x: L + 0.05, y: -0.08, z: floorZ + 0.001 }), t({ x: L + 0.05, y: W + 0.08, z: floorZ + 0.001 }), t({ x: -0.05, y: W + 0.08, z: floorZ + 0.001 })], R.tableShadow);
  }

  // Walls, each mapped so its writing reads left to right from inside the room:
  // the stage wall (y0), the bench wall (y1), the bar wall (x0) and the door wall (x1).
  // Anything above the panelling sits on the face of the black soffit box that runs along the wall tops.
  const up = (z: number, o: number) => (z > HEADER_Z + 1e-6 ? o + SOFFIT : o);
  const stageWall: WallMap = (t, z, o = 0) => xf({ x: x0 + t, y: y0 + up(z, o), z });
  const benchWall: WallMap = (t, z, o = 0) => xf({ x: x1 - t, y: y1 - up(z, o), z });
  const barWall: WallMap = (t, z, o = 0) => xf({ x: x0 + up(z, o), y: y1 - t, z });
  const doorWall: WallMap = (t, z, o = 0) => xf({ x: x1 - up(z, o), y: y0 + t, z });
  const lenX = x1 - x0;
  const lenY = y1 - y0;
  for (const [m, len] of [
    [stageWall, lenX],
    [benchWall, lenX],
    [barWall, lenY],
    [doorWall, lenY],
  ] as const)
    drawPaneledWall(b, theme, cam, m, len, floorZ, ceilZ, rnd);
  drawWallDressing(b, theme, cam, { stageWall, benchWall, barWall, doorWall }, floorZ, ceilZ);

  // The two-tier bench (a low seat, a shelf above) along the whole bench wall and round the door corner.
  const B = BENCH;
  const seat = (ax: number, ay: number, bx: number, by: number) => {
    xbox(b, cam, xf, ax, ay, floorZ, bx, by, floorZ + B.seatZ - 0.05, R.benchFront, R.benchFront, R.benchFront);
    xbox(b, cam, xf, ax - 0.02, ay - 0.02, floorZ + B.seatZ - 0.05, bx + 0.02, by + 0.02, floorZ + B.seatZ, R.benchTop, R.bench, R.bench);
  };
  const shelf = (ax: number, ay: number, bx: number, by: number) => xbox(b, cam, xf, ax, ay, floorZ + B.shelfZ, bx, by, floorZ + B.shelfZ + 0.05, R.benchTop, R.bench, R.bench);
  const corner = y1 - 2.3;
  shelf(x0, y1 - B.shelfDepth, x1, y1);
  shelf(x1 - B.shelfDepth, corner, x1, y1 - B.shelfDepth);
  seat(x0, y1 - B.seatDepth, x1, y1);
  seat(x1 - B.seatDepth, corner, x1, y1 - B.seatDepth);
  // Particle board and black panels along the seat front.
  for (let t = 0, k = 0; t < x1 - x0; t += 1.35, k++)
    wallShape(b, cam, benchWall, rectPts(t + 0.02, Math.min(x1 - x0, t + 1.33), floorZ + 0.02, floorZ + B.seatZ - 0.08), k % 3 === 1 ? R.benchFront : R.osb, B.seatDepth + 0.004);
  wallText(b, cam, benchWall, "XENON \u201919", 'bold 16px sans-serif', R.scratch, x1 - 2.9, x1 - 2.2, floorZ + 0.12, floorZ + 0.3, B.seatDepth + 0.006);
  // On the seat: tombstones. On the shelf: cups, a jug, a paper towel roll, a caution sign.
  [
    [6.35, 'HERE LIES\nD. CAMPOS', 1],
    [7.55, 'RIP', 0.9],
    [7.85, 'RIP', 1.25],
    [8.12, 'RIP', 0.8],
  ].forEach(([x, label, k]) => drawTombstone(b, theme, cam, benchWall, x1 - (x as number), floorZ + B.seatZ, label as string, k as number));
  const glass = { light: R.glassStack, mid: R.glassStack, dark: R.glassStackDark };
  for (const [a, c2] of [
    [1.0, 2.1],
    [5.0, 6.3],
    [7.3, 7.9],
  ])
    for (let x = a; x <= c2; x += 0.13) cylinder(b, cam, xf({ x, y: y1 - 0.12, z: 0 }), 0.035, floorZ + B.shelfZ + 0.05, floorZ + B.shelfZ + 0.15, glass, false);
  cylinder(b, cam, xf({ x: 2.45, y: y1 - 0.13, z: 0 }), 0.07, floorZ + B.shelfZ + 0.05, floorZ + B.shelfZ + 0.33, { light: R.paper, mid: R.paper, dark: R.fridgeDark }, false);
  cylinder(b, cam, xf({ x: 4.85, y: y1 - 0.13, z: 0 }), 0.06, floorZ + B.shelfZ + 0.05, floorZ + B.shelfZ + 0.3, { light: R.paper, mid: R.jugMilk, dark: R.fridgeDark }, false);
  drawCaution(b, theme, cam, benchWall, x1 - 8.75, floorZ + B.shelfZ + 0.05, 0.13);

  // Things standing in the room, far to near.
  const depth = (p: Vec3) => {
    const w = xf(p);
    return (w.x - cam.eye.x) * cam.f.x + (w.y - cam.eye.y) * cam.f.y + (w.z - cam.eye.z) * cam.f.z;
  };
  const things: { d: number; draw: () => void }[] = [];
  for (const pl of PILLARS) things.push({ d: depth({ x: pl.x, y: pl.y, z: 0 }), draw: () => drawPillar(b, theme, cam, xf, pl, floorZ) });
  for (const v of VENUE_ORDER) {
    if (v === venue) continue;
    const t = tableToBasement(cfg, v);
    const place: Xf = (p) => xf(t(p));
    const bg = backgroundDesign(v, venue, cfg.design);
    things.push({ d: depth(t({ x: L / 2, y: W / 2, z: 0 })), draw: () => drawTableAt(b, theme, cfg, cam, v, place, true, bg) });
  }
  // The fridges stand behind the bar counter, so they always go first.
  things.push({ d: depth({ x: 0.3, y: ROW_Y, z: 0 }) + 50, draw: () => FRIDGES.forEach((f) => xbox(b, cam, xf, f.x0, f.y0, floorZ, f.x1, f.y1, floorZ + f.h, R.fridgeTop, R.fridge, R.fridgeDark)) });
  things.push({ d: depth({ x: BAR.x1, y: ROW_Y, z: 0 }), draw: () => drawBar(b, theme, cam, xf, floorZ) });
  things.push({ d: depth({ x: (STAGE.x0 + STAGE.x1) / 2, y: STAGE.y0, z: 0 }) + 50, draw: () => drawStage(b, theme, cam, xf, floorZ) });
  things.push({ d: depth({ x: 8.1, y: 0.4, z: 0 }), draw: () => drawChair(b, theme, cam, xf, 7.9, 0.12, floorZ) });
  // The gray trash can by the exit stairs.
  things.push({ d: depth({ x: 1.75, y: 0.45, z: 0 }), draw: () => cylinder(b, cam, xf({ x: 1.75, y: 0.45, z: 0 }), 0.25, floorZ, floorZ + 0.8, { light: R.binLight, mid: R.bin, dark: R.binDark }) });
  things.sort((a, c) => c.d - a.d).forEach((t) => t.draw());

  // Ceiling: the tube fixtures, then the beams (far to near).
  for (const fx of FIXTURES) drawFixture(b, theme, cam, xf, fx.x, fx.y, ceilZ, fx.axis);
  BEAMS.map((bm) => {
    const mid = (bm.from + bm.to) / 2;
    return { bm, d: depth(bm.axis === 'x' ? { x: mid, y: bm.at, z: ceilZ } : { x: bm.at, y: mid, z: ceilZ }) };
  })
    .sort((a, c) => c.d - a.d)
    .forEach(({ bm }) => drawBeam(b, theme, cam, xf, bm, ceilZ));
}

function drawPaneledWall(b: CanvasRenderingContext2D, theme: Theme, cam: Camera, m: WallMap, len: number, floorZ: number, ceilZ: number, rnd: () => number): void {
  const R = theme.room;
  poly(b, cam, wallQuad(m, 0, len, floorZ, HEADER_Z), R.wall);
  const rows: [number, number][] = [
    [floorZ + 0.5, floorZ + 0.95],
    [floorZ + 1.02, HEADER_Z - 0.1],
  ];
  const step = 0.62;
  for (let t = 0.04; t + step <= len + 0.01; t += step) {
    for (const [z0, z1] of rows) {
      poly(b, cam, wallQuad(m, t + 0.05, t + step - 0.05, z0, z1, 0.002), R.panel);
      line(b, cam, m(t + 0.05, z1, 0.003), m(t + step - 0.05, z1, 0.003), R.panelShade);
      line(b, cam, m(t + 0.05, z0, 0.003), m(t + step - 0.05, z0, 0.003), R.panelLight);
    }
  }
  poly(b, cam, wallQuad(m, 0, len, HEADER_Z - 0.06, HEADER_Z, 0.003), R.rail);
  // Names scratched into the wood.
  for (let k = 0; k < len * 4; k++) {
    const t = rnd() * (len - 0.4);
    const z = floorZ + 1.05 + rnd() * (HEADER_Z - floorZ - 1.25);
    const w = 0.08 + rnd() * 0.22;
    const tilt = (rnd() - 0.5) * 0.03;
    line(b, cam, m(t, z, 0.004), m(t + w, z + tilt, 0.004), rnd() < 0.8 ? R.scratch : R.scratchColor);
    if (rnd() < 0.5) line(b, cam, m(t + 0.02, z - 0.035, 0.004), m(t + w * 0.7, z - 0.035 + tilt, 0.004), R.scratch);
  }
  // The black soffit box along the top of the wall (m pushes anything above HEADER_Z onto its face).
  poly(b, cam, wallQuad(m, 0, len, HEADER_Z + 0.0001, ceilZ, 0), R.header);
  line(b, cam, m(0, HEADER_Z + 0.0001, 0.001), m(len, HEADER_Z + 0.0001, 0.001), R.headerEdge);
  void rnd;
}

/**
 * Signs, slogans, doors and windows on the four walls, placed from the
 * reference photos. t runs along each wall in its reading direction:
 * - stage wall: from the bar end (t = x);
 * - bench wall: from the door end (t = x1 - x);
 * - bar wall: from the bench side (t = y1 - y);
 * - door wall: from the stage side (t = y).
 * Header writing sits on the soffit face (the wall maps put anything above
 * HEADER_Z there).
 */
function drawWallDressing(b: CanvasRenderingContext2D, theme: Theme, cam: Camera, w: Record<'stageWall' | 'benchWall' | 'barWall' | 'doorWall', WallMap>, floorZ: number, ceilZ: number): void {
  const R = theme.room;
  const { stageWall: S, benchWall: N, barWall: B, doorWall: D } = w;
  const { x1, y1 } = ROOM;
  // Writing sits on the lower part of the soffit, where the table cameras see it below the HUD.
  const h0 = HEADER_Z + 0.03;
  const h1 = HEADER_Z + 0.3;
  const hand = 'bold 20px sans-serif';
  const serif = 'bold 22px serif';
  const small = 'bold 14px sans-serif';
  const tN = (x: number) => x1 - x;
  const tB = (y: number) => y1 - y;
  const floorTop = (z: number) => floorZ + z; // heights given from the floor

  // ---------------------------------------------------------- bar wall
  // Orange corner on the bench side with the FARGO '23 door; KCAO painted beside it.
  wallShape(b, cam, B, rectPts(0, tB(7.5), floorZ, ceilZ), R.accentRed, 0.003);
  drawDoor(b, theme, cam, B, 0.4, 1.15, floorZ);
  wallText(b, cam, B, "FARGO ’23", small, R.scratch, 0.4, 1.15, floorTop(2.08), floorTop(2.18), 0.008);
  wallText(b, cam, B, 'Buzz\nBuzz', small, R.signInk, 1.25, 1.65, floorTop(1.7), floorTop(2.0), 0.008);
  wallText(b, cam, B, 'KCAO', 'bold 26px sans-serif', R.paintBlue, tB(7.4), tB(6.75), floorTop(0.6), floorTop(1.1));
  wallText(b, cam, B, 'ZETA PSI. YOU DO YOU.', hand, R.paintWhite, tB(7.4), tB(6.55), h0 + 0.05, h1);
  wallText(b, cam, B, 'Bird:', small, R.paintGold, tB(7.35), tB(7.05), h0, h0 + 0.06);
  wallShape(b, cam, B, rectPts(tB(6.75), tB(6.5), floorTop(1.6), floorTop(1.95)), R.header, 0.005);
  wallText(b, cam, B, 'BOO!', 'bold 20px sans-serif', R.paintGreen, tB(6.75), tB(6.5), floorTop(1.65), floorTop(1.9), 0.007);
  // The counter opening with the arch over it, the fridges behind (drawn with the bar).
  wallShape(b, cam, B, rectPts(tB(ROW_Y + 1.5), tB(ROW_Y - 1.5), floorZ + 0.2, 1.3), R.barAlcove, 0.004);
  wallShape(b, cam, B, Array.from({ length: 13 }, (_, i) => [tB(ROW_Y) + Math.cos((i / 12) * Math.PI) * 1.5, 1.3 + Math.sin((i / 12) * Math.PI) * 0.18] as [number, number]), R.barAlcove, 0.004);
  wallText(b, cam, B, 'Now Serving\nFrankenstein Family Ale', serif, R.paintGold, tB(ROW_Y + 1.6), tB(ROW_Y - 1.6), h0 - 0.02, h1);
  wallText(b, cam, B, "WE'LL OBSERVE", hand, R.paintWhite, tB(ROW_Y - 1.9), tB(0.3), h0 + 0.1, h1);
  sign(b, theme, cam, B, 'Class of 1981\nBasement', tB(ROW_Y - 1.65), tB(ROW_Y - 2.05), 0.85, 1.05, R.plaque, R.paintGold, 'bold 14px serif');

  // -------------------------------------------------------- stage wall
  // Bar end: red walls and soffit, DON'T BREAK THE CHAIN, the EXIT stairs, a door with an arrow.
  wallShape(b, cam, S, rectPts(0, 1.45, floorZ, HEADER_Z), R.accentRed, 0.003);
  wallShape(b, cam, S, rectPts(0, 3.95, HEADER_Z + 0.01, ceilZ), R.accentRed, 0.003);
  wallText(b, cam, S, "DON'T BREAK THE CHAIN", hand, R.paintWhite, 0.4, 3.6, h0 + 0.04, h1 - 0.02);
  wallShape(b, cam, S, rectPts(0.3, 1.25, floorZ, floorTop(2.05)), R.stairs, 0.005);
  for (let k = 0; k < 6; k++) wallShape(b, cam, S, rectPts(0.33, 1.22, floorTop(0.15 + k * 0.3), floorTop(0.17 + k * 0.3)), R.stairEdge, 0.006);
  sign(b, theme, cam, S, 'EXIT', 0.55, 1.0, HEADER_Z - 0.2, HEADER_Z - 0.06, R.exitRed, R.signWhite, 'bold 14px sans-serif');
  drawDoor(b, theme, cam, S, 1.75, 2.5, floorZ);
  wallShape(b, cam, S, [[2.7, 1.05], [2.95, 1.05], [2.95, 1.0], [3.1, 1.1], [2.95, 1.2], [2.95, 1.15], [2.7, 1.15]], R.paintOrange, 0.006);
  wallText(b, cam, S, "TIMES NOT WASTED\nWHEN YOU'RE WASTED", small, R.paintWhite, 2.9, 3.95, 0.4, 0.75);
  // The stage, behind the saints table: lights on a 2x4 over STEP YOUR LEVELS UP, the 74, the letters.
  const sx0 = STAGE.x0 + 0.05;
  const sx1 = STAGE.x1 - 0.05;
  wallText(b, cam, S, 'STEP YOUR LEVELS UP', 'bold 26px sans-serif', R.paintPink, sx0, sx1, h0 + 0.11, h1 + 0.04);
  wallText(b, cam, S, 'WHY ARE WE WAITING?!', small, R.paintOrange, sx0, sx0 + 0.95, h0, h0 + 0.09);
  wallText(b, cam, S, 'Is this going to be in my Supreme Court Hearing?', 'bold 18px sans-serif', R.paintBlue, sx0 + 1.0, sx1, h0, h0 + 0.1);
  wallShape(b, cam, S, rectPts(sx0, sx1, HEADER_Z + 0.42, HEADER_Z + 0.47), R.twoByFour, 0.03);
  for (const t of [sx0 + 0.45, sx1 - 0.45]) {
    wallShape(b, cam, S, circlePts(t, HEADER_Z + 0.33, 0.09, 14), R.ledHousing, 0.05);
    wallShape(b, cam, S, circlePts(t, HEADER_Z + 0.33, 0.065, 14), R.ledLight, 0.055);
  }
  wallShape(b, cam, S, rectPts((sx0 + sx1) / 2 - 0.18, (sx0 + sx1) / 2 + 0.18, HEADER_Z + 0.25, HEADER_Z + 0.41), R.ledHousing, 0.05);
  wallShape(b, cam, S, rectPts((sx0 + sx1) / 2 - 0.15, (sx0 + sx1) / 2 + 0.15, HEADER_Z + 0.27, HEADER_Z + 0.39), R.ledLight, 0.055);
  const cx = (STAGE.x0 + STAGE.x1) / 2;
  wallText(b, cam, S, 'DAVID ’25\n♥ ALYSSA', small, R.paintWhite, cx - 1.1, cx - 0.55, 0.85, 1.2);
  wallShape(b, cam, S, rectPts(cx - 0.5, cx - 0.06, 0.8, 1.27), R.signEdge);
  wallShape(b, cam, S, circlePts(cx - 0.28, 1.035, 0.2, 22), R.signWhite, 0.007);
  wallText(b, cam, S, '74', 'bold 28px sans-serif', R.signInk, cx - 0.45, cx - 0.11, 0.92, 1.15, 0.008);
  wallText(b, cam, S, 'Ζ  Ψ', 'bold 28px serif', R.letters, cx, cx + 0.6, 1.02, 1.3);
  wallShape(b, cam, S, rectPts(cx + 0.65, cx + 0.95, 0.98, 1.1), R.signWhite, 0.006);
  wallText(b, cam, S, '221 AFC', 'bold 12px sans-serif', R.signInk, cx + 0.67, cx + 0.93, 0.99, 1.09, 0.008);
  wallText(b, cam, S, 'ITS KCAO\nA WORLD', hand, R.paintBlue, cx - 1.15, cx - 0.4, 0.42, 0.78);
  sign(b, theme, cam, S, 'SENIOR\nPROJECT\nMANAGER', cx + 0.15, cx + 0.6, 0.42, 0.88);
  wallText(b, cam, S, 'DUCHESS\nWAS HERE', small, R.scratch, cx + 0.7, cx + 1.15, 1.0, 1.25);
  wallShape(b, cam, S, circlePts(STAGE.x1 + 0.3, 1.0, 0.27, 8, Math.PI / 8), R.signWhite);
  wallShape(b, cam, S, circlePts(STAGE.x1 + 0.3, 1.0, 0.24, 8, Math.PI / 8), R.stopFaded, 0.007);
  wallText(b, cam, S, 'STOP', 'bold 22px sans-serif', R.signWhite, STAGE.x1 + 0.12, STAGE.x1 + 0.48, 0.91, 1.09, 0.008);
  // Door end: the creed along the soffit, the bathroom, a chair, SHUDDUP CHIP.
  wallText(b, cam, S, 'Conquer evil with swift & terrible justice. Treat all innocents with utmost respect', 'bold 16px sans-serif', R.paintGold, 7.25, x1 - 0.1, h0, h0 + 0.12);
  wallShape(b, cam, S, rectPts(7.35, 8.55, floorTop(1.65), floorTop(2.15)), R.header, 0.004);
  wallText(b, cam, S, 'SHUDDUP\nCHIP', small, R.paintWhite, 7.4, 7.95, floorTop(1.75), floorTop(2.12), 0.006);
  wallText(b, cam, S, "He's not a herb, he's my homie.", small, R.paintGold, 7.4, 8.55, floorTop(1.66), floorTop(1.74), 0.006);
  wallText(b, cam, S, "MOXXI\nDEXTER ’19", small, R.scratch, 8.0, 8.6, 0.25, 0.7);
  drawDoor(b, theme, cam, S, 8.8, 9.6, floorZ);
  sign(b, theme, cam, S, 'RESTROOM', 8.95, 9.45, 1.0, 1.12, R.restroomBlue, R.signWhite, 'bold 12px sans-serif');

  // -------------------------------------------------------- bench wall
  // Night sky end: QUARTER MILE RD, the windows, BROFESSOR '21; a header about the kitchen.
  wallText(b, cam, N, "It's raining in the kitchen", small, R.paintWhite, tN(10.1), tN(7.6), h0, h0 + 0.1);
  sign(b, theme, cam, N, 'QUARTER MILE RD', tN(10.3), tN(9.65), 1.02, 1.13, R.streetGreen, R.signWhite, 'bold 14px sans-serif');
  for (const x of [9.25, 8.35]) {
    wallShape(b, cam, N, rectPts(tN(x + 0.4), tN(x - 0.4), 0.55, 1.35), R.windowFrame, 0.006);
    wallShape(b, cam, N, rectPts(tN(x + 0.35), tN(x - 0.35), 0.6, 1.3), R.window, 0.008);
  }
  wallText(b, cam, N, "BROFESSOR ’21", small, R.scratch, tN(8.6), tN(7.9), 0.33, 0.48);
  // Saints: Brothers should be nicer to other brothers, BM, LEFT TURN YIELD, the Diabetes Dash poster.
  wallText(b, cam, N, 'Brothers should be nicer to other brothers', hand, R.paintGold, tN(6.85), tN(4.4), h0, h0 + 0.13);
  wallText(b, cam, N, 'BM', 'bold 26px sans-serif', R.paintGreen, tN(5.25), tN(4.75), h0 + 0.12, h1 + 0.04);
  sign(b, theme, cam, N, 'LEFT TURN\nYIELD\nON GREEN', tN(5.75), tN(5.25), 0.45, 1.15);
  wallShape(b, cam, N, circlePts(tN(5.5), 0.54, 0.05), R.smiley, 0.009);
  sign(b, theme, cam, N, 'DARTMOUTH\nDIABETES\nDASH', tN(6.35), tN(6.05), 0.6, 1.02, R.paper, R.signInk, 'bold 14px sans-serif');
  wallText(b, cam, N, "TURK '18\nI AM GROOT", small, R.scratch, tN(6.95), tN(6.45), 0.9, 1.15);
  // Chain: SCRAPPY over Love loves to love love, Do you wanna hear a secret, ONE WAY, JAFE.
  wallText(b, cam, N, 'SCRAPPY', small, R.paintGold, tN(3.3), tN(2.75), h0 + 0.15, h1);
  wallText(b, cam, N, 'Love loves to love love.', 'bold 20px serif', R.paintGold, tN(3.75), tN(2.2), h0, h0 + 0.14);
  wallText(b, cam, N, 'Do you wanna hear a secret?', hand, R.paintGreen, tN(2.05), tN(0.35), h0, h1);
  wallShape(b, cam, N, rectPts(tN(3.6), tN(2.85), 1.0, 1.2), R.signEdge);
  wallShape(b, cam, N, rectPts(tN(3.58), tN(2.87), 1.02, 1.18), R.signWhite, 0.007);
  wallShape(b, cam, N, [[tN(3.5), 1.08], [tN(3.05), 1.08], [tN(3.05), 1.05], [tN(2.92), 1.1], [tN(3.05), 1.15], [tN(3.05), 1.12], [tN(3.5), 1.12]], R.signInk, 0.008);
  wallText(b, cam, N, 'ONE WAY', 'bold 12px sans-serif', R.signWhite, tN(3.48), tN(3.08), 1.085, 1.115, 0.009);
  wallText(b, cam, N, 'COCO', small, R.scratch, tN(2.55), tN(2.2), 1.15, 1.25);
  wallText(b, cam, N, 'JAFE', 'bold 26px sans-serif', R.paintBlue, tN(2.6), tN(1.95), 0.85, 1.12);
  wallText(b, cam, N, "ROBICHEAUX '14\nPUCK '12", small, R.scratch, tN(1.85), tN(1.2), 0.95, 1.2);
  wallText(b, cam, N, "Vincent van Brogh '17", small, R.scratch, tN(3.0), tN(2.3), 0.45, 0.55);

  // --------------------------------------------------------- door wall
  wallText(b, cam, D, '& dignity. Honor your brotherhood with all your actions. And fight as though immortal, for history will make you so.', 'bold 16px sans-serif', R.paintGold, 0.4, y1 - 0.5, h0, h0 + 0.12);
  wallShape(b, cam, D, rectPts(4.55, 5.45, floorZ, floorTop(2.1)), R.exitRed, 0.003);
  drawDoor(b, theme, cam, D, 4.6, 5.4, floorZ, true);
  sign(b, theme, cam, D, 'WHILE SHOWERING\nSHRED', 5.8, 6.6, 0.95, 1.25, R.paper, R.streetGreen, 'bold 14px sans-serif');
  wallText(b, cam, D, '8', 'bold 30px sans-serif', R.paintBlue, 6.95, 7.2, 0.35, 0.8);
  wallText(b, cam, D, 'CLAY DG', 'bold 26px sans-serif', R.paintBlue, 7.25, 8.5, 0.35, 0.75);
}

function drawDoor(b: CanvasRenderingContext2D, theme: Theme, cam: Camera, m: WallMap, t0: number, t1: number, floorZ: number, pushBar = false): void {
  const R = theme.room;
  const top = floorZ + 2.0;
  wallShape(b, cam, m, rectPts(t0 - 0.05, t1 + 0.05, floorZ, top + 0.05), R.doorFrame, 0.004);
  wallShape(b, cam, m, rectPts(t0, t1, floorZ, top), R.door, 0.006);
  wallShape(b, cam, m, rectPts(t0 + 0.06, t1 - 0.06, floorZ + 0.1, top - 0.1), R.doorPanel, 0.007);
  if (pushBar) wallShape(b, cam, m, rectPts(t0 + 0.08, t1 - 0.08, floorZ + 0.95, floorZ + 1.0), R.signInk, 0.009);
  else wallShape(b, cam, m, circlePts(t1 - 0.1, floorZ + 0.95, 0.025, 8), R.ledLight, 0.009);
}

function drawTombstone(b: CanvasRenderingContext2D, theme: Theme, cam: Camera, m: WallMap, t: number, z: number, label: string, k = 1): void {
  const R = theme.room;
  const w = 0.13 * k;
  const h = 0.34 * k;
  const out = 0.28;
  const pts: [number, number][] = [[t - w, z], [t + w, z]];
  for (let i = 0; i <= 8; i++) pts.push([t + Math.cos((i / 8) * Math.PI) * w, z + h - w + Math.sin((i / 8) * Math.PI) * w]);
  wallShape(b, cam, m, pts, R.stoneDark, out);
  wallShape(b, cam, m, pts.map(([a, c]) => [t + (a - t) * 0.88, z + (c - z) * 0.94]), R.stone, out + 0.002);
  wallText(b, cam, m, label, 'bold 16px serif', R.stoneDark, t - w * 0.7, t + w * 0.7, z + h * 0.3, z + h * 0.62, out + 0.004);
}

function drawCaution(b: CanvasRenderingContext2D, theme: Theme, cam: Camera, m: WallMap, t: number, z: number, out: number): void {
  const R = theme.room;
  wallShape(b, cam, m, [[t - 0.15, z], [t + 0.15, z], [t + 0.09, z + 0.6], [t - 0.09, z + 0.6]], R.caution, out);
  wallShape(b, cam, m, [[t - 0.09, z + 0.6], [t + 0.09, z + 0.6], [t + 0.07, z + 0.64], [t - 0.07, z + 0.64]], R.cautionDark, out);
  wallText(b, cam, m, 'CAUTION\nWET\nFLOOR', 'bold 14px sans-serif', R.signInk, t - 0.1, t + 0.1, z + 0.28, z + 0.52, out + 0.004);
}

/**
 * A square pillar: stained wood (with a molded cap, an inset panel and names
 * carved in) up to about head height, black painted above. Each face can have
 * a slogan, a round light fitting on a tan patch, and carvings.
 */
function drawPillar(b: CanvasRenderingContext2D, theme: Theme, cam: Camera, xf: Xf, pl: (typeof PILLARS)[number], floorZ: number): void {
  const R = theme.room;
  const s = pl.size ?? 0.18;
  const mid = 0.85;
  xbox(b, cam, xf, pl.x - s, pl.y - s, floorZ, pl.x + s, pl.y + s, mid - 0.06, R.pillarTop, R.pillarWood, R.pillarWoodLit);
  xbox(b, cam, xf, pl.x - s - 0.025, pl.y - s - 0.025, mid - 0.06, pl.x + s + 0.025, pl.y + s + 0.025, mid, R.pillarTop, R.pillarCap, R.pillarCap);
  xbox(b, cam, xf, pl.x - s - 0.01, pl.y - s - 0.01, mid, pl.x + s + 0.01, pl.y + s + 0.01, BEAM_Z, R.header, R.header, R.headerLit);
  // Faces in basement terms: -x, +x, -y, +y; each WallMap reads left to right for someone facing that side.
  const o = s + 0.012;
  const faces: WallMap[] = [
    (t, z, k = 0) => xf({ x: pl.x - o - k, y: pl.y - s + t, z }),
    (t, z, k = 0) => xf({ x: pl.x + o + k, y: pl.y + s - t, z }),
    (t, z, k = 0) => xf({ x: pl.x + s - t, y: pl.y - o - k, z }),
    (t, z, k = 0) => xf({ x: pl.x - s + t, y: pl.y + o + k, z }),
  ];
  const W = 2 * s;
  faces.forEach((m, i) => {
    if (!facesCamera(cam, m, s, mid)) return;
    const f = pl.faces[i] ?? {};
    poly(b, cam, wallQuad(m, 0.05, W - 0.05, floorZ + 0.1, mid - 0.14, 0.002), R.pillarPanel);
    if (f.carved) wallText(b, cam, m, f.carved, 'bold 14px sans-serif', R.scratch, 0.07, W - 0.07, floorZ + 0.75, mid - 0.2, 0.004);
    // The slogan fills the black top; a light fitting takes its upper part.
    let top = BEAM_Z - 0.06;
    if (f.light) {
      const lc = BEAM_Z - 0.28;
      wallShape(b, cam, m, rectPts(s - 0.13, s + 0.13, lc - 0.13, lc + 0.13), R.lightPatch, 0.004);
      wallShape(b, cam, m, circlePts(s, lc, 0.08, 14), R.lightRing, 0.006);
      wallShape(b, cam, m, circlePts(s, lc, 0.055, 14), R.ledLight, 0.008);
      top = lc - 0.16;
    }
    const p = f.paint;
    if (!p) return;
    if (p.plate) wallShape(b, cam, m, rectPts(0.05, W - 0.05, mid + 0.08, top), R.paper, 0.004);
    wallText(b, cam, m, p.text, p.font ?? 'bold 18px sans-serif', paint(theme, p), 0.04, W - 0.04, mid + 0.08, top, 0.006);
  });
}

/** A black ceiling beam with slogans spread along both long sides. */
function drawBeam(b: CanvasRenderingContext2D, theme: Theme, cam: Camera, xf: Xf, bm: (typeof BEAMS)[number], ceilZ: number): void {
  const R = theme.room;
  const hw = 0.18;
  const len = bm.to - bm.from;
  if (bm.axis === 'x') xbox(b, cam, xf, bm.from, bm.at - hw, BEAM_Z, bm.to, bm.at + hw, ceilZ, R.header, R.header, R.headerLit);
  else xbox(b, cam, xf, bm.at - hw, bm.from, BEAM_Z, bm.at + hw, bm.to, ceilZ, R.header, R.headerLit, R.header);
  // Side 0 is the south (or west) face, side 1 the north (or east) face.
  const sides: WallMap[] =
    bm.axis === 'x'
      ? [(t, z, k = 0) => xf({ x: bm.to - t, y: bm.at - hw - k, z }), (t, z, k = 0) => xf({ x: bm.from + t, y: bm.at + hw + k, z })]
      : [(t, z, k = 0) => xf({ x: bm.at - hw - k, y: bm.from + t, z }), (t, z, k = 0) => xf({ x: bm.at + hw + k, y: bm.to - t, z })];
  sides.forEach((m, i) => {
    const list = bm.sides[i];
    const slot = len / list.length;
    list.forEach((p, k) => wallText(b, cam, m, p.text, p.font ?? 'bold 20px sans-serif', paint(theme, p), k * slot + 0.2, (k + 1) * slot - 0.2, BEAM_Z + 0.04, ceilZ - 0.04, 0.004));
  });
}

function drawFixture(b: CanvasRenderingContext2D, theme: Theme, cam: Camera, xf: Xf, x: number, y: number, ceilZ: number, axis: 'x' | 'y' = 'x'): void {
  const R = theme.room;
  const hx = axis === 'x' ? 0.6 : 0.14;
  const hy = axis === 'x' ? 0.14 : 0.6;
  const z0 = ceilZ - 0.07;
  xbox(b, cam, xf, x - hx, y - hy, z0, x + hx, y + hy, ceilZ, R.fixture, R.fixture, R.fixture);
  poly(b, cam, [{ x: x - hx + 0.03, y: y - hy + 0.03, z: z0 - 0.001 }, { x: x + hx - 0.03, y: y - hy + 0.03, z: z0 - 0.001 }, { x: x + hx - 0.03, y: y + hy - 0.03, z: z0 - 0.001 }, { x: x - hx + 0.03, y: y + hy - 0.03, z: z0 - 0.001 }].map(xf), R.tube);
  const p = project(cam, xf({ x, y, z: z0 }));
  if (!p) return;
  const r = Math.max(4, p.scale * 0.9);
  const gr = b.createRadialGradient(p.x, p.y, 1, p.x, p.y, r);
  gr.addColorStop(0, R.tubeGlow);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  b.fillStyle = gr;
  b.fillRect(p.x - r, p.y - r, r * 2, r * 2);
}

/** The bar across the bar end: a wood counter with KCAO and HELENIAS painted on its front, and a paper towel roll. */
function drawBar(b: CanvasRenderingContext2D, theme: Theme, cam: Camera, xf: Xf, floorZ: number): void {
  const R = theme.room;
  xbox(b, cam, xf, BAR.x0, BAR.y0, floorZ, BAR.x1, BAR.y1, floorZ + BAR.h, R.barTop, R.bar, R.bar);
  const front: WallMap = (t, z, k = 0) => xf({ x: BAR.x1 + k, y: BAR.y1 - t, z });
  const len = BAR.y1 - BAR.y0;
  wallText(b, cam, front, 'KCAO', 'bold 30px sans-serif', R.paintBlue, 0.2, len * 0.45, floorZ + 0.3, floorZ + 0.85, 0.004);
  wallText(b, cam, front, 'HELENIAS', 'bold 24px sans-serif', R.paintBlue, len * 0.5, len - 0.2, floorZ + 0.4, floorZ + 0.8, 0.004);
  wallText(b, cam, front, "MUNK '24", 'bold 14px sans-serif', R.scratch, len * 0.35, len * 0.5, floorZ + 0.88, floorZ + 0.96, 0.004);
  const roll = xf({ x: (BAR.x0 + BAR.x1) / 2, y: BAR.y0 + 0.6, z: 0 });
  cylinder(b, cam, roll, 0.06, floorZ + BAR.h, floorZ + BAR.h + 0.26, { light: R.paper, mid: R.paper, dark: R.fridgeDark }, false);
}

/** The low stage along the stage-side wall: a black platform with the Monopoly table, speakers, a stack of cups and a green jug. */
function drawStage(b: CanvasRenderingContext2D, theme: Theme, cam: Camera, xf: Xf, floorZ: number): void {
  const R = theme.room;
  const st = STAGE;
  const top = floorZ + st.h;
  xbox(b, cam, xf, st.x0, st.y0, floorZ, st.x1, st.y1, top, R.stageFloor, R.stageSide, R.stageSide);
  // The Monopoly table against the wall, its squares along the front edge, cups on it; speakers at the front corners.
  const mx0 = st.x0 + 0.15;
  const mw = st.x1 - st.x0 - 0.3;
  xbox(b, cam, xf, mx0, 0.12, top, mx0 + mw, 0.82, top + 0.72, R.monopolyTop, R.monopolySide, R.monopolySide);
  const n = 10;
  for (let i = 0; i < n; i++) {
    const x = mx0 + 0.05 + (i * (mw - 0.1)) / n;
    const col = R.monopolySquares[i % R.monopolySquares.length];
    poly(b, cam, [{ x, y: 0.7, z: top + 0.721 }, { x: x + (mw - 0.1) / n - 0.03, y: 0.7, z: top + 0.721 }, { x: x + (mw - 0.1) / n - 0.03, y: 0.78, z: top + 0.721 }, { x, y: 0.78, z: top + 0.721 }].map(xf), col);
  }
  // The board's name lies flat on the table (wall-map height becomes depth on the table top).
  wallText(b, cam, (t, z, k = 0) => xf({ x: mx0 + 0.6 + t, y: 0.3 + z, z: top + 0.722 + k }), 'ZETA PSI', 'bold 18px sans-serif', R.stop, 0, 0.8, 0, 0.2, 0.001);
  const glass = { light: R.glassStack, mid: R.glassStack, dark: R.glassStackDark };
  for (let i = 0; i < 9; i++) cylinder(b, cam, xf({ x: mx0 + 0.15 + i * (mw / 9), y: 0.32 + (i % 2) * 0.22, z: 0 }), 0.045, top + 0.72, top + 0.84, glass, false);
  xbox(b, cam, xf, st.x0 + 0.05, 1.0, top, st.x0 + 0.5, 1.4, top + 0.6, R.speakerTop, R.speaker, R.speakerGrille);
  xbox(b, cam, xf, st.x1 - 0.5, 0.95, top, st.x1 - 0.06, 1.38, top + 0.85, R.speakerTop, R.speaker, R.speakerGrille);
  cylinder(b, cam, xf({ x: st.x1 - 0.75, y: 1.2, z: 0 }), 0.08, top, top + 0.3, { light: R.jug, mid: R.jug, dark: shadeHex(R.jug, 0.7) }, false);
}

function drawChair(b: CanvasRenderingContext2D, theme: Theme, cam: Camera, xf: Xf, x: number, y: number, floorZ: number): void {
  const R = theme.room;
  for (const [dx, dy] of [
    [0, 0],
    [0.38, 0],
    [0, 0.38],
    [0.38, 0.38],
  ]) xbox(b, cam, xf, x + dx, y + dy, floorZ, x + dx + 0.04, y + dy + 0.04, floorZ + 0.45, R.chair, R.chairDark, R.chair);
  xbox(b, cam, xf, x, y, floorZ + 0.45, x + 0.42, y + 0.42, floorZ + 0.49, R.chair, R.chairDark, R.chair);
  xbox(b, cam, xf, x, y, floorZ + 0.49, x + 0.04, y + 0.42, floorZ + 0.95, R.chair, R.chairDark, R.chair);
}

// ---------------------------------------------------------------- tables

/**
 * A table in table-local game coordinates, placed in the world by `place`:
 * its trash-can base, plywood edge, painted top and ski. Scenery tables
 * (not the one being played) also get a set of clear cups at each end.
 */
export function drawTableAt(h: CanvasRenderingContext2D, theme: Theme, cfg: GameConfig, cam: Camera, venue: Venue, place: Xf, scenery: boolean, design: TableDesign = venue): void {
  const V = DESIGNS[design];
  const T = theme.table;
  const { length: L, width: W } = cfg.table;
  const floorZ = -cfg.physics.tableHeight;
  const th = 0.035;
  // The table rests on two trash cans, one under the middle of each team's half.
  const cans = [0.25, 0.75].map((fx) => place({ x: L * fx, y: W / 2, z: 0 }));
  cans.sort((p, q) => Math.hypot(q.x - cam.eye.x, q.y - cam.eye.y) - Math.hypot(p.x - cam.eye.x, p.y - cam.eye.y)); // far one first
  for (const at of cans) trashCan(h, cam, at, 0.24, floorZ, -th, { light: T.canLight, mid: T.can, dark: T.canDark });
  xbox(h, cam, place, 0, 0, -th, L, W, 0, V.side, V.side, V.sideDark);
  texturedTop(h, cam, tableArt(theme, design), L, W, place, scenery ? 24 : 48);
  // Faint chalk center lines (the quarters matter for serves).
  stripe(h, cam, { x: 0.04, y: W / 2 }, { x: L - 0.04, y: W / 2 }, 0.01, T.centerLine, place);
  stripe(h, cam, { x: L / 2, y: 0.04 }, { x: L / 2, y: W - 0.04 }, 0.01, T.centerLine, place);
  drawSki(h, theme, cfg, cam, venue, place);
  if (scenery) for (const team of ['A', 'B'] as const) for (const c of buildFormation(cfg, team)) drawSceneryCup(h, theme, cfg, cam, place({ x: c.x, y: c.y, z: 0 }));
}

/** A simple clear cup with water, for tables in the background. */
function drawSceneryCup(h: CanvasRenderingContext2D, theme: Theme, cfg: GameConfig, cam: Camera, at: Vec3): void {
  const C = theme.cup;
  const r = cfg.cups.diameter / 2;
  const H = cfg.physics.cupHeight;
  const top = screenEllipse(cam, { ...at, z: H }, r);
  const bot = screenEllipse(cam, at, r * 0.72);
  const wat = screenEllipse(cam, { ...at, z: H * 0.6 }, r * 0.85);
  if (!top || !bot || !wat) return;
  h.fillStyle = C.water;
  h.beginPath();
  h.moveTo(wat.x - wat.rx, wat.y);
  h.lineTo(bot.x - bot.rx, bot.y);
  h.lineTo(bot.x + bot.rx, bot.y);
  h.lineTo(wat.x + wat.rx, wat.y);
  h.fill();
  h.fillStyle = C.glass;
  h.beginPath();
  h.moveTo(top.x - top.rx, top.y);
  h.lineTo(bot.x - bot.rx, bot.y);
  h.lineTo(bot.x + bot.rx, bot.y);
  h.lineTo(top.x + top.rx, top.y);
  h.fill();
  h.strokeStyle = C.rim;
  h.lineWidth = 1;
  h.beginPath();
  h.ellipse(top.x, top.y, Math.max(0.5, top.rx), Math.max(0.5, top.ry), 0, 0, Math.PI * 2);
  h.stroke();
}

/**
 * The ski laid across the middle of a table, overhanging both sides with an
 * upturned tip, with its own graphics (bands along its length) and a binding.
 */
function drawSki(h: CanvasRenderingContext2D, theme: Theme, cfg: GameConfig, cam: Camera, venue: Venue, place: Xf): void {
  const S = theme.venues[venue].ski;
  const T = theme.table;
  const { length: L, width: W } = cfg.table;
  const hz = cfg.physics.skiHeight * 0.7;
  const hw = cfg.ski.width / 2;
  const x0 = L / 2 - hw;
  const x1 = L / 2 + hw;
  const y0 = -0.2;
  const y1 = W + 0.24;
  poly(h, cam, [{ x: x0 - 0.01, y: 0, z: 0.0008 }, { x: x1 + 0.02, y: 0, z: 0.0008 }, { x: x1 + 0.02, y: W, z: 0.0008 }, { x: x0 - 0.01, y: W, z: 0.0008 }].map(place), T.skiShadow);
  xbox(h, cam, place, x0, y0, 0, x1, y1, hz, S.body, S.side, S.side);
  const tip = (y: number, z: number): Vec3[] => [place({ x: x0, y, z }), place({ x: x1, y, z })];
  const t0 = tip(y0, hz);
  const t1 = tip(y0 - 0.09, hz + 0.025);
  const t2 = tip(y0 - 0.14, hz + 0.065);
  poly(h, cam, [t0[0], t0[1], t1[1], t1[0]], S.body);
  poly(h, cam, [t1[0], t1[1], t2[1], t2[0]], S.side);
  const top = hz + 0.0006;
  const span = y1 - y0;
  for (const [a, c, col, inset] of S.bands) {
    const ya = y0 + a * span;
    const yb = y0 + c * span;
    const k = inset * hw;
    poly(h, cam, [{ x: x0 + k, y: ya, z: top }, { x: x1 - k, y: ya, z: top }, { x: x1 - k, y: yb, z: top }, { x: x0 + k, y: yb, z: top }].map(place), col);
  }
  xbox(h, cam, place, x0 + 0.008, W / 2 - 0.09, hz, x1 - 0.008, W / 2 + 0.05, hz + 0.018, S.binding, shadeHex(S.binding, 0.7), shadeHex(S.binding, 0.8));
}

// ------------------------------------------------------------ table art

const artCache = new Map<TableDesign, HTMLCanvasElement>();
/**
 * The painted top of each table, drawn once (288 x 144 px; u runs along the
 * table from Team A's end, v across it). Each follows its real table:
 * - Saints: a blue field, a big painted figure, gold letters and a cream border.
 * - Night sky: black, with a blue night sky (moon, a firework, a rider on a long
 *   streak), a green meadow with little white spirits, and a black cat.
 * - Chain: black, flames at one end, icicles at the other, a big chain down the
 *   middle, a gold emblem and a yellow border.
 */
export function tableArt(theme: Theme, venue: TableDesign): HTMLCanvasElement {
  let c = artCache.get(venue);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = 288;
  c.height = 144;
  const x = c.getContext('2d')!;
  let seed = venue === 'saints' ? 7 : venue === 'spirits' ? 19 : 31 + venue.length * 13;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  if (paintDesign(x, venue, rnd)) {
    /* one of the newer designs */
  } else if (venue === 'saints') saintsArt(x, theme, rnd);
  else if (venue === 'spirits') spiritsArt(x, theme, rnd);
  else chainArt(x, theme, rnd);
  artCache.set(venue, c);
  return c;
}

type Ctx = CanvasRenderingContext2D;

function outlineFill(x: Ctx, fill: string, outline: string, w = 2): void {
  x.fillStyle = fill;
  x.fill();
  x.lineWidth = w;
  x.strokeStyle = outline;
  x.stroke();
}

function scuffs(x: Ctx, rnd: () => number, col: string, n: number, W = 288, H = 144): void {
  for (let k = 0; k < n; k++) {
    x.fillStyle = col;
    x.globalAlpha = 0.2 + rnd() * 0.3;
    x.fillRect(Math.round(rnd() * W), Math.round(rnd() * H), 1 + Math.round(rnd() * 3), 1);
  }
  x.globalAlpha = 1;
}

function border(x: Ctx, rnd: () => number, col: string, chip: string, w = 4, W = 288, H = 144): void {
  x.fillStyle = col;
  x.fillRect(0, 0, W, w);
  x.fillRect(0, H - w, W, w);
  x.fillRect(0, 0, w, H);
  x.fillRect(W - w, 0, w, H);
  x.fillStyle = chip;
  for (let k = 0; k < 40; k++) {
    const side = k % 4;
    const t = rnd();
    const px = side < 2 ? t * W : side === 2 ? 1 + rnd() * 2 : W - 3 + rnd() * 2;
    const py = side >= 2 ? t * H : side === 0 ? 1 + rnd() * 2 : H - 3 + rnd() * 2;
    x.fillRect(Math.round(px), Math.round(py), 2, 1);
  }
}

function saintsArt(x: Ctx, theme: Theme, rnd: () => number): void {
  const T = theme.venues.saints.art;
  const W = 288;
  const H = 144;
  x.fillStyle = T.field;
  x.fillRect(0, 0, W, H);
  for (let k = 0; k < 520; k++) {
    x.fillStyle = k % 2 ? T.fieldDark : T.fieldLight;
    x.globalAlpha = 0.35 + rnd() * 0.3;
    x.fillRect(Math.round(rnd() * W), Math.round(rnd() * H), 2 + Math.round(rnd() * 7), 1);
  }
  x.globalAlpha = 1;
  const blob = (cx: number, cy: number, rx: number, ry: number, rot: number, fill: string) => {
    x.beginPath();
    x.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
    outlineFill(x, fill, T.outline);
  };
  const limb = (pts: [number, number][], w: number, fill: string) => {
    x.lineCap = 'round';
    x.lineJoin = 'round';
    x.strokeStyle = T.outline;
    x.lineWidth = w + 3;
    x.beginPath();
    pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b)));
    x.stroke();
    x.strokeStyle = fill;
    x.lineWidth = w;
    x.stroke();
  };
  // Team B's half: a reclining figure in a red cape and a green robe.
  blob(208, 52, 60, 22, -0.35, T.cape);
  blob(214, 66, 42, 15, -0.3, T.robe);
  limb([[178, 84], [160, 98], [150, 104]], 6, T.gold);
  limb([[246, 40], [262, 30]], 6, T.gold);
  blob(262, 82, 9, 8, 0, T.skin);
  // Team A's half: a green hill and a reaching gold arm, toward the middle.
  x.beginPath();
  x.moveTo(30, H);
  x.quadraticCurveTo(70, 70, 140, 98);
  x.lineTo(140, H);
  x.closePath();
  outlineFill(x, T.hill, T.outline);
  limb([[70, 60], [100, 52], [128, 46]], 7, T.gold);
  limb([[92, 92], [112, 78]], 6, T.gold);
  blob(140, 70, 8, 7, 0, T.skin);
  // Gold letters: each team reads its own on the far half.
  const letters = (text: string, cx: number, cy: number, rot: number, size: number) => {
    x.save();
    x.translate(cx, cy);
    x.rotate(rot);
    x.font = `bold ${size}px serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineWidth = 3;
    x.strokeStyle = T.outline;
    x.strokeText(text, 0, 0);
    x.fillStyle = T.gold;
    x.fillText(text, 0, 0);
    x.restore();
  };
  letters(theme.houseLetters, 186, 104, Math.PI / 2, 24);
  letters("'16X", 98, 28, -Math.PI / 2, 18);
  scuffs(x, rnd, T.chip, 60);
  border(x, rnd, T.edge, T.chip);
}

function spiritsArt(x: Ctx, theme: Theme, rnd: () => number): void {
  const T = theme.venues.spirits.art;
  const W = 288;
  const H = 144;
  x.fillStyle = T.black;
  x.fillRect(0, 0, W, H);
  scuffs(x, rnd, T.wear, 260);
  // The night sky: a big rounded blue shape over Team A's half and the middle, with a flared tail.
  x.beginPath();
  x.moveTo(6, 30);
  x.quadraticCurveTo(30, 44, 44, 40);
  x.bezierCurveTo(70, 2, 190, -4, 206, 40);
  x.bezierCurveTo(222, 80, 200, 132, 150, 136);
  x.bezierCurveTo(90, 142, 40, 120, 40, 84);
  x.quadraticCurveTo(24, 70, 4, 46);
  x.closePath();
  x.fillStyle = T.sky;
  x.fill();
  scuffs(x, rnd, T.skyLight, 140, 200, 140);
  // The green meadow rolling in over Team B's half.
  x.beginPath();
  x.moveTo(288, 10);
  x.bezierCurveTo(230, 0, 160, 50, 150, 96);
  x.bezierCurveTo(144, 128, 170, 144, 210, 144);
  x.lineTo(288, 144);
  x.closePath();
  x.fillStyle = T.meadow;
  x.fill();
  scuffs(x, rnd, T.meadowDark, 120);
  // Moon, a firework burst, and a rider on a long pale streak.
  x.beginPath();
  x.arc(66, 92, 13, 0, Math.PI * 2);
  x.fillStyle = T.moon;
  x.fill();
  x.strokeStyle = T.firework;
  x.lineWidth = 1;
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    x.beginPath();
    x.moveTo(150 + Math.cos(a) * 3, 30 + Math.sin(a) * 3);
    x.lineTo(150 + Math.cos(a) * 11, 30 + Math.sin(a) * 11);
    x.stroke();
  }
  x.strokeStyle = T.streak;
  x.lineWidth = 4;
  x.lineCap = 'round';
  x.beginPath();
  x.moveTo(52, 52);
  x.quadraticCurveTo(110, 40, 176, 70);
  x.stroke();
  x.strokeStyle = T.streakLight;
  x.lineWidth = 1;
  x.beginPath();
  x.moveTo(30, 58);
  x.lineTo(150, 34);
  x.stroke();
  x.fillStyle = T.rider;
  x.fillRect(116, 44, 6, 5);
  x.fillStyle = T.riderHair;
  x.fillRect(116, 42, 6, 2);
  // Yellow and orange dots in the meadow and the sky.
  for (let k = 0; k < 26; k++) {
    x.fillStyle = k % 3 ? T.dotYellow : T.dotOrange;
    x.beginPath();
    x.arc(140 + rnd() * 130, 20 + rnd() * 110, 1.6, 0, Math.PI * 2);
    x.fill();
  }
  // Little white spirits, and a black cat at the edge of the meadow.
  for (const [sx, sy] of [
    [226, 62],
    [250, 84],
    [212, 98],
    [258, 44],
    [236, 112],
  ]) {
    x.fillStyle = T.spirit;
    x.beginPath();
    x.ellipse(sx, sy, 5, 4.5, 0, 0, Math.PI * 2);
    x.fill();
    x.fillRect(sx + 3, sy - 2, 6, 4);
    x.fillStyle = T.black;
    x.fillRect(sx - 2, sy - 1, 1, 1);
    x.fillRect(sx + 1, sy - 1, 1, 1);
  }
  x.fillStyle = T.black;
  x.beginPath();
  x.ellipse(178, 124, 5, 4, 0, 0, Math.PI * 2);
  x.fill();
  x.fillRect(174, 117, 2, 3);
  x.fillRect(180, 117, 2, 3);
  x.fillStyle = T.catEyes;
  x.fillRect(176, 122, 1, 1);
  x.fillRect(180, 122, 1, 1);
  border(x, rnd, T.edge, T.wear, 3);
}

function chainArt(x: Ctx, theme: Theme, rnd: () => number): void {
  const T = theme.venues.chain.art;
  const W = 288;
  const H = 144;
  x.fillStyle = T.black;
  x.fillRect(0, 0, W, H);
  scuffs(x, rnd, T.wear, 220);
  // Flames at Team B's end.
  x.fillStyle = T.flame;
  x.fillRect(236, 0, 52, H);
  x.beginPath();
  x.moveTo(240, 0);
  for (let v = 0; v <= H; v += 12) {
    const reach = 18 + rnd() * 34;
    x.lineTo(240 - reach, v + 4);
    x.lineTo(240 - reach * 0.3, v + 8);
    x.lineTo(240, v + 12);
  }
  x.lineTo(240, H);
  x.closePath();
  x.fill();
  x.fillStyle = T.flameDark;
  for (let v = 6; v < H; v += 24) {
    x.beginPath();
    x.moveTo(248, v);
    x.lineTo(230 - rnd() * 14, v + 6);
    x.lineTo(250, v + 12);
    x.fill();
  }
  // Icicles at Team A's end.
  x.fillStyle = T.ice;
  x.fillRect(0, 0, 18, H);
  for (let v = 0; v < H; v += 8) {
    const reach = 10 + rnd() * 26;
    x.beginPath();
    x.moveTo(18, v);
    x.lineTo(18 + reach, v + 3);
    x.lineTo(18, v + 7);
    x.fill();
  }
  x.fillStyle = T.iceLight;
  for (let v = 4; v < H; v += 16) x.fillRect(4, v, 10, 2);
  // The chain: links alternating face-on and edge-on down the middle.
  x.strokeStyle = T.chain;
  x.lineJoin = 'round';
  for (let i = 0; i < 5; i++) {
    const cx = 52 + i * 46;
    x.lineWidth = i % 2 ? 6 : 7;
    x.beginPath();
    if (i % 2) x.rect(cx - 26, 66, 52, 12);
    else x.ellipse(cx, 72, 30, 18, 0, 0, Math.PI * 2);
    x.stroke();
  }
  x.strokeStyle = T.chainDark;
  x.lineWidth = 1;
  for (let i = 0; i < 5; i += 2) {
    x.beginPath();
    x.ellipse(52 + i * 46, 72, 26, 14, 0, 0, Math.PI * 2);
    x.stroke();
  }
  // Gold emblem in the middle.
  x.strokeStyle = T.gold;
  x.lineWidth = 3;
  x.beginPath();
  x.ellipse(144, 72, 28, 18, 0, 0, Math.PI * 2);
  x.stroke();
  x.font = 'bold 16px serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = T.gold;
  x.save();
  x.translate(144, 72);
  x.rotate(Math.PI / 2);
  x.fillText(theme.houseLetters, 0, 0);
  x.restore();
  // Worn patches where the cups sit.
  x.fillStyle = T.wornPatch;
  for (const [u, v] of [
    [30, 72],
    [256, 72],
  ]) {
    x.beginPath();
    x.ellipse(u, v, 14, 20, 0, 0, Math.PI * 2);
    x.globalAlpha = 0.45;
    x.fill();
    x.globalAlpha = 1;
  }
  border(x, rnd, T.edge, T.edgeChip, 3);
}
