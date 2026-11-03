// Checks the database rules against the local Firebase emulators.
// Start them first (see SELF_HOSTING.md), then: node scripts/rules-check.mjs
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { connectDatabaseEmulator, get, getDatabase, ref, remove, set } from 'firebase/database';
import { readFileSync } from 'node:fs';

const NS = 'demo-pong';
const MOD = 'mod@example.com';
const base = 'http://127.0.0.1:9000';
const rules = readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8');
const put = async (path, body) => {
  const r = await fetch(`${base}/${path}?ns=${NS}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
};
await put('.settings/rules.json', rules);
await put('.json', '{}');

let n = 0;
async function as(email) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: NS, databaseURL: `${base}?ns=${NS}` }, `a${n++}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, '127.0.0.1', 9000);
  if (email) await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true })));
  return { db, uid: auth.currentUser?.uid ?? null, app };
}
const ok = (p) => p.then(() => true, () => false);
let failed = 0;
const expect = async (what, p, want) => {
  const got = await ok(p);
  console.log(`${got === want ? 'PASS' : 'FAIL'}  ${what}`);
  if (got !== want) failed++;
};
const doc = (o) => ({ j: JSON.stringify(o) });

const mod = await as(MOD);
const amy = await as('amy@example.com');
const bob = await as('bob@example.com');
const anon = await as(null);

await expect('moderator passes modcheck', get(ref(mod.db, 'modcheck')), true);
await expect('player fails modcheck', get(ref(amy.db, 'modcheck')), false);
await expect('moderator writes a character', set(ref(mod.db, 'characters/c-1'), doc({ name: 'X' })), true);
await expect('player cannot write a character', set(ref(amy.db, 'characters/c-2'), doc({ name: 'Y' })), false);
await expect('signed-out visitor reads characters', get(ref(anon.db, 'characters')), true);
await expect('player writes own profile', set(ref(amy.db, `profiles/${amy.uid}`), doc({ name: 'Amy' })), true);
await expect('player cannot write another profile', set(ref(amy.db, `profiles/${bob.uid}`), doc({ name: 'Hax' })), false);
await expect('player cannot approve themselves', set(ref(amy.db, `approvals/${amy.uid}`), { ...doc({ status: 'approved' }), s: 'approved' }), false);
await expect('unapproved player cannot read the lobby', get(ref(amy.db, 'rooms/lobby')), false);
await expect('unapproved player cannot join the lobby', set(ref(amy.db, 'rooms/lobby/p1'), { by: amy.uid, p: '{}' }), false);
await expect('moderator approves amy', set(ref(mod.db, `approvals/${amy.uid}`), { ...doc({ status: 'approved' }), s: 'approved' }), true);
await expect('approved player reads the lobby', get(ref(amy.db, 'rooms/lobby')), true);
await expect('approved player joins the lobby', set(ref(amy.db, 'rooms/lobby/p1'), { by: amy.uid, p: '{"pz":1}' }), true);
await expect('lobby card must name its writer', set(ref(amy.db, 'rooms/lobby/p2'), { by: bob.uid, p: '{}' }), false);
await expect('lobby card over 4 KiB refused', set(ref(amy.db, 'rooms/lobby/p3'), { by: amy.uid, p: 'x'.repeat(5000) }), false);
await expect('moderator approves bob', set(ref(mod.db, `approvals/${bob.uid}`), { ...doc({ status: 'approved' }), s: 'approved' }), true);
await expect("approved player cannot overwrite another's lobby card", set(ref(bob.db, 'rooms/lobby/p1'), { by: bob.uid, p: '{}' }), false);
await expect('player removes own lobby card', remove(ref(amy.db, 'rooms/lobby/p1')), true);
await expect('player saves own progress', set(ref(amy.db, `data/users/${amy.uid}/progress`), doc({ charXp: {} })), true);
await expect("player cannot read another's progress", get(ref(bob.db, `data/users/${amy.uid}/progress`)), false);
await expect('player submits a character', set(ref(amy.db, `submissions/${amy.uid}`), doc({ items: {} })), true);
await expect("player cannot read others' submissions", get(ref(bob.db, 'submissions')), false);
await expect('moderator reads submissions', get(ref(mod.db, 'submissions')), true);
await expect('moderator pauses amy', set(ref(mod.db, `approvals/${amy.uid}`), { ...doc({ status: 'revoked' }), s: 'revoked' }), true);
await expect('paused player cannot join the lobby', set(ref(amy.db, 'rooms/lobby/p4'), { by: amy.uid, p: '{}' }), false);
await expect('approved player writes a match room', set(ref(bob.db, 'rooms/m/pz-abc/p9'), { by: bob.uid, p: '{}' }), true);
await expect('approved player reads a match room', get(ref(bob.db, 'rooms/m/pz-abc')), true);
await expect('paused player cannot read a match room', get(ref(amy.db, 'rooms/m/pz-abc')), false);
await expect('signed-out visitor cannot read the lobby', get(ref(anon.db, 'rooms/lobby')), false);
await expect('unknown paths are closed', set(ref(amy.db, 'anything/else'), 1), false);

for (const x of [mod, amy, bob, anon]) await deleteApp(x.app);
console.log(failed ? `${failed} FAILED` : 'All rules checks passed');
process.exit(failed ? 1 : 0);
