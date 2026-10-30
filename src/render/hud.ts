// HUD: cup states, server, whose turn, miss counter, referee messages, match score.

import type { Theme } from '../theme';
import { diagonalOf } from '../core/table';
import { playerName } from '../core/rules';
import type { Cup, TeamId } from '../core/types';
import type { Game } from '../game/game';
import type { View } from './renderer';

const teamColor = (theme: Theme, t: TeamId) => (t === 'A' ? theme.colors.teamA : theme.colors.teamB);

export function renderHud(ctx: CanvasRenderingContext2D, theme: Theme, v: View, game: Game): void {
  const st = game.engine.peek();
  const c = theme.colors;
  const W = v.width;

  // --- Top bar ---
  ctx.fillStyle = c.hudPanel;
  ctx.fillRect(0, 0, W, theme.hudTop);
  drawTeamCups(ctx, theme, 'A', st.cups.A, 20, 'left');
  drawTeamCups(ctx, theme, 'B', st.cups.B, W - 20, 'right');

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = c.text;
  ctx.font = theme.fonts.title;
  let status: string;
  switch (st.phase) {
    case 'awaitServe':
      status = `${playerName(st.server)} serves to ${playerName(diagonalOf(st.server))}`;
      break;
    case 'serveInFlight':
    case 'rally': {
      const due = game.activePlayer(st.rally!.target);
      status = st.rally!.cupAtRisk ? `SAVE IT, Team ${st.rally!.target}!` : `${due ? playerName(due) : ''} to hit`;
      break;
    }
    case 'penalty':
      status = `Team ${st.penalty!.team}: pick a cup to lose half`;
      break;
    case 'gameOver':
      status = `Team ${st.winner} wins the game`;
      break;
  }
  ctx.fillText(status, W / 2, 24);

  ctx.font = theme.fonts.hud;
  ctx.fillStyle = c.textDim;
  const bits = [`Server: ${playerName(st.server)}`, `Table misses: ${st.missCount}/${game.cfg.serveTableMissLimit}`];
  if (game.cfg.matchFormat === 'bestOf3') bits.push(`Games  A ${game.match.wins.A} – ${game.match.wins.B} B  (game ${game.match.games.length})`);
  if (st.sinkChain && st.sinkChain.length > 1) bits.push(`Sink chain: ${playerName(st.sinkChain.player)} x${st.sinkChain.length}`);
  ctx.fillText(bits.join('    ·    '), W / 2, 50);

  // --- Bottom: referee messages ---
  const top = v.height - theme.hudBottom;
  ctx.fillStyle = c.hudPanel;
  ctx.fillRect(0, top, W, theme.hudBottom);
  const recent = game.messages.slice(-4);
  ctx.textAlign = 'center';
  recent.forEach((m, i) => {
    const newest = i === recent.length - 1;
    ctx.font = newest ? theme.fonts.title : theme.fonts.hud;
    ctx.fillStyle = newest ? c.text : c.textDim;
    ctx.globalAlpha = newest ? 1 : 0.45 + 0.15 * i;
    ctx.fillText(m.text, W / 2, top + theme.hudBottom - 22 - (recent.length - 1 - i) * 24);
  });
  ctx.globalAlpha = 1;

  // Controls hint.
  ctx.font = theme.fonts.label;
  ctx.fillStyle = c.textDim;
  ctx.textAlign = 'left';
  ctx.fillText('A: WASD aim · Space hit', 12, top + 14);
  ctx.textAlign = 'right';
  ctx.fillText('B: Arrows aim · Enter hit', W - 12, top + 14);
  if (st.phase === 'penalty') {
    ctx.textAlign = 'center';
    ctx.fillStyle = c.penaltyCursor;
    ctx.fillText(`Team ${st.penalty!.team}: aim keys to pick, hit key to confirm, or click a cup`, W / 2, top + 14);
  } else if (st.phase === 'awaitServe') {
    ctx.textAlign = 'center';
    ctx.fillText('Serve: hit to toss, hit again when the ring turns green', W / 2, top + 14);
  } else {
    ctx.textAlign = 'center';
    ctx.fillText('Hold aim keys to move your crosshair · hit when the ring meets the ball', W / 2, top + 14);
  }
}

function drawTeamCups(ctx: CanvasRenderingContext2D, theme: Theme, team: TeamId, cups: Cup[], x: number, align: 'left' | 'right'): void {
  const c = theme.colors;
  const live = cups.filter((k) => k.state !== 'removed').length;
  ctx.textBaseline = 'middle';
  ctx.textAlign = align;
  ctx.font = theme.fonts.title;
  ctx.fillStyle = teamColor(theme, team);
  ctx.fillText(`TEAM ${team}  ${live}`, x, 22);
  // One mini cup per cup, showing its water level.
  const r = 7;
  const step = r * 2 + 4;
  cups.forEach((cup, i) => {
    const cx = align === 'left' ? x + r + i * step : x - r - i * step;
    const cy = 50;
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
