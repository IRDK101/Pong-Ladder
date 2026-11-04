// Reads the Firebase web config the way the Firebase console shows it and prints
// it as clean JSON. Accepts plain JSON, or the console's JavaScript snippet as-is:
//
//   // Your web app's Firebase configuration
//   const firebaseConfig = {
//     apiKey: "AIza…",
//     authDomain: "pong-zimulator.firebaseapp.com",
//     …
//   };
//
// (unquoted keys, single quotes, comments, trailing commas, the surrounding
// import / initializeApp lines are all fine).
//
// Usage: node scripts/firebase-config.mjs firebase-web-config.json   (or pipe it in)

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const REQUIRED = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'appId'];

/** Parse a pasted Firebase config (JSON or the console's JS snippet). Throws with a plain-English message. */
export function parseFirebaseConfig(text) {
  const src = String(text ?? '').replace(/^﻿/, '');
  // Drop comments (but not the // inside "https://…" strings).
  let noComments = '';
  for (let i = 0, q = null; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      noComments += ch;
      if (ch === '\\') noComments += src[++i] ?? '';
      else if (ch === q) q = null;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      q = ch;
      noComments += ch;
    } else if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      noComments += '\n';
    } else if (ch === '/' && src[i + 1] === '*') {
      i = src.indexOf('*/', i + 2);
      if (i < 0) break;
      i++;
    } else noComments += ch;
  }
  // The config object: the braces after "firebaseConfig =", else the first { … } block.
  const at = noComments.search(/firebaseConfig\s*=\s*\{/);
  const open = at >= 0 ? noComments.indexOf('{', at) : noComments.indexOf('{');
  if (open < 0) throw new Error('No { … } found. Paste the firebaseConfig object from Project settings → Your apps.');
  let depth = 0;
  let close = -1;
  for (let i = open, q = null; i < noComments.length; i++) {
    const ch = noComments[i];
    if (q) {
      if (ch === '\\') i++;
      else if (ch === q) q = null;
    } else if (ch === '"' || ch === "'" || ch === '`') q = ch;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      close = i;
      break;
    }
  }
  if (close < 0) throw new Error('The { … } block is not closed: part of the config seems to be missing.');
  const body = noComments.slice(open, close + 1);
  // Turn the JS object into JSON: quote keys, single/back quotes to double, drop trailing commas.
  let json = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "'" || ch === '`' || ch === '"') {
      let s = '';
      for (i++; i < body.length && body[i] !== ch; i++) {
        if (body[i] === '\\') s += body[++i];
        else s += body[i];
      }
      json += JSON.stringify(s);
    } else if (/[A-Za-z_$]/.test(ch)) {
      let w = ch;
      while (i + 1 < body.length && /[\w$]/.test(body[i + 1])) w += body[++i];
      json += ['true', 'false', 'null'].includes(w) ? w : JSON.stringify(w);
    } else json += ch;
  }
  json = json.replace(/,\s*([}\]])/g, '$1');
  let cfg;
  try {
    cfg = JSON.parse(json);
  } catch (e) {
    throw new Error(`The config could not be read (${e.message}). Copy the whole firebaseConfig block again.`);
  }
  const missing = REQUIRED.filter((k) => typeof cfg[k] !== 'string' || !cfg[k]);
  if (missing.includes('databaseURL'))
    throw new Error('The config has no databaseURL. Copy it from the top of the Realtime Database page (https://…firebaseio.com or …firebasedatabase.app) and add it as databaseURL: "…".');
  if (missing.length) throw new Error(`The config is missing: ${missing.join(', ')}.`);
  return cfg;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const text = process.argv[2] ? readFileSync(process.argv[2], 'utf8') : readFileSync(0, 'utf8');
  try {
    process.stdout.write(JSON.stringify(parseFirebaseConfig(text)));
  } catch (e) {
    console.error(`Firebase config: ${e.message}`);
    process.exit(1);
  }
}
