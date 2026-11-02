import { describe, expect, it } from 'vitest';
import { makeConfig } from '../src/config';
import { newCharacter } from '../src/core/character';
import { Menu } from '../src/ui/menu';
import { loadSelection, pinnedFor, playingAsLabel } from '../src/ui/picker';
import { quickRoster } from '../src/ui/prematch';

const chars = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'].map((n) => newCharacter(n));

describe('home-screen picks', () => {
  it('quick matches put the picked characters on the player’s side', () => {
    const cfg = makeConfig({ players: { mode: 'versus', cpu: 'medium', mySide: 'B' } });
    const sel = { design: 'plain' as const, chars: [chars[0].id, chars[1].id], mySide: 'B' as const };
    const pins = pinnedFor(cfg, sel, chars);
    expect(Object.keys(pins).sort()).toEqual(['B-left', 'B-right']);
    const r = quickRoster(chars, 2, Math.random, pins);
    expect(r['B-left'].name).toBe('Alpha');
    expect(r['B-right'].name).toBe('Bravo');
    const others = [r['A-left'].characterId, r['A-right'].characterId];
    expect(others).not.toContain(chars[0].id);
    expect(others).not.toContain(chars[1].id);
    expect(playingAsLabel(cfg, sel, chars)).toBe('Alpha & Bravo (B)');
  });

  it('1v1 vs CPU: one pick plays both halves of Team A; locked or missing picks are random', () => {
    const cfg = makeConfig({ teamSize: 1, players: { mode: 'coop', cpu: 'medium' } });
    const sel = { design: 'plain' as const, chars: [chars[2].id, null], mySide: 'B' as const };
    const pins = pinnedFor(cfg, sel, chars);
    expect(pins['A-left']?.name).toBe('Charlie');
    expect(pins['A-right']?.name).toBe('Charlie');
    expect(pinnedFor(cfg, sel, chars.slice(3))).toEqual({});
    expect(playingAsLabel(cfg, sel, chars.slice(3))).toBe('Random');
  });

  it('the Table row opens the picker, and a pick sticks unless it is locked', () => {
    const m = new Menu();
    m.focus('table');
    expect(m.activate()).toBe('pickTable');
    m.setDesign('pitch');
    expect(m.config().design).toBe('pitch');
    m.tableLocked = (d) => d === 'larks';
    m.setDesign('larks');
    expect(m.config().design).toBe('pitch');
    expect(m.rows().find((r) => r.label === 'Playing as')?.action).toBe('pickCharacters');
  });

  it('reads saved picks defensively', () => {
    expect(loadSelection('garbage')).toEqual({ design: 'plain', chars: [null, null], mySide: 'A' });
    expect(loadSelection(JSON.stringify({ design: 'deco', chars: ['x', 5], mySide: 'B' }))).toEqual({ design: 'deco', chars: ['x', null], mySide: 'B' });
  });
});
