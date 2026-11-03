// Writes database.rules.json from database.rules.template.json with the
// moderator's email filled in. Usage: npm run rules -- you@example.com
// Paste the result into Firebase console → Realtime Database → Rules.
import { readFileSync, writeFileSync } from 'node:fs';

const email = (process.argv[2] ?? '').trim().toLowerCase();
if (!/^[^@\s'"\\]+@[^@\s'"\\]+\.[^@\s'"\\]+$/.test(email)) {
  console.error('Give the moderator’s email: npm run rules -- you@example.com');
  process.exit(1);
}
const MOD = `auth != null && auth.token.email_verified === true && auth.token.email.toLowerCase() === '${email}'`;
const APPROVED = `auth != null && (root.child('approvals').child(auth.uid).child('s').val() === 'approved' || (${MOD}))`;
const text = readFileSync(new URL('../database.rules.template.json', import.meta.url), 'utf8')
  .replaceAll('"MOD"', JSON.stringify(MOD))
  .replaceAll('APPROVED', APPROVED.replaceAll('"', '\\"'))
  .replaceAll('MOD', `(${MOD})`);
JSON.parse(text);
writeFileSync(new URL('../database.rules.json', import.meta.url), text);
console.log('Wrote database.rules.json for moderator', email);
