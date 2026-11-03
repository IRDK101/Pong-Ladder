// Small DOM helpers for the HTML screens (character editor, profiles, draft,
// backup) that sit over the canvas. Colors and fonts come from the theme.

import type { Sprite } from '../core/character';
import type { Theme } from '../theme';
import { NAME_STYLE_CSS } from './nameStyle';

type Attrs = Record<string, string | number | boolean | EventListener | undefined>;
type Child = Node | string | null | undefined | false;

/** Create an element: h('button', { class: 'x', onclick: fn }, 'Label'). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'value' && 'value' in el) (el as HTMLInputElement).value = String(v);
    else if (k === 'checked' && 'checked' in el) (el as HTMLInputElement).checked = Boolean(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

const spriteCache = new WeakMap<Sprite, Map<number, HTMLCanvasElement>>();

/**
 * A canvas showing a sprite (cached per sprite object). `scale` is in units of
 * the 16-pixel drawing grid, so a full-size 32-pixel sprite at scale 2 is drawn
 * pixel for pixel, the same size a 16-pixel one was.
 */
export function spriteCanvas(sprite: Sprite, gridScale: number): HTMLCanvasElement {
  const scale = Math.max(1, Math.round((gridScale * 16) / Math.max(1, sprite.w)));
  let byScale = spriteCache.get(sprite);
  if (!byScale) spriteCache.set(sprite, (byScale = new Map()));
  const hit = byScale.get(scale);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = sprite.w * scale;
  c.height = sprite.h * scale;
  const ctx = c.getContext('2d')!;
  sprite.pixels.forEach((col, i) => {
    if (!col) return;
    ctx.fillStyle = col;
    ctx.fillRect((i % sprite.w) * scale, Math.floor(i / sprite.w) * scale, scale, scale);
  });
  byScale.set(scale, c);
  return c;
}

/** A fresh (uncached) copy of a sprite canvas, safe to put in the DOM more than once. */
export function spriteImage(sprite: Sprite, scale: number, cls = 'sprite'): HTMLCanvasElement {
  const src = spriteCanvas(sprite, scale);
  const c = h('canvas', { class: cls, width: src.width, height: src.height });
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}

/** A character name, styled as a Master's when the title is set. */
export function nameTag(name: string, master: boolean, color: string | null = null): HTMLSpanElement {
  const el = h('span', { class: master ? 'name master' : 'name' }, master ? `★ ${name}` : name);
  if (color) el.style.color = color;
  if (master) el.title = 'Master';
  return el;
}

export function injectStyles(theme: Theme): void {
  if (document.getElementById('pong-ui-style')) return;
  const c = theme.colors;
  const css = `
  #ui { position: fixed; inset: 0; overflow: auto; background: ${c.overlay}; color: ${c.text};
    font: 14px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; z-index: 5;
    padding: max(16px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) 24px max(16px, env(safe-area-inset-left, 0px));
    box-sizing: border-box; }
  #ui[hidden] { display: none !important; }
  #ui * { box-sizing: border-box; }
  #ui .panel { max-width: 1000px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
  #ui h1 { font-size: 28px; margin: 4px 0 0; letter-spacing: 0.04em; text-wrap: balance; color: ${c.text}; border-bottom: 3px solid ${c.gold}; padding-bottom: 6px; display: inline-block; }
  #ui h2 { font-size: 14px; margin: 0; color: ${c.gold}; letter-spacing: 0.08em; text-transform: uppercase; }
  #ui p { margin: 0; }
  #ui .dim { color: ${c.textDim}; }
  #ui .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  #ui .spread { justify-content: space-between; }
  #ui .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px; }
  #ui .cols { display: grid; grid-template-columns: minmax(0, 340px) minmax(0, 1fr); gap: 20px; }
  @media (max-width: 760px) { #ui .cols { grid-template-columns: minmax(0, 1fr); } }
  #ui .box { background: ${c.button}; border: 2px solid ${c.uiEdge}; border-radius: 0; box-shadow: inset 0 -2px 0 rgba(0,0,0,0.35); padding: 12px; min-width: 0; }
  #ui .card { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  #ui .card.pick { cursor: pointer; }
  #ui .card.pick:hover, #ui .card.pick:focus-visible { border-color: ${c.gold}; background: ${c.buttonActive}; }
  #ui .card.taken { opacity: 0.45; cursor: default; }
  #ui .card .badge { font-size: 12px; padding: 1px 6px; border-radius: 3px; }
  #ui .teamA { color: ${c.teamA}; }
  #ui .teamB { color: ${c.teamB}; }
  #ui .badge.teamA { background: ${c.teamA}; color: ${c.background}; }
  #ui .badge.teamB { background: ${c.teamB}; color: ${c.background}; }
  #ui .badge.reward { border: 1px solid ${c.master}; color: ${c.master}; }
  #ui .kv { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: baseline; font-variant-numeric: tabular-nums; }
  #ui .kv > span:last-child { text-align: right; }
  #ui button, #ui select, #ui input[type=text], #ui textarea {
    font: inherit; color: ${c.text}; background: ${c.uiField}; border: 2px solid ${c.uiEdge}; border-radius: 0; padding: 5px 10px; }
  #ui input[type=file] { font: inherit; color: ${c.textDim}; }
  #ui input[type=file]::file-selector-button { font: inherit; color: ${c.text}; background: ${c.uiField}; border: 1px solid ${c.uiEdge}; border-radius: 3px; padding: 6px 10px; margin-right: 10px; cursor: pointer; }
  #ui input::placeholder, #ui textarea::placeholder { color: ${c.textDim}; opacity: 0.7; }
  #ui button { cursor: pointer; }
  #ui button:hover { background: ${c.buttonActive}; }
  #ui button.primary { background: ${c.gold}; color: ${c.background}; border-color: ${c.gold}; font-weight: bold; }
  #ui button.primary:hover { background: ${theme.menu.accentWarm}; }
  #ui button.danger { border-color: ${c.bad}; color: ${c.bad}; }
  #ui button:disabled { opacity: 0.4; cursor: default; }
  #ui button.on { background: ${c.activeRing}; color: ${c.activeText}; border-color: ${c.activeRing}; font-weight: bold; }
  /* Motion: buttons lift on hover and press in, panels and their contents slide in. */
  #ui button { transition: transform 0.12s ease-out, box-shadow 0.12s ease-out, background-color 0.12s, border-color 0.12s; }
  #ui button:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 3px 0 rgba(0,0,0,0.45); }
  #ui button:active:not(:disabled) { transform: translateY(1px) scale(0.97); box-shadow: 0 0 0 rgba(0,0,0,0); transition-duration: 0.05s; }
  #ui button.small { padding: 3px 8px; font-size: 12px; }
  #ui .panel.fresh > * { animation: ui-in 0.28s cubic-bezier(.2,.9,.3,1.2) both; }
  #ui .panel.fresh > *:nth-child(2) { animation-delay: 0.03s; }
  #ui .panel.fresh > *:nth-child(3) { animation-delay: 0.06s; }
  #ui .panel.fresh > *:nth-child(4) { animation-delay: 0.09s; }
  #ui .panel.fresh > *:nth-child(5) { animation-delay: 0.12s; }
  #ui .panel.fresh > *:nth-child(n+6) { animation-delay: 0.15s; }
  @keyframes ui-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  #ui .panel.fresh .pickgrid > button { animation: card-in 0.32s cubic-bezier(.2,.9,.3,1.25) both; animation-delay: calc(var(--i, 0) * 18ms); }
  @keyframes card-in { from { opacity: 0; transform: translateY(10px) scale(0.92); } to { opacity: 1; transform: none; } }
  #ui .pickcard.on { animation: picked 0.45s ease-out; }
  @keyframes picked { 0% { box-shadow: 0 0 0 2px ${c.gold}, 0 0 0 0 rgba(255, 214, 110, 0.7); } 100% { box-shadow: 0 0 0 2px ${c.gold}, 0 0 0 12px rgba(255, 214, 110, 0); } }
  #ui .pickcard.taken { opacity: 0.6; }
  /* Players: the lineup at the table. */
  #ui .lineup { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: stretch; }
  #ui .team-col { display: flex; flex-direction: column; gap: 8px; padding: 10px; border: 2px solid ${c.uiEdge}; background: rgba(10, 9, 8, 0.55); position: relative; }
  #ui .team-col.teamA { border-color: ${c.teamA}; box-shadow: inset 4px 0 0 ${c.teamA}; }
  #ui .team-col.teamB { border-color: ${c.teamB}; box-shadow: inset -4px 0 0 ${c.teamB}; }
  #ui .team-col.mine { background: linear-gradient(180deg, rgba(230, 196, 90, 0.12), rgba(10, 9, 8, 0.55)); }
  #ui .team-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-weight: bold; letter-spacing: 0.08em; text-transform: uppercase; font-size: 13px; }
  #ui .team-col.teamA .team-head > span { color: ${c.teamA}; }
  #ui .team-col.teamB .team-head > span { color: ${c.teamB}; }
  #ui .team-spots { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
  #ui .spot { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 6px 10px; background: ${c.button}; position: relative; overflow: hidden; }
  #ui .panel.fresh .spot { animation: card-in 0.34s cubic-bezier(.2,.9,.3,1.25) both; animation-delay: calc(var(--i, 0) * 45ms); }
  #ui .spot.on .spot-art canvas { animation: hop 0.35s cubic-bezier(.2,.9,.3,1.4); }
  @keyframes hop { 0% { transform: translateY(0); } 40% { transform: translateY(-8px); } 100% { transform: translateY(0); } }
  #ui .spot .spot-art { display: grid; place-items: end center; height: 112px; }
  #ui .spot .spot-art canvas { image-rendering: pixelated; transition: transform 0.18s cubic-bezier(.2,.9,.3,1.4); }
  #ui .spot:hover .spot-art canvas { transform: translateY(-4px) scale(1.04); }
  #ui .spot .spot-role { font-size: 11px; color: ${c.textDim}; letter-spacing: 0.04em; }
  #ui .spot .spot-name { font-weight: bold; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #ui .spot.on { border-color: ${c.gold}; background: #4a3f24; box-shadow: 0 0 0 2px ${c.gold}; color: ${c.text}; font-weight: normal; }
  #ui .spot.on .spot-role { color: ${c.gold}; }
  #ui .team-head { min-height: 26px; }
  #ui .spot.on::after { content: ''; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, rgba(255, 240, 200, 0.22) 50%, transparent 70%); background-size: 250% 100%; animation: shine 1.8s linear infinite; pointer-events: none; }
  @keyframes shine { from { background-position: 150% 0; } to { background-position: -100% 0; } }
  #ui .vs-badge { align-self: center; font-weight: bold; font-size: 22px; color: ${c.gold}; text-shadow: 2px 2px 0 #000; animation: vs-pulse 2.4s ease-in-out infinite; }
  @keyframes vs-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.12); } }
  @media (max-width: 640px) { #ui .lineup { grid-template-columns: 1fr; } #ui .vs-badge { justify-self: center; } }
  @media (prefers-reduced-motion: reduce) { #ui *, #ui *::after { animation: none !important; transition: none !important; } }
  #ui :focus-visible { outline: 2px solid ${c.activeRing}; outline-offset: 2px; }
  #ui textarea { width: 100%; min-height: 220px; font-size: 12px; }
  #ui input[type=range] { width: 100%; accent-color: ${c.gold}; }
  #ui .stat { display: grid; grid-template-columns: 90px minmax(0, 1fr) 28px; gap: 8px; align-items: center; }
  #ui .bar { height: 8px; background: ${c.uiField}; border-radius: 4px; overflow: hidden; width: 100%; }
  #ui .bar > i { display: block; height: 100%; background: ${c.gold}; }
  #ui .statline { display: grid; grid-template-columns: 74px minmax(0, 1fr) 18px; gap: 6px; align-items: center; font-size: 12px; width: 100%; font-variant-numeric: tabular-nums; }
  #ui .name { font-weight: bold; }
  #ui .name.master { color: ${c.master}; text-shadow: 0 0 6px ${c.masterGlow}; }
  #ui .sprite { image-rendering: pixelated; display: block; }
  #ui .swatch { width: 26px; height: 26px; padding: 0; border-radius: 4px; }
  #ui .swatch.on { outline: 2px solid ${c.activeRing}; outline-offset: 1px; }
  #ui .error { color: ${c.bad}; }
  #ui .ok { color: ${c.good}; }
  #ui .pixelgrid { image-rendering: pixelated; touch-action: none; cursor: crosshair; border: 1px solid ${c.uiEdge};
    background: repeating-conic-gradient(${c.uiField} 0 25%, ${c.button} 0 50%) 0 0 / 14px 14px; max-width: 100%; }
  #ui .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  #ui .look { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 18px; align-items: start; }
  #ui .look-preview { position: sticky; top: 0; display: flex; flex-direction: column; gap: 10px; }
  #ui .look-tools { min-width: 0; }
  @media (max-width: 760px) { #ui .look { grid-template-columns: minmax(0, 1fr); } #ui .look-preview { position: static; } }
  #ui .cols2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
  @media (max-width: 760px) { #ui .cols2 { grid-template-columns: minmax(0, 1fr); } }
  #ui .sprite-stage { display: flex; justify-content: center; gap: 22px; padding: 14px 8px 8px; border-radius: 4px;
    background: radial-gradient(ellipse at 50% 85%, #6a311f 0 38%, #3a2416 70%); border: 1px solid ${c.uiEdge}; }
  #ui .tabs { display: flex; flex-wrap: wrap; gap: 4px; }
  #ui .tabs button.on { background: ${c.gold}; color: ${c.background}; border-color: ${c.gold}; font-weight: bold; }
  #ui .part { display: flex; flex-direction: column; gap: 6px; padding-top: 10px; border-top: 1px solid ${c.uiEdge}; }
  #ui .part-label { color: ${c.gold}; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: bold; }
  #ui .thumbs { display: flex; flex-wrap: wrap; gap: 6px; }
  #ui .thumb { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 5px 4px 3px; min-width: 70px;
    background: #4a3f34; border: 1px solid ${c.uiEdge}; border-radius: 3px; }
  #ui .thumb span { font-size: 10px; color: ${c.text}; white-space: nowrap; max-width: 84px; overflow: hidden; text-overflow: ellipsis; }
  #ui .thumb:hover { border-color: ${c.gold}; background: #5a4d3e; }
  #ui .thumb.on { border: 2px solid ${c.gold}; background: #6a5a3a; padding: 4px 3px 2px; }
  #ui .grid.wide { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
  #ui .card.locked { opacity: 0.6; border-style: dashed; }
  #ui .card.locked .table-shot { filter: grayscale(1) brightness(0.45); }
  #ui .table-shot { width: 100%; aspect-ratio: 16 / 9; image-rendering: pixelated; display: block; border: 1px solid ${c.uiEdge}; }
  #ui .badge.status-pending { border: 1px solid ${c.gold}; color: ${c.gold}; }
  #ui .badge.status-approved { border: 1px solid ${c.good}; color: ${c.good}; }
  #ui .badge.status-rejected { border: 1px solid ${c.bad}; color: ${c.bad}; }
  #ui .badge { font-size: 12px; padding: 1px 6px; border-radius: 3px; align-self: flex-start; }
  #ui .loot-head { display: flex; flex-wrap: wrap; gap: 18px; align-items: center; }
  #ui .loot-box-col { display: flex; flex-direction: column; align-items: center; gap: 10px; }
  /* A pixel-style crate: gold lid (b) over a dark body (i), with a count. */
  #ui .loot-box { position: relative; width: 64px; height: 52px; }
  #ui .loot-box i { position: absolute; left: 4px; right: 4px; bottom: 0; height: 34px; background: #3a2416; border: 3px solid ${c.gold}; box-shadow: inset 0 0 0 3px #1a1410; }
  #ui .loot-box b { position: absolute; left: 0; right: 0; top: 4px; height: 16px; background: ${c.gold}; border: 3px solid #1a1410; }
  #ui .loot-box i::after { content: 'Ζ'; position: absolute; inset: 0; display: grid; place-items: center; color: ${c.gold}; font: bold 18px serif; }
  #ui .loot-box .count { position: absolute; right: -10px; top: -8px; min-width: 22px; height: 22px; padding: 0 5px; display: grid; place-items: center;
    background: ${c.bad}; color: #fff; font-weight: bold; font-size: 12px; border: 2px solid #1a1410; }
  #ui .loot-box.ready { animation: loot-shake 1.6s ease-in-out infinite; }
  #ui .loot-box.ready b { animation: loot-lid 1.6s ease-in-out infinite; }
  @keyframes loot-shake { 0%, 70%, 100% { transform: rotate(0); } 75% { transform: rotate(-6deg); } 85% { transform: rotate(6deg); } 95% { transform: rotate(-3deg); } }
  @keyframes loot-lid { 0%, 70%, 100% { transform: translateY(0); } 80% { transform: translateY(-5px); } }
  #ui .loot-reveal { position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center;
    border-color: ${c.gold}; animation: reveal-in 0.5s cubic-bezier(.2,1.4,.4,1) both; }
  #ui .loot-reveal .reveal-art { position: relative; animation: reveal-pop 0.7s 0.15s cubic-bezier(.2,1.6,.4,1) both; }
  #ui .loot-reveal .reveal-art .table-shot { width: min(360px, 80vw); }
  #ui .loot-reveal .burst { position: absolute; left: 50%; top: 55%; width: 640px; height: 640px; margin: -320px 0 0 -320px; pointer-events: none;
    background: repeating-conic-gradient(rgba(255, 210, 90, 0.16) 0 10deg, transparent 10deg 20deg); animation: burst-spin 12s linear infinite, burst-fade 0.8s ease-out both; }
  #ui .loot-reveal > :not(.burst) { position: relative; }
  @keyframes reveal-in { from { transform: scale(0.85); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes reveal-pop { from { transform: scale(0.2) rotate(-12deg); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes burst-spin { to { transform: rotate(360deg); } }
  @keyframes burst-fade { from { opacity: 0; } to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { #ui .loot-box.ready, #ui .loot-box.ready b, #ui .loot-reveal, #ui .loot-reveal .reveal-art, #ui .loot-reveal .burst { animation: none; } }
  #ui .pickgrid { display: grid; gap: 10px; }
  #ui .pickgrid.tables { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
  #ui .pickgrid.chars { grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); }
  #ui .pickcard { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 8px 6px; min-width: 0; background: ${c.button}; }
  #ui .pickcard .name, #ui .pickcard .pickname { font-size: 13px; font-weight: bold; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #ui .pickcard.on { border-color: ${c.gold}; background: #4a3f24; box-shadow: 0 0 0 2px ${c.gold}; color: ${c.text}; font-weight: normal; }
  #ui .pickcard.locked { opacity: 0.5; }
  #ui .pickcard.locked .table-shot { filter: grayscale(1) brightness(0.45); }
  #ui .pickcard:hover:not(:disabled) { border-color: ${c.gold}; }
  #ui .slots { display: flex; flex-wrap: wrap; gap: 10px; align-items: stretch; }
  #ui .slot { display: flex; gap: 10px; align-items: center; min-width: 190px; padding: 6px 12px; text-align: left; }
  #ui .slot.on { border-color: ${c.gold}; box-shadow: 0 0 0 2px ${c.gold}; background: #4a3f24; color: ${c.text}; font-weight: normal; }
  #ui .slot-random { display: grid; place-items: center; width: 34px; height: 46px; border: 2px dashed ${c.uiEdge}; color: ${c.gold}; font-weight: bold; font-size: 20px; }
  #ui .slot-random.big { width: 48px; height: 66px; font-size: 28px; }
  #ui .slot.cpu { border-color: ${c.teamB}; }
  #ui .slot.cpu.on { box-shadow: 0 0 0 2px ${c.teamB}; background: #1f2a44; }
  #ui .passive-slot { display: flex; align-items: center; min-height: 44px; padding: 8px 10px; border: 2px dashed ${c.uiEdge}; }
  #ui .passive-slot.filled { border-style: solid; border-color: ${c.gold}; background: rgba(230, 196, 90, 0.08); }
  #ui .passive-icon { display: grid; place-items: center; width: 28px; height: 28px; border: 2px solid ${c.gold}; font-size: 15px; }
  #ui .badge.passive { border-color: ${c.gold}; color: ${c.gold}; }
  #ui .vs-mark { align-self: center; font-weight: bold; letter-spacing: 0.1em; color: ${c.gold}; padding: 0 4px; }
  #ui .side-toggle { display: flex; flex-direction: column; gap: 4px; justify-content: center; margin-left: auto; }
  #ui .help { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 12px 18px; align-items: baseline; }
  #ui .help p { line-height: 1.55; }
  @media (max-width: 560px) { #ui .help { grid-template-columns: minmax(0, 1fr); gap: 4px; } #ui .help h2 { margin-top: 10px; } }
  #ui .role-badge { font-size: 12px; font-weight: bold; letter-spacing: 0.1em; padding: 3px 8px; border: 2px solid ${c.uiEdge}; color: ${c.text}; }
  #ui .role-badge.role-moderator { background: ${c.gold}; color: ${c.background}; border-color: ${c.gold}; }
  #ui .role-badge.role-player { border-color: ${c.good}; color: ${c.good}; }
  #ui .role-badge.role-guest { color: ${c.textDim}; }
  #ui .profile-head { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; }
  #ui .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
  #ui .stat-tile { display: flex; flex-direction: column; gap: 4px; }
  #ui .stat-tile b { font-size: 18px; }
  #ui ul.powers { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
  #ui .board { display: flex; flex-direction: column; gap: 4px; }
  #ui .board-row { display: grid; grid-template-columns: 48px minmax(0, 1fr) 70px 100px; gap: 10px; align-items: center; padding: 8px 12px; background: ${c.button}; border: 2px solid ${c.uiEdge}; font-variant-numeric: tabular-nums; }
  #ui .board-row > span:nth-child(n+3) { text-align: right; }
  #ui .board-row.head { background: transparent; border-color: transparent; color: ${c.gold}; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
  #ui .board-row.me { border-color: ${c.gold}; background: #3a321e; }
  #ui .board-row.top1 .rank, #ui .board-row.top2 .rank, #ui .board-row.top3 .rank { font-size: 20px; }
  #ui .board-row .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #ui .lobby-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; }
  #ui .invite { border-color: ${c.gold}; background: #3a321e; animation: reveal-in 0.4s both; }
  #ui label.check { display: flex; gap: 6px; align-items: center; cursor: pointer; }
  ${NAME_STYLE_CSS(c.gold)}
  `;
  document.head.append(h('style', { id: 'pong-ui-style' }, css));
}

/** The overlay that holds whichever HTML screen is open. */
export class Overlay {
  readonly root: HTMLDivElement;

  constructor() {
    this.root = h('div', { id: 'ui', hidden: true });
    document.body.append(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /** Show a screen. `keepScroll` re-renders the same screen in place (no jump back to the top). */
  show(panel: HTMLElement, keepScroll = false): void {
    // Entrance animations play when a different screen opens, not on every refresh of the same one.
    const title = panel.querySelector('h1')?.textContent ?? '';
    if (this.root.hidden || title !== this.lastTitle) panel.classList.add('fresh');
    this.lastTitle = title;
    const y = this.root.scrollTop;
    const focusId = keepScroll ? (document.activeElement as HTMLElement | null)?.id : undefined;
    this.root.replaceChildren(panel);
    this.root.hidden = false;
    this.root.scrollTop = keepScroll ? y : 0;
    if (focusId) document.getElementById(focusId)?.focus();
  }

  isOpen(): boolean {
    return !this.root.hidden;
  }

  private lastTitle = '';

  hide(): void {
    this.lastTitle = '';
    this.root.hidden = true;
    this.root.replaceChildren();
  }
}
