# El Presidente

A local multiplayer Spanish-card table game built with React, Vite, Socket.IO, and a small Node server.

The host screen runs on a shared table display. Players join from their phones, choose a name, icon, and color, then play their private hands from the phone UI.

## Features

- Host table view with QR join flow.
- Phone player view for private hands and turn actions.
- Spanish card artwork sliced from the provided card sheet.
- Two-human mode with an automatic Computer Player as the third seat.
- Persistent local score history in `data/scores.json`.
- Recent winners list.
- President, Fool, and Neutral role badges after each round.
- Player icon and color selection.
- Rules modal available on host and phone.

## Rules Implemented

- The deck is dealt evenly across seated players.
- A player must lead with a card when the pile is empty.
- After a lead, the next card must be exactly one rank higher or lower than the current pile card.
- One card is played per turn.
- Players cannot pass on an empty pile.
- Once a card is on the pile, players may pass.
- When every other active player passes, the pile clears.
- First player out is President and wins the round.
- Last player remaining is Fool.
- Other players are Neutral.
- If only two humans are seated, a Computer Player fills the third seat.

## Local Development

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run dev
```

Open the host table:

```text
http://localhost:5173/
```

Players join from:

```text
http://localhost:5173/join
```

The dev command starts:

- Vite client on port `5173`
- Socket.IO server on port `3001`

## Scripts

```bash
npm run dev
npm run build
npm run android:sync
npm run android:open
npm run lint
npm start
npm run server
npm run client
```

## Android App

The Android app is a Capacitor wrapper around the same Vite/React game UI, so gameplay rules and layouts stay in one codebase.

By default, native Android builds connect Socket.IO to:

```text
https://elpresidente-production.up.railway.app
```

To build/sync the Android project:

```bash
npm run android:sync
npm run android:open
```

For an Android TV host/table build, force TV mode before syncing:

```bash
npm run android:sync:tv
```

For LAN testing against a local host/server, build with a socket URL that Android devices can reach:

```bash
VITE_SOCKET_URL=http://192.168.x.x:3003 npm run android:sync
```

For Android TV LAN testing:

```bash
VITE_SOCKET_URL=http://192.168.x.x:3003 npm run android:sync:tv
```

Android notes:

- The native project is under `android/`.
- Phone builds open the player join screen by default.
- Android TV builds open the host/table screen by default.
- The manifest includes Android TV/Leanback launcher support and does not require a touchscreen.
- Cleartext traffic is enabled so LAN test servers can use `http://`.
- Android Studio or a Java runtime is required for Gradle sync/builds.

## Saved Scores

Round scores are saved locally to:

```text
data/scores.json
```

That file is ignored by git so each machine or deployment can keep its own local score history.

## Railway Deployment Notes

The app is packaged to run as one Railway web service:

- `npm run build` builds the Vite client into `dist`.
- `npm start` runs `server.js`.
- `server.js` serves `dist` and Socket.IO from the same origin.
- The production Socket.IO client connects to the page origin, so Railway does not need a separate public `3001` port.
- `server.js` listens on Railway's `PORT` environment variable.
- Add a Railway Volume mounted at `/app/data` if persistent scores should survive restarts.

Current production URL:

```text
https://elpresidente-production.up.railway.app/
```

## Project Update Log

- 2026-06-01 22:25 SAST: Audited the Spanish card image links and replaced the incorrect `1-oros` card-back image with an Ace-of-coins card face.
- 2026-06-01 00:46 SAST: Verified all 12 player icon choices render, select correctly, update the preview avatar, and fit on a phone viewport.
- 2026-06-01 00:37 SAST: Made Reset clear the current table seats, old join names, hands, pile, turn state, and joined phone forms.
- 2026-06-01 00:21 SAST: Added a larger, animated player icon picker with livelier avatar effects.
- 2026-05-30 18:14 SAST: Added turn announcement overlay, mobile layout refinements, and scoreboard summary for last President and most wins.
- 2026-05-30 11:02 SAST: Fixed Railway production connectivity by using same-origin Socket.IO in production and serving the built client from `server.js`.
- 2026-05-30 10:55 SAST: Replaced the Vite template README with project-specific documentation and this update log.
- 2026-05-30: Removed the host "Your Hand" tray so hands only appear on player phones.
- 2026-05-30: Added player icon/color selection, role badges, and Rules modal on host and phone.
- 2026-05-30: Added persistent scoring and recent winners.
- 2026-05-30: Added two-human play with a Computer Player third seat.
- 2026-05-30: Replaced card art with Spanish card images from the provided sheet.
- 2026-05-30: Reworked the table to use CSS instead of the table background graphic.
