# 🌱 Habitat — grow good habits, together

A small, friendly habit tracker that **rewards you for hitting your goals** and lets you
**pair up with a friend** to keep each other motivated. No sign-up, no server, no build
step — just open it and start.

![built with vanilla JS](https://img.shields.io/badge/built%20with-vanilla%20JS-4ade80)

## What it does

- **🗓️ Track daily goals** — add habits like "Drink water" or "Read 20 min" and check them off each day.
- **🏆 Get rewarded** — every completion earns points, builds streaks, levels you up, and unlocks badges.
- **🎉 Celebrate wins** — confetti and a little cheer every time you complete a goal.
- **📈 See progress** — streaks, a 30-day heatmap, and completion stats.
- **🤝 Team up with a friend** — share a code with your buddy, add theirs, see each other's
  progress side-by-side, and send encouragement.

## How to run it

It's a plain web app — no install needed.

```bash
# Option 1: just open it
open index.html          # macOS
xdg-open index.html      # Linux
start index.html         # Windows

# Option 2: serve it (nicer for clipboard copy features)
python3 -m http.server 8000
# then visit http://localhost:8000
```

## How the buddy system works

Because there's no backend, friends sync through **share codes**:

1. Go to the **🤝 Buddy** tab and copy **your code**.
2. Send it to your friend (text, DM, anywhere).
3. Paste **their code** into the "Add your buddy" box.
4. You'll each see the other's points, best streak, and completions — and can send cheers.

Re-copy and re-share your code whenever you want your buddy to see fresh progress.

## Your data

Everything is stored locally in your browser (`localStorage`) under the key `habitat.v1`.
Nothing is uploaded anywhere. Use **reset all data** in the footer to wipe it.

## Project structure

```
index.html   — markup & screens
styles.css   — all styling (dark, responsive)
app.js       — state, scoring, streaks, badges, buddy codes, confetti
```

## Want real-time friend sync later?

The share-code approach keeps this zero-setup. To make buddies update live, you'd add a
small backend (e.g. Firebase, Supabase, or a tiny Node + SQLite API) and replace the
`mySnapshot()` / `decodeSnapshot()` flow in `app.js` with fetch calls. The data model
(`user`, `habits`, `history`, `points`, `badges`) is already shaped for that.

---

Made to help you and a friend hit your goals and feel good doing it 💚
