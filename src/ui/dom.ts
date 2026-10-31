// Small DOM helpers for the HTML screens (character editor, profiles, draft,
// backup) that sit over the canvas. Colors and fonts come from the theme.

import type { Sprite } from '../core/character';
import type { Theme } from '../theme';

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

/** A canvas showing a sprite at an integer scale (cached per sprite object). */
export function spriteCanvas(sprite: Sprite, scale: number): HTMLCanvasElement {
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
  #ui h1 { font-size: 28px; margin: 4px 0 0; letter-spacing: 0.04em; text-wrap: balance; }
  #ui h2 { font-size: 16px; margin: 0; color: ${c.activeRing}; letter-spacing: 0.08em; text-transform: uppercase; }
  #ui p { margin: 0; }
  #ui .dim { color: ${c.textDim}; }
  #ui .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  #ui .spread { justify-content: space-between; }
  #ui .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px; }
  #ui .cols { display: grid; grid-template-columns: minmax(0, 340px) minmax(0, 1fr); gap: 20px; }
  @media (max-width: 760px) { #ui .cols { grid-template-columns: minmax(0, 1fr); } }
  #ui .box { background: ${c.button}; border: 1px solid ${c.tableEdge}; border-radius: 6px; padding: 12px; min-width: 0; }
  #ui .card { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  #ui .card.pick { cursor: pointer; }
  #ui .card.pick:hover, #ui .card.pick:focus-visible { border-color: ${c.activeRing}; }
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
    font: inherit; color: ${c.text}; background: ${c.tableEdge}; border: 1px solid ${c.buttonActive}; border-radius: 4px; padding: 6px 10px; }
  #ui button { cursor: pointer; }
  #ui button:hover { background: ${c.buttonActive}; }
  #ui button.primary { background: ${c.good}; color: ${c.background}; border-color: ${c.good}; font-weight: bold; }
  #ui button.danger { border-color: ${c.bad}; color: ${c.bad}; }
  #ui button:disabled { opacity: 0.4; cursor: default; }
  #ui button.on { background: ${c.buttonActive}; border-color: ${c.activeRing}; }
  #ui :focus-visible { outline: 2px solid ${c.activeRing}; outline-offset: 2px; }
  #ui textarea { width: 100%; min-height: 220px; font-size: 12px; }
  #ui input[type=range] { width: 100%; accent-color: ${c.activeRing}; }
  #ui .stat { display: grid; grid-template-columns: 90px minmax(0, 1fr) 28px; gap: 8px; align-items: center; }
  #ui .bar { height: 8px; background: ${c.tableEdge}; border-radius: 4px; overflow: hidden; width: 100%; }
  #ui .bar > i { display: block; height: 100%; background: ${c.activeRing}; }
  #ui .statline { display: grid; grid-template-columns: 74px minmax(0, 1fr) 18px; gap: 6px; align-items: center; font-size: 12px; width: 100%; font-variant-numeric: tabular-nums; }
  #ui .name { font-weight: bold; }
  #ui .name.master { color: ${c.master}; text-shadow: 0 0 6px ${c.masterGlow}; }
  #ui .sprite { image-rendering: pixelated; display: block; }
  #ui .swatch { width: 26px; height: 26px; padding: 0; border-radius: 4px; }
  #ui .swatch.on { outline: 2px solid ${c.activeRing}; outline-offset: 1px; }
  #ui .error { color: ${c.bad}; }
  #ui .ok { color: ${c.good}; }
  #ui .pixelgrid { image-rendering: pixelated; touch-action: none; cursor: crosshair; border: 1px solid ${c.buttonActive};
    background: repeating-conic-gradient(${c.tableEdge} 0 25%, ${c.button} 0 50%) 0 0 / 14px 14px; max-width: 100%; }
  #ui .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  #ui label.check { display: flex; gap: 6px; align-items: center; cursor: pointer; }
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

  show(panel: HTMLElement): void {
    this.root.replaceChildren(panel);
    this.root.hidden = false;
    this.root.scrollTop = 0;
  }

  hide(): void {
    this.root.hidden = true;
    this.root.replaceChildren();
  }
}
