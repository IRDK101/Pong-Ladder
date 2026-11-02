// Drawing a styled profile name, as HTML (leaderboard, lobby, profile) and
// on the canvas (home screen).

import { flairIcon, styleColors, type NameStyle } from '../progress/nameStyles';
import { h } from './dom';

/** A styled name as a span (flair icon, color or gradient, effect). */
export function styledName(name: string, style: NameStyle, extraClass = ''): HTMLSpanElement {
  const colors = styleColors(style);
  const text = h('span', { class: `sn-text sn-${style.effect}` }, name);
  if (colors.length > 1 || style.effect === 'shine') {
    const stops = colors.length > 1 ? colors : [colors[0], '#ffffff', colors[0]];
    text.style.backgroundImage = `linear-gradient(90deg, ${[...stops, stops[0]].join(', ')})`;
    text.classList.add('sn-grad');
  } else text.style.color = colors[0];
  text.style.setProperty('--sn', colors[0]);
  const icon = flairIcon(style);
  return h('span', { class: `sn ${extraClass}`.trim(), title: name }, icon ? h('span', { class: 'sn-flair', 'aria-hidden': 'true' }, icon) : null, text);
}

export const NAME_STYLE_CSS = (gold: string) => `
  #ui .sn { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; font-weight: bold; }
  #ui .sn-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #ui .sn-flair { flex: none; }
  #ui .sn-grad { background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent !important; }
  #ui .sn-shadow { text-shadow: 2px 2px 0 #000; }
  #ui .sn-caps { text-transform: uppercase; letter-spacing: 0.14em; }
  #ui .sn-outline { -webkit-text-stroke: 1px #000; paint-order: stroke fill; text-shadow: 1px 0 #000, -1px 0 #000, 0 1px #000, 0 -1px #000; }
  #ui .sn-glow { text-shadow: 0 0 6px var(--sn), 0 0 12px var(--sn); }
  #ui .sn-grad.sn-glow { filter: drop-shadow(0 0 5px var(--sn)); text-shadow: none; }
  #ui .sn-italic { font-style: italic; transform: skewX(-8deg); display: inline-block; }
  #ui .sn-shine { animation: sn-shine 2.6s linear infinite; }
  #ui .sn-pulse { animation: sn-pulse 1.6s ease-in-out infinite; }
  #ui .sn-grad:not(.sn-shine) { animation: sn-shine 6s linear infinite; }
  @keyframes sn-shine { from { background-position: 0% 0; } to { background-position: 200% 0; } }
  @keyframes sn-pulse { 0%, 100% { filter: drop-shadow(0 0 0 transparent); } 50% { filter: drop-shadow(0 0 6px var(--sn)) brightness(1.25); } }
  @media (prefers-reduced-motion: reduce) { #ui .sn-shine, #ui .sn-pulse, #ui .sn-grad { animation: none !important; } }
  #ui .style-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
  #ui .style-opt { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 8px 10px; text-align: left; min-width: 0; }
  #ui .style-opt.on { border-color: ${gold}; box-shadow: 0 0 0 2px ${gold}; background: #4a3f24; color: inherit; }
  #ui .style-opt:disabled { opacity: 0.45; }
  #ui .style-opt small { font-size: 11px; opacity: 0.75; font-weight: normal; }
  #ui .swatch { display: inline-block; width: 100%; height: 12px; border: 1px solid #0008; }
  #ui .preview-stack { display: flex; flex-direction: column; gap: 8px; }
  #ui .preview-label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.7; }
  #ui .board-row .who { display: flex; align-items: center; gap: 8px; min-width: 0; }
  @media (max-width: 520px) { #ui .board-row { grid-template-columns: 30px minmax(0, 1fr) 34px 62px; gap: 6px; padding: 8px; } }
  #ui .board-row .who canvas { flex: none; image-rendering: pixelated; }
`;

/**
 * Draw a styled name on a canvas, left-aligned at (x, y) with the current
 * textBaseline. Returns the width used. `t` (ms) animates shine and pulse.
 */
export function drawStyledName(ctx: CanvasRenderingContext2D, name: string, style: NameStyle, x: number, y: number, font: string, maxWidth: number, t = 0): number {
  ctx.save();
  ctx.textAlign = 'left';
  const icon = flairIcon(style);
  let cx = x;
  if (icon) {
    ctx.font = font;
    ctx.fillStyle = '#fff';
    ctx.fillText(icon, cx, y);
    cx += ctx.measureText(icon).width + 6;
  }
  const text = style.effect === 'caps' ? name.toUpperCase().split('').join(' ') : name;
  ctx.font = style.effect === 'italic' ? `italic ${font}` : font;
  const room = Math.max(20, maxWidth - (cx - x));
  const w = Math.min(room, ctx.measureText(text).width);
  const colors = styleColors(style);
  let fill: string | CanvasGradient = colors[0];
  if (colors.length > 1 || style.effect === 'shine') {
    const stops = colors.length > 1 ? colors : [colors[0], '#ffffff', colors[0]];
    const shift = style.effect === 'shine' || colors.length > 1 ? ((t / (style.effect === 'shine' ? 2600 : 6000)) % 1) * w : 0;
    const g = ctx.createLinearGradient(cx - shift, 0, cx - shift + w * 2, 0);
    const loop = [...stops, ...stops, stops[0]];
    loop.forEach((col, i) => g.addColorStop(i / (loop.length - 1), col));
    fill = g;
  }
  if (style.effect === 'shadow') {
    ctx.fillStyle = '#000';
    ctx.fillText(text, cx + 2, y + 2, room);
  }
  if (style.effect === 'outline') {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, cx, y, room);
  }
  if (style.effect === 'glow' || style.effect === 'pulse') {
    ctx.shadowColor = colors[0];
    ctx.shadowBlur = style.effect === 'glow' ? 10 : 4 + 8 * (0.5 + 0.5 * Math.sin(t / 255));
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, cx, y, room);
  ctx.restore();
  return cx - x + w;
}
