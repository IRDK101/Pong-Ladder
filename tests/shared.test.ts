import { describe, expect, it } from 'vitest';
import { newCharacter } from '../src/core/character';
import { quickRoster } from '../src/ui/prematch';
import { characterFromDoc, needsUpload, sharedDocId } from '../src/data/shared';
import { AppStore, memoryStore } from '../src/data/storage';

function named(name: string, updatedAt = '2026-01-01T00:00:00.000Z') {
  const c = newCharacter(name);
  c.updatedAt = updatedAt;
  return c;
}

describe('shared character collection', () => {
  it('merges shared and local characters, newest copy winning', () => {
    const store = new AppStore(memoryStore());
    const a = named('Alpha');
    const b = named('Bravo');
    store.characters.save(a);
    const newerA = { ...a, name: 'Alpha Two', updatedAt: '2026-02-01T00:00:00.000Z' };
    store.characters.setShared([newerA, b]);
    const names = store.characters.list().map((c) => c.name).sort();
    expect(names).toEqual(['Alpha Two', 'Bravo']);
    expect(store.characters.localList().map((c) => c.name)).toEqual(['Alpha']);
    expect(store.characters.get(b.id)?.name).toBe('Bravo');
  });

  it('passes saves and deletes to listeners', () => {
    const store = new AppStore(memoryStore());
    const seen: string[] = [];
    store.characters.listen({ save: (c) => seen.push(`save ${c.name}`), remove: (id) => seen.push(`remove ${id}`) });
    const a = named('Alpha');
    store.characters.save(a);
    store.characters.remove(a.id);
    expect(seen).toEqual(['save Alpha', `remove ${a.id}`]);
  });

  it('uploads only characters the collection is missing or has older copies of', () => {
    const a = named('Alpha', '2026-03-01T00:00:00.000Z');
    const b = named('Bravo');
    const c = named('Charlie');
    const shared = [{ ...a, updatedAt: '2026-01-01T00:00:00.000Z' }, b];
    expect(needsUpload([a, b, c], shared).map((x) => x.name)).toEqual(['Alpha', 'Charlie']);
  });

  it('reads only valid characters from documents', () => {
    expect(characterFromDoc({ character: named('Alpha') })?.name).toBe('Alpha');
    expect(characterFromDoc({ character: { id: 'x' } })).toBeNull();
    expect(characterFromDoc(undefined)).toBeNull();
    expect(sharedDocId('c-abc-123')).toBe('c-abc-123');
    expect(sharedDocId('a/b')).toBeNull();
  });

  it('quick matches use collection characters, generic players filling gaps', () => {
    const chars = ['A', 'B', 'C', 'D', 'E'].map((n) => named(n));
    const r = quickRoster(chars, 2, () => 0.5);
    const ids = new Set(Object.values(r).map((p) => p.characterId));
    expect(ids.size).toBe(4);
    expect([...ids].every((id) => chars.some((c) => c.id === id))).toBe(true);
    const few = quickRoster(chars.slice(0, 1), 2);
    expect(Object.values(few).filter((p) => p.characterId).length).toBe(1);
    const solo = quickRoster(chars, 1);
    expect(solo['A-left']).toBe(solo['A-right']);
    expect(solo['A-left'].characterId).not.toBe(solo['B-left'].characterId);
  });
});
