import { describe, expect, it } from 'vitest';
import { makeConfig } from '../src/config';
import { newCharacter, type Character } from '../src/core/character';
import { CpuController } from '../src/game/ai';
import { Game, genericRoster } from '../src/game/game';
import { packChar, presenceIssue } from '../src/net/online';
import { DEFAULT_NAME_STYLE } from '../src/progress/nameStyles';

// One of the moderator's real characters, as stored in the shared collection.
const REAL = {"cosmetics": {"badges": [], "celebration": null, "nameColor": null, "spriteItem": null}, "createdAt": "2026-11-02T02:31:19.150Z", "hitStyles": ["standardHit", "lob", "flatFast"], "id": "c-mvyn76um-1q4z0b", "level": 1, "master": false, "name": "Woodstock", "serveStyles": ["standardServe"], "sprite": {"parts": {"accessory": 1, "build": 2, "eyes": 2, "faceShape": 1, "facialHair": 4, "hairColor": 0, "hairStyle": 12, "hatColor": 4, "headwear": 1, "mouth": 0, "pantsColor": 6, "pantsStyle": 2, "shirtColor": 0, "shirtStyle": 0, "shoes": 0, "skin": 1}, "pixels": null}, "stats": {"accuracy": 6, "power": 7, "saves": 3, "serve": 4, "spin": 4}, "updatedAt": "2026-11-02T02:58:59.078Z"} as unknown as Character;

describe('room presence stays inside the platform bounds', () => {
  it('flags what the room refuses', () => {
    expect(presenceIssue({ a: 1 })).toBeNull();
    expect(presenceIssue({ 'c-1': 1 })).toBeNull();
    expect(presenceIssue({ '1abc': 1 })).toMatch(/identifier/);
    expect(presenceIssue({ a: 'x\ny' })).toMatch(/control/);
    expect(presenceIssue({ a: NaN })).toMatch(/finite/);
    expect(presenceIssue({ a: undefined })).toMatch(/not JSON/);
    expect(presenceIssue({ a: 'x'.repeat(5000) })).toMatch(/1 KiB/);
  });

  it('every host state of a whole match', () => {
    const cfg = makeConfig({ teamSize: 1, formation: 'tree' });
    let seed = 5;
    const r = () => ((seed = (seed * 16807) % 2147483647), seed / 2147483647);
    const host = new Game(cfg, r, genericRoster(1));
    const a = new CpuController('A', 'medium', r);
    const b = new CpuController('B', 'medium', r);
    const issues = new Set<string>();
    for (let t = 0; t < 2000 && host.engine.peek().phase !== 'gameOver'; t += 1 / 60) {
      host.update(1 / 60, { A: a.input(host), B: b.input(host) });
      if (Math.round(t * 60) % 3 === 0) {
        // The host's whole lobby presence while it plays: its card (no character) plus the match state.
        const e = presenceIssue({ pz: 1, name: 'Somebody Long Name', level: 12, style: DEFAULT_NAME_STYLE, status: 'playing', mid: 'abcd1234', net: host.netState() });
        if (e) issues.add(e.replace(/\[\d+\]/g, '[]'));
      }
    }
    expect([...issues]).toEqual([]);
  });

  it('lobby cards for real characters', () => {
    const chars: Character[] = [newCharacter('Plain'), REAL];
    for (const c of chars) {
      const card = { pz: 1, name: 'Somebody Long Name', level: 12, style: DEFAULT_NAME_STYLE, status: 'lobby', char: packChar(c), invite: { to: 'k3v6q2rt7wacd4fn', id: 'abcd1234', settings: { design: 'plain', venue: 'saints', formation: 'tree', speed: 0.62, ski: false } }, answer: null };
      expect(presenceIssue(card), c.name).toBeNull();
    }
  });
});
