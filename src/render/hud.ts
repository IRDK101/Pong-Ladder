// HUD: cup states, server, whose turn, miss counter, referee messages, match score.

import type { Theme } from '../theme';
import { diagonalOf } from '../core/table';
import type { Cup, TeamId } from '../core/types';
import type { Game } from '../game/game';
import type { View } from './renderer';

const teamColor = (theme: Theme, t: TeamId) => (t === 'A' ? theme.colors.teamA : theme.colors.teamB);

/** A pixel-style HUD panel: dark fill with a 2px colored border and a darker inner edge. */
function panel(ctx: CanvasRenderingContext2D, theme: Theme, x: number, y: number, w: number, h: number, border: string): void {
  ctx.fillStyle = theme.colors.hudPanel3d;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = border;
  ctx.fillRect(x, y, w, 2);
  ctx.fillRect(x, y + h - 2, w, 2);
  ctx.fillRect(x, y, 2, h);
  ctx.fillRect(x + w - 2, y, 2, h);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x + 2, y + h - 4, w - 4, 2);
}

export function renderHud(ctx: CanvasRenderingContext2D, theme: Theme, v: View, game: Game): void {
  const st = game.engine.peek();
  const c = theme.colors;
  const W = v.width;
  const M = 12; // margin from the screen edge

  // --- Team panels in the top corners.
  const cupsW = Math.max(st.cups.A.length, st.cups.B.length) * 18 + 24;
  const teamW = Math.max(230, cupsW);
  panel(ctx, theme, M, M, teamW, 76, c.teamA);
  panel(ctx, theme, W - M - teamW, M, teamW, 76, c.teamB);
  drawTeamCups(ctx, theme, 'A', st.cups.A, M + 12, 'left', false, game.teamLine('A'));
  drawTeamCups(ctx, theme, 'B', st.cups.B, W - M - 12, 'right', game.cfg.players.mode === 'coop', game.teamLine('B'));

  // --- Status pill, top center.
  let status: string;
  switch (st.phase) {
    case 'awaitServe':
      status = `${game.nameOf(st.server)} serves to ${game.nameOf(diagonalOf(st.server))}`;
      break;
    case 'serveInFlight':
    case 'rally': {
      const due = game.activePlayer(st.rally!.target);
      status = st.rally!.cupAtRisk ? `SAVE IT, Team ${st.rally!.target}!` : `${due ? game.nameOf(due) : ''} to hit`;
      break;
    }
    case 'penalty':
      status = `Team ${st.penalty!.team}: pick a cup to lose half`;
      break;
    case 'gameOver':
      status = `Team ${st.winner} wins the game`;
      break;
  }
  const bits = [`Server ${game.nameOf(st.server)}`, `Misses ${st.missCount}/${game.cfg.serveTableMissLimit}`];
  if (game.cfg.matchFormat === 'bestOf3') bits.push(`Games A ${game.match.wins.A}–${game.match.wins.B} B`);
  if (st.sinkChain && st.sinkChain.length > 1) bits.push(`Chain ${game.nameOf(st.sinkChain.player)} x${st.sinkChain.length}`);
  ctx.font = theme.fonts.title;
  const sw = Math.min(W - 2 * (teamW + M * 2), Math.max(ctx.measureText(status).width, 260) + 40);
  const urgent = st.phase === 'penalty' || !!st.rally?.cupAtRisk;
  panel(ctx, theme, W / 2 - sw / 2, M, sw, 52, urgent ? c.penaltyCursor : c.tableEdge);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = urgent ? c.penaltyCursor : c.text;
  ctx.fillText(status, W / 2, M + 18);
  ctx.font = theme.fonts.label;
  ctx.fillStyle = c.textDim;
  ctx.fillText(bits.join('  ·  '), W / 2, M + 38);

  // --- Referee messages, bottom center: the newest big, the one before it small.
  const recent = game.messages.slice(-2);
  if (recent.length) {
    ctx.font = theme.fonts.title;
    const newest = recent[recent.length - 1].text;
    const mw = Math.min(W - 2 * M, Math.max(ctx.measureText(newest).width + 48, 360));
    const mh = recent.length > 1 ? 58 : 38;
    const my = v.height - M - mh - 18;
    panel(ctx, theme, W / 2 - mw / 2, my, mw, mh, c.tableEdge);
    ctx.textAlign = 'center';
    if (recent.length > 1) {
      ctx.font = theme.fonts.label;
      ctx.fillStyle = c.textDim;
      ctx.fillText(recent[0].text, W / 2, my + 15);
    }
    ctx.font = theme.fonts.title;
    ctx.fillStyle = c.text;
    ctx.fillText(newest, W / 2, my + mh - 18);
  }

  // --- One-line hint under the message box, and the keys in the bottom corners.
  ctx.font = theme.fonts.label;
  const coop = game.cfg.players.mode === 'coop';
  const hint =
    st.phase === 'penalty'
      ? `Team ${st.penalty!.team}: aim keys to pick a cup, hit key to confirm (or click it)`
      : st.phase === 'awaitServe'
        ? 'Serve: hit to toss, hit again when the ring turns green · hold a direction for spin'
        : 'Aim before the ball arrives · hit when the ring meets the ball · hold a direction for spin';
  const tag = (text: string, x: number, align: CanvasTextAlign, col: string) => {
    const w = ctx.measureText(text).width + 12;
    const x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x0, v.height - M - 14, w, 16);
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    ctx.fillText(text, x0 + w / 2, v.height - M - 6);
  };
  tag(hint, W / 2, 'center', st.phase === 'penalty' ? c.penaltyCursor : c.textDim);
  if (W > 1100) {
    tag(coop ? 'Left teammate: WASD · Space' : 'Team A: WASD · Space', M, 'left', c.teamA);
    tag(coop ? 'Right teammate: Arrows · Enter' : 'Team B: Arrows · Enter', W - M, 'right', c.teamB);
  }
}

function drawTeamCups(ctx: CanvasRenderingContext2D, theme: Theme, team: TeamId, cups: Cup[], x: number, align: 'left' | 'right', cpuTeam = false, names = ''): void {
  const c = theme.colors;
  const live = cups.filter((k) => k.state !== 'removed').length;
  ctx.textBaseline = 'middle';
  ctx.textAlign = align;
  ctx.font = theme.fonts.title;
  ctx.fillStyle = teamColor(theme, team);
  ctx.fillText(`${cpuTeam ? 'CPU' : `TEAM ${team}`}  ${live}`, x, 29);
  if (names) {
    ctx.font = theme.fonts.label;
    ctx.fillStyle = c.textDim;
    ctx.fillText(names, x, 46);
  }
  // One mini cup per cup, showing its water level.
  const r = 6;
  const step = r * 2 + 4;
  cups.forEach((cup, i) => {
    const cx = align === 'left' ? x + r + i * step : x - r - i * step;
    const cy = 66;
    ctx.globalAlpha = cup.state === 'removed' ? 0.2 : 1;
    ctx.fillStyle = team === 'A' ? c.cupTeamA : c.cupTeamB;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    if (cup.state !== 'removed') {
      ctx.fillStyle = cup.state === 'full' ? c.water : c.waterHalf;
      ctx.beginPath();
      ctx.arc(cx, cy, r * (cup.state === 'full' ? 0.7 : 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
}
