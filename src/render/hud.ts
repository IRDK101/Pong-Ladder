// HUD: cup states, server, whose turn, miss counter, referee messages, match score.

import type { Theme } from '../theme';
import { diagonalOf } from '../core/table';
import type { Cup, TeamId } from '../core/types';
import type { Game } from '../game/game';
import type { View } from './renderer';

const teamColor = (theme: Theme, t: TeamId) => (t === 'A' ? theme.colors.teamA : theme.colors.teamB);

/** A pixel-style HUD panel: dark fill with a 2px colored border and a darker inner edge (shared with the menus). */
export function panel(ctx: CanvasRenderingContext2D, theme: Theme, x: number, y: number, w: number, h: number, border: string, fill: string = theme.colors.hudPanel3d): void {
  ctx.fillStyle = fill;
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
  // On narrow screens the panels shrink (and the cup dots tighten) so they never overlap.
  const teamW = Math.min(Math.max(230, cupsW), Math.floor((W - 3 * M) / 2));
  panel(ctx, theme, M, M, teamW, 76, c.teamA);
  panel(ctx, theme, W - M - teamW, M, teamW, 76, c.teamB);
  drawTeamCups(ctx, theme, 'A', st.cups.A, M + 12, 'left', false, game.teamLine('A'), teamW - 24);
  drawTeamCups(ctx, theme, 'B', st.cups.B, W - M - 12, 'right', game.cfg.players.mode === 'coop', game.teamLine('B'), teamW - 24);

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
      status = st.penalty!.chooser === st.penalty!.team ? `Team ${st.penalty!.team}: pick a cup to lose half` : `Team ${st.penalty!.chooser}: pick which Team ${st.penalty!.team} cup loses half`;
      break;
    case 'gameOver':
      status = `Team ${st.winner} wins the game`;
      break;
  }
  const bits = [`Server ${game.nameOf(st.server)}`, `Misses ${st.missCount}/${game.cfg.serveTableMissLimit}`];
  if (game.cfg.matchFormat === 'bestOf3') bits.push(`Games A ${game.match.wins.A}–${game.match.wins.B} B`);
  if (st.sinkChain && st.sinkChain.length > 1) bits.push(`Chain ${game.nameOf(st.sinkChain.player)} x${st.sinkChain.length}`);
  ctx.font = theme.fonts.title;
  const want = Math.max(ctx.measureText(status).width, 260) + 40;
  // On narrow screens the pill drops below the team panels instead of squeezing between them.
  const narrow = W - 2 * (teamW + M * 2) < Math.min(want, 300);
  const sw = narrow ? Math.min(W - 2 * M, want) : Math.min(W - 2 * (teamW + M * 2), want);
  const sy = narrow ? M + 76 + 8 : M;
  const urgent = st.phase === 'penalty' || !!st.rally?.cupAtRisk;
  panel(ctx, theme, W / 2 - sw / 2, sy, sw, 52, urgent ? c.penaltyCursor : c.uiEdge);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = urgent ? c.penaltyCursor : c.text;
  ctx.fillText(status, W / 2, sy + 18, sw - 16);
  ctx.font = theme.fonts.label;
  ctx.fillStyle = c.textDim;
  ctx.fillText(bits.join('  ·  '), W / 2, sy + 38, sw - 16);

  // --- Bottom bar: the newest referee call, with a one-line hint under it.
  const coop = game.cfg.players.mode === 'coop';
  const hint =
    st.phase === 'gameOver'
      ? ''
      : st.phase === 'penalty'
      ? `Team ${st.penalty!.chooser}: aim keys pick a cup, hit key confirms (or click it)`
      : st.phase === 'awaitServe'
        ? 'Aim, then hit to toss · hit again as the rings meet · hold a direction for spin'
        : 'Aim before the ball arrives · hit as the rings meet · hold a direction for spin';
  const newest = game.messages[game.messages.length - 1]?.text ?? '';
  ctx.font = theme.fonts.bar;
  const mw = Math.min(W - 2 * M, Math.max(ctx.measureText(newest).width, ctx.measureText(hint).width * 0.86) + 48);
  const mh = 46;
  const my = v.height - M - mh;
  panel(ctx, theme, W / 2 - mw / 2, my, mw, mh, c.uiEdge);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = c.text;
  ctx.font = theme.fonts.bar;
  ctx.fillText(newest, W / 2, my + 16, mw - 16);
  ctx.font = theme.fonts.small;
  ctx.fillStyle = st.phase === 'penalty' ? c.penaltyCursor : c.textDim;
  ctx.fillText(hint, W / 2, my + 33, mw - 16);
  // Keys in the bottom corners, when there is room beside the bar.
  if (W - mw > 2 * 230) {
    ctx.font = theme.fonts.label;
    const tag = (text: string, x: number, align: CanvasTextAlign, col: string) => {
      const w = ctx.measureText(text).width + 14;
      const x0 = align === 'left' ? x : x - w;
      panel(ctx, theme, x0, v.height - M - 26, w, 26, col);
      ctx.fillStyle = col;
      ctx.textAlign = 'center';
      ctx.fillText(text, x0 + w / 2, v.height - M - 13);
    };
    if (coop && game.solo) {
      tag('You: WASD or arrows · Space or Enter · Shift: fine aim', M, 'left', c.teamA);
      tag('CPU', W - M, 'right', c.teamB);
    } else {
      tag(coop ? 'Left teammate: WASD · Space · L-Shift fine' : 'Team A: WASD · Space · L-Shift fine', M, 'left', c.teamA);
      tag(coop ? 'Right teammate: Arrows · Enter · R-Shift fine' : 'Team B: Arrows · Enter · R-Shift fine', W - M, 'right', c.teamB);
    }
  }
}

function drawTeamCups(ctx: CanvasRenderingContext2D, theme: Theme, team: TeamId, cups: Cup[], x: number, align: 'left' | 'right', cpuTeam = false, names = '', room = 999): void {
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
    ctx.fillText(names, x, 46, room);
  }
  // One mini cup per cup, showing its water level.
  const step = Math.min(16, room / Math.max(1, cups.length));
  const r = Math.min(6, (step - 2) / 2);
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
