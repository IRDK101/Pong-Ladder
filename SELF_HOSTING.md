# Running Pong Zimulator on its own site

The game can run on its own website (GitHub Pages) with Firebase for sign-in,
saved progress and online play. There:

- Anyone can open the site and play every offline mode straight away.
- Players sign in with Google, or with a link emailed to them, and ask for a profile.
- You (the moderator) approve profiles. Approved players earn XP, unlock things,
  appear on the leaderboard and can play online. Nobody else needs an invite.
- Only you can change characters, approve profiles or change the site. The
  Firebase database rules enforce this on the server, and only people with
  push access to this repository can change the site.

The same code still builds the claude.ai version, which keeps working as before.

## One-time setup (about 15 minutes)

### 1. Create the Firebase project

1. Go to <https://console.firebase.google.com>, choose **Create a project**
   and give it a name, for example `pong-zimulator`. Google Analytics isn't needed.
2. **Build → Realtime Database → Create database.** Pick a location and
   **Start in locked mode**.
3. **Build → Authentication → Get started.** Under **Sign-in method**:
   - enable **Google**;
   - enable **Email/Password** and turn on **Email link (passwordless sign-in)**
     (leave plain passwords off).
4. Still in Authentication, under **Settings → Authorized domains**, add
   `irdk101.github.io`.
5. **Project settings (gear) → General → Your apps → Web (`</>`)**. Register an app
   (no hosting needed) and copy the `firebaseConfig` object it shows. Make
   sure it includes `databaseURL`. If it doesn't, copy the URL from the top of the
   Realtime Database page and add it.

### 2. Put in the security rules

In this repository run:

```sh
npm install
npm run rules -- your-google-email@example.com
```

This writes `database.rules.json`, with your email as the moderator. The file is
ignored by git, so your address isn't committed. Open it, copy everything, and paste it into
**Realtime Database → Rules**, then **Publish**. Use the email of the Google
account you'll sign in with.

### 3. Turn on the site

1. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
   (GitHub Pages on a private repository needs a paid GitHub plan. On a free plan,
   make the repository public. The Firebase config isn't secret.)
2. **Settings → Secrets and variables → Actions → Variables → New repository
   variable**: name `FIREBASE_CONFIG`, value the config as JSON, with quoted keys:

   ```json
   {"apiKey":"…","authDomain":"…firebaseapp.com","databaseURL":"https://…firebaseio.com","projectId":"…","appId":"…"}
   ```

3. **Actions → Deploy site → Run workflow** (it also runs on every push). When it
   finishes, the game is at **https://irdk101.github.io/Pong-Ladder/**.

### 4. Move your characters over

1. On the claude.ai version, open **Back up / restore** and download a backup.
   On your account it includes the whole shared collection.
2. On the new site, sign in with your moderator email, open **Back up / restore**
   and import that file. Every character uploads to the new collection.

Players start fresh on the new site: they sign in, ask for a profile and you approve them.

## Day to day

- New profile requests appear under **Your profile → Moderator tools → Profiles**,
  and your menu shows a badge. Approve, turn down, pause or rename them there.
- Approved players appear on the leaderboard, and the **Online match** row on
  everyone's home screen shows who's online. A challenge reaches players
  wherever they are in the menus, and both players can ask for a rematch from the
  end screen.
- Each match has its own room in the database, so only its two players download its
  live game state.

## Free-plan limits

Firebase's free Spark plan allows 100 people connected at once, 1 GB stored and
10 GB of downloads a month. A match sends about 45 KB a second to the other
player, so 10 GB covers roughly 50 hours of online play a month. The Usage
tab in the Firebase console shows where you are, and the paid Blaze plan
removes these limits.

## Testing locally (optional)

With Java installed:

```sh
npm run rules -- mod@example.com   # the emulators load database.rules.json (see firebase.json)
npx firebase-tools@15 emulators:start --only auth,database --project demo-pong
node scripts/rules-check.mjs   # checks who can read and write what
VITE_FIREBASE_CONFIG='{"apiKey":"demo-key","projectId":"demo-pong","authDomain":"localhost","databaseURL":"http://127.0.0.1:9000?ns=demo-pong"}' \
  VITE_FIREBASE_EMULATOR=1 npm run dev
```
