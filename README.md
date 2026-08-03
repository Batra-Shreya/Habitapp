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

## Deploy from your phone (no terminal needed)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Batra-Shreya/Habitapp)

You can put Habitat online entirely from a phone browser:

1. Tap **Deploy to Render** above (or go to [render.com](https://render.com) → **New +** →
   **Blueprint** → pick this repo → **Apply**). Sign in with GitHub when asked.
2. Render reads `render.yaml`, installs, and runs `npm start` for you. Wait for it to say
   **Live** (first build takes a minute or two).
3. Tap the URL Render gives you, e.g. `https://habitat-xxxx.onrender.com` — that's your app.

**Test it with your friend:**
- Open the URL, **create an account** (username + passcode).
- Send your friend the **same URL** and your **username**.
- They create their own account, and you each add the other under the **🤝 Buddy** tab.
- Check off a habit and watch it update on the other's screen live. 🎉

**Test it by yourself first** (handy on one phone): open the URL in your normal browser and
again in a **private/incognito** tab, sign up as two different users, add each other, and
toggle a habit — you'll see the other tab update instantly.

> **Free-tier notes:** Render's free service **sleeps after ~15 min idle**, so the first visit
> after a nap takes ~30s to wake — totally fine for trying it out. Also, the free tier's disk
> is temporary, so accounts reset if the service restarts. To keep data permanently, add a
> Render **Disk**, mount it at e.g. `/data`, and set the env var `HABITAT_DB=/data/db.json`.

Other one-tap-ish hosts that also work from a phone: **Railway** and **Glitch** (import this
GitHub repo; both run `npm start` and hand you a URL).

## Playing together from a computer

If you're at a laptop instead, `npm start` runs it locally, and for a quick share with a
friend you can tunnel it without deploying:

```bash
npm start
npx localtunnel --port 3000    # or: ngrok http 3000
```

The server is a single process. Configure the port with `PORT` and the data file with
`HABITAT_DB`.

## Your data

Accounts and progress live in `server/db.json` on whatever machine runs the server. In solo
mode, data stays in your browser only. Use **reset all data** in the footer to clear the
device, or **log out** to switch accounts.

---

Made to help you and a friend hit your goals and feel good doing it 💚
