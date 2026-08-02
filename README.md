# 🌱 Habitat — grow good habits, together

A small, friendly habit tracker that **rewards you for hitting your goals** and lets you
**pair up with a friend** and see each other's progress **update live**. Runs on a tiny
Node backend with **zero npm dependencies** — no build step, no database server.

![node](https://img.shields.io/badge/node-%E2%89%A518-4ade80) ![deps](https://img.shields.io/badge/dependencies-0-22c55e)

## What it does

- **🗓️ Track daily goals** — add habits like "Drink water" or "Read 20 min" and check them off each day.
- **🏆 Get rewarded** — every completion earns points, builds streaks, levels you up, and unlocks badges.
- **🎉 Celebrate wins** — confetti and a cheer every time you complete a goal.
- **📈 See progress** — streaks, a 30-day heatmap, and completion stats.
- **🤝 Live accountability buddy** — add a friend by username and watch their points, streak, and
  online status update **in real time**. Send **live cheers** that pop up on their screen instantly.

## Run it

You need [Node.js](https://nodejs.org) 18 or newer. There's nothing to install.

```bash
npm start
# → 🌱 Habitat is running at http://localhost:3000
```

Open **http://localhost:3000**, create an account (username + passcode), and you're in.

> Want to see the live buddy sync right now? Open the URL in **two different browsers**
> (or a normal + private window), sign up as two people, add each other by username, and
> check off a habit in one — watch it update in the other instantly.

`npm run dev` runs the same thing with auto-restart on file changes.

## How the live buddy system works

1. Go to the **🤝 Buddy** tab and share **your username** with your friend.
2. Each of you enters the **other's username** under "Add your buddy."
3. That's it — you'll each see the other's points, best streak, completions, and a green
   **online** dot, all updating live. Tap a cheer button to send instant encouragement.

Under the hood the browser holds an open **Server-Sent Events** stream to the backend. When
you save progress or send a cheer, the server pushes it straight to anyone watching you.

## Architecture

```
public/            ← the frontend (static, no build)
  index.html
  styles.css
  app.js           ← app logic: goals, scoring, streaks, badges, confetti, live buddy UI
  api.js           ← thin client for the backend (auth, sync, SSE)
server/
  server.js        ← pure-Node HTTP server: static files, auth, REST, SSE
  store.js         ← JSON-file persistence (atomic writes)
  db.json          ← created at runtime (git-ignored)
package.json       ← just `npm start`; no dependencies
```

**Backend API** (all JSON):

| Method & path        | Auth | Purpose                                        |
|----------------------|------|------------------------------------------------|
| `POST /api/signup`   | –    | Create an account, returns a token             |
| `POST /api/login`    | –    | Log in, returns a token + saved state          |
| `GET  /api/state`    | ✔    | Load your saved goals/points                   |
| `PUT  /api/state`    | ✔    | Save your state (pushes updates to your buddy) |
| `GET  /api/buddy`    | ✔    | Your buddy's current snapshot                  |
| `POST /api/buddy`    | ✔    | Add a buddy by username                        |
| `DELETE /api/buddy`  | ✔    | Remove your buddy                              |
| `POST /api/cheer`    | ✔    | Send a live cheer to your buddy                |
| `GET  /api/events`   | ✔    | SSE stream of live buddy + cheer events        |

Auth is a bearer token (stored in the browser). Passcodes are hashed with `scrypt`; nothing is
sent in plaintext to storage.

## Works offline too

If you open the app without a running backend (e.g. `public/index.html` straight from disk), it
drops into **solo mode**: you can still track your own goals and earn rewards, saved in your
browser's `localStorage`. The live-buddy features simply light up once you're on an account.

## Playing together over the internet

Local `npm start` is perfect for one machine or a home network. For you and a friend on
different networks, run the server somewhere you both can reach:

- **Quick share:** run `npm start`, then expose it with a tunnel like
  `npx localtunnel --port 3000` or `ngrok http 3000`, and send your friend the URL.
- **Always-on:** deploy `server/` to any Node host (Render, Railway, Fly.io, a small VPS).
  It's a single process; point it at a persistent disk for `server/db.json`.
  Configure the port with the `PORT` env var and the data file with `HABITAT_DB`.

## Your data

Accounts and progress live in `server/db.json` on whatever machine runs the server. In solo
mode, data stays in your browser only. Use **reset all data** in the footer to clear the
device, or **log out** to switch accounts.

---

Made to help you and a friend hit your goals and feel good doing it 💚
