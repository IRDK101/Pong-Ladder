import { describe, expect, it } from 'vitest';
import { makeConfig } from '../src/config';
import { newCharacter } from '../src/core/character';
import { Account } from '../src/data/shared';
import { AppStore, memoryStore } from '../src/data/storage';

import { allowedStyle, cleanNameStyle, DEFAULT_NAME_STYLE, NAME_COLORS, NAME_EFFECTS, NAME_FLAIRS, styleUnlocked } from '../src/progress/nameStyles';
import { cardOf, unpackChar } from '../src/net/online';

const cfg = makeConfig();

function signedIn(owner = false) {
  const a = new Account(new AppStore(memoryStore()), cfg, memoryStore());
  const writes: Record<string, unknown> = {};
  (a as unknown as { db: unknown }).db = { doc: (p: string) => ({ set: async (v: unknown) => void (writes[p] = v) }) };
  a.mode = 'online';
  a.uid = 'u1';
  a.owner = owner;
  return { a, writes };
}

describe('name styles', () => {
  it('ids are unique and every part has a level-1 default', () => {
    for (const list of [NAME_COLORS, NAME_EFFECTS, NAME_FLAIRS]) {
      expect(new Set(list.map((o) => o.id)).size).toBe(list.length);
      expect(list[0].level).toBe(1);
    }
    expect(styleUnlocked('color', DEFAULT_NAME_STYLE.color, 1)).toBe(true);
  });

  it('cleans unknown or missing parts back to the defaults', () => {
    expect(cleanNameStyle(null)).toEqual(DEFAULT_NAME_STYLE);
    expect(cleanNameStyle({ color: 'gold', effect: 'nope', flair: 7 })).toEqual({ ...DEFAULT_NAME_STYLE, color: 'gold' });
  });

  it('locks options above the player level, except for the moderator', () => {
    const top = { color: 'rainbow', effect: 'pulse', flair: 'crown' };
    expect(allowedStyle(top, 1)).toEqual(DEFAULT_NAME_STYLE);
    expect(allowedStyle(top, 1, true)).toEqual(top);
    expect(allowedStyle(top, 99)).toEqual(top);
  });
});

describe('editing a profile', () => {
  it('an approved player can rename themselves; the moderator sees the old name', () => {
    const { a, writes } = signedIn();
    a.profiles.set('u2', { name: 'Taken', xp: 0, level: 1, requestedAt: '', updatedAt: '' });
    expect(a.createProfile('Ari')).toBeNull();
    a.approvals.set('u1', { status: 'approved', at: '' });
    expect(a.createProfile('taken')).toMatch(/already/);
    expect(a.createProfile('Ari R')).toBeNull();
    expect(a.myProfile?.name).toBe('Ari R');
    expect(a.myProfile?.renamedFrom).toBe('Ari');
    expect(writes['profiles/u1']).toBeTruthy();
    a.approvals.set('u1', { status: 'revoked', at: '' });
    expect(a.createProfile('Other')).toMatch(/paused/);
  });

  it('styles above your level are refused; unlocked ones save to the card', () => {
    const { a } = signedIn();
    expect(a.setNameStyle({ color: 'green', effect: 'none', flair: 'none' })).toMatch(/profile first/);
    a.createProfile('Ari');
    expect(a.setNameStyle({ color: 'rainbow', effect: 'none', flair: 'none' })).toMatch(/higher player level/);
    expect(a.myStyle).toEqual(DEFAULT_NAME_STYLE);
    expect(a.setNameStyle({ color: 'green', effect: 'shadow', flair: 'paddle' })).toBeNull();
    expect(a.myStyle).toEqual({ color: 'green', effect: 'shadow', flair: 'paddle' });
    // Keeps the style through a rename.
    a.createProfile('Ari2');
    expect(a.myStyle.flair).toBe('paddle');
  });

  it('the moderator can use every style', () => {
    const { a } = signedIn(true);
    a.createProfile('Mod');
    expect(a.setNameStyle({ color: 'rainbow', effect: 'pulse', flair: 'crown' })).toBeNull();
  });

  it('the character shown on the card follows the one you play as', () => {
    const { a } = signedIn();
    a.createProfile('Ari');
    const c = newCharacter('Ferb');
    a.setShowcase(c);
    expect(unpackChar(a.myProfile?.char)?.name).toBe('Ferb');
    a.setShowcase(null);
    expect(a.myProfile?.char).toBeNull();
  });

  it('lobby cards carry the style, cleaned', () => {
    expect(cardOf({ presence: { pz: 1, name: 'X', style: { color: 'gold', effect: 'bad' } } })?.style).toEqual({ ...DEFAULT_NAME_STYLE, color: 'gold' });
  });
});

describe('loading an account on a new device', () => {
  it('does not write over saved progress when the characters arrive first', async () => {
    const saved = { v: 1, charXp: { a: 900 }, tables: ['plain', 'saints'], characters: ['a', 'b'], opened: [], equipped: {}, seeded: true };
    const docs: Record<string, unknown> = { 'data/users/u1/progress': saved };
    const docSubs: Record<string, (s: unknown) => void> = {};
    const colSubs: Record<string, (s: unknown) => void> = {};
    const snap = (id: string, d: unknown) => ({ id, exists: d !== undefined, data: () => d, metadata: { fromCache: false } });
    const db = {
      doc: (p: string) => ({
        set: async (v: unknown) => void (docs[p] = v),
        update: async () => {},
        delete: async () => {},
        onSnapshot: (next: (s: unknown) => void) => ((docSubs[p] = next), () => {}),
      }),
      collection: (name: string) => ({ onSnapshot: (next: (s: unknown) => void) => ((colSubs[name] = next), () => {}) }),
    };
    const user = { isOwner: async () => false, id: async () => 'u1', me: async () => ({ name: 'A', email: null }), can: async () => true, profiles: async () => ({}) };
    (globalThis as unknown as { window: unknown }).window = { claude: { use: async (n: string) => (n === 'db' ? db : n === 'user' ? user : null) } };
    try {
      const a = new Account(new AppStore(memoryStore()), cfg, memoryStore());
      await a.connect();
      const chars = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ ...newCharacter(id), id }));
      // The character list lands before the account's progress.
      colSubs.characters({ docs: chars.map((c) => snap(c.id, { character: c })), metadata: { fromCache: false } });
      await new Promise((r) => setTimeout(r, 0));
      expect(docs['data/users/u1/progress']).toBe(saved);
      docSubs['data/users/u1/progress'](snap('progress', saved));
      expect(a.progress.charXp.a).toBe(900);
      expect(a.tableUnlocked('saints')).toBe(true);
    } finally {
      delete (globalThis as unknown as { window?: unknown }).window;
    }
  });
});

describe('profile requests', () => {
  it('reports a request as sent only once the server accepts it, and handles a refusal', async () => {
    const a = new Account(new AppStore(memoryStore()), cfg, memoryStore());
    (a as unknown as { db: unknown }).db = { doc: () => ({ set: async () => {} }) };
    a.mode = 'online';
    a.uid = 'u1';
    expect(a.createProfile('Ari')).toBeNull();
    expect(a.profileState).toBe('sending');
    await new Promise((r) => setTimeout(r, 0));
    expect(a.profileState).toBe('sent');
    expect(a.role).toBe('pending');

    const b = new Account(new AppStore(memoryStore()), cfg, memoryStore());
    (b as unknown as { db: unknown }).db = { doc: () => ({ set: async () => { throw { code: 'invalid_argument' }; } }) };
    b.mode = 'online';
    b.uid = 'u2';
    b.createProfile('Sam');
    await new Promise((r) => setTimeout(r, 0));
    expect(b.profileState).toBe('refused');
    expect(b.myProfile).toBeNull();
    expect(b.role).toBe('viewonly');
  });

  it('a signed-in visitor with no account id (outside public link) is view-only, not a guest', async () => {
    const db = { doc: () => ({ onSnapshot: () => () => {}, set: async () => {} }), collection: () => ({ onSnapshot: () => () => {} }) };
    const user = { isOwner: async () => false, id: async () => null, me: async () => ({ name: '', email: null }), can: async () => null, profiles: async () => ({}) };
    (globalThis as unknown as { window: unknown }).window = { claude: { use: async (n: string) => (n === 'db' ? db : n === 'user' ? user : null) } };
    try {
      const a = new Account(new AppStore(memoryStore()), cfg, memoryStore());
      await a.connect();
      expect(a.role).toBe('viewonly');
      expect(a.createProfile('X')).toMatch(/Sign in|access/);
    } finally {
      delete (globalThis as unknown as { window?: unknown }).window;
    }
  });
});
