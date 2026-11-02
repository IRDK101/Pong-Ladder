// The shared character collection: when the game runs as a published page
// with a database, the owner's characters (and anyone else's who may edit)
// live in one collection that every player who opens the game sees. Each
// character is one document, characters/<id>, holding { character }.
//
// Without a database (opened as a plain file, signed out, or a view that
// cannot run it) nothing here happens and characters stay in this browser.

import { validateCharacter, type Character } from '../core/character';
import type { CharacterCollection } from './storage';

interface DocSnap {
  id: string;
  data(): Record<string, unknown> | undefined;
}
interface QuerySnap {
  docs: DocSnap[];
  metadata: { fromCache: boolean };
}
interface DocRef {
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
interface Db {
  doc(path: string): DocRef;
  collection(path: string): { onSnapshot(next: (s: QuerySnap) => void, error?: (e: { code: string }) => void): () => void };
}
interface UserApi {
  canEdit(): Promise<boolean>;
}
type ClaudeApi = { use(name: string): Promise<unknown> };

const COLLECTION = 'characters';

/** Document ids allow letters, digits and _ - . ~ : @ + only. */
export function sharedDocId(id: string): string | null {
  return /^[A-Za-z0-9_\-~:@+.]{1,200}$/.test(id) && id !== '.' && id !== '..' ? id : null;
}

/** A shared document's character, or null if it is not a usable one. */
export function characterFromDoc(data: Record<string, unknown> | undefined): Character | null {
  const c = data?.character as Character | undefined;
  if (!c || typeof c.id !== 'string') return null;
  try {
    return validateCharacter(c).length === 0 ? c : null;
  } catch {
    return null;
  }
}

/** Local characters the shared collection is missing or has an older copy of. */
export function needsUpload(local: Character[], shared: Character[]): Character[] {
  const have = new Map(shared.map((c) => [c.id, c]));
  return local.filter((c) => {
    if (!sharedDocId(c.id) || validateCharacter(c).length) return false;
    const s = have.get(c.id);
    return !s || (c.updatedAt ?? '') > (s.updatedAt ?? '');
  });
}

/**
 * Connect the character collection to the shared database. `changed` runs
 * whenever the shared characters change (another player added one, say).
 */
export async function connectSharedCharacters(chars: CharacterCollection, changed: () => void): Promise<void> {
  const claude = (window as unknown as { claude?: ClaudeApi }).claude;
  if (!claude?.use) return;
  let db: Db | null = null;
  let user: UserApi | null = null;
  try {
    [db, user] = (await Promise.all([claude.use('db'), claude.use('user')])) as [Db | null, UserApi | null];
  } catch {
    return;
  }
  if (!db) return;
  const store = db;
  // Only the owner (and editors) add to the shared collection; everyone else just plays with it.
  let canWrite = false;
  try {
    canWrite = user ? await user.canEdit() : false;
  } catch {
    canWrite = false;
  }

  // One write at a time per character; a later save replaces a queued one.
  const pending = new Map<string, Character | null>();
  const busy = new Set<string>();
  const flush = async (docId: string): Promise<void> => {
    if (busy.has(docId) || !pending.has(docId)) return;
    const c = pending.get(docId)!;
    pending.delete(docId);
    busy.add(docId);
    try {
      const ref = store.doc(`${COLLECTION}/${docId}`);
      if (c) await ref.set({ character: JSON.parse(JSON.stringify(c)) as Record<string, unknown> });
      else await ref.delete();
    } catch (e) {
      if ((e as { code?: string })?.code === 'invalid_argument') canWrite = false;
    } finally {
      busy.delete(docId);
      void flush(docId);
    }
  };
  const queue = (id: string, c: Character | null): void => {
    const docId = sharedDocId(id);
    if (!canWrite || !docId) return;
    pending.set(docId, c);
    void flush(docId);
  };

  chars.listen({
    save: (c) => queue(c.id, c),
    remove: (id) => queue(id, null),
  });

  let uploaded = false;
  store.collection(COLLECTION).onSnapshot(
    (snap) => {
      const list = snap.docs.map((d) => characterFromDoc(d.data())).filter((c): c is Character => !!c);
      chars.setShared(list);
      changed();
      // Once the store has answered in full, add the characters only this browser has.
      if (!uploaded && !snap.metadata.fromCache && canWrite) {
        uploaded = true;
        for (const c of needsUpload(chars.localList(), list)) queue(c.id, c);
      }
    },
    () => {
      /* the collection can't be reached this visit: local characters still work */
    },
  );
}
