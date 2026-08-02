/* Habitat — a friendly, no-backend habit tracker.
   All data lives in localStorage. Buddy sync works via shareable codes. */

(() => {
  "use strict";

  const STORAGE_KEY = "habitat.v1";
  const POINTS_PER_DONE = 10;      // base points for completing a habit
  const STREAK_BONUS_CAP = 15;     // streak bonus is capped so it stays fun, not grindy
  const LEVEL_SIZE = 100;          // points needed per level

  const EMOJIS = [
    "💧", "🏃", "📚", "🧘", "🥗", "💤", "🦷", "🎸",
    "💪", "🚶", "✍️", "🎨", "🧹", "☀️", "🙏", "💊",
    "🚭", "💰", "🌿", "🧠", "📱", "🐶", "❤️", "⭐",
  ];

  const LEVEL_TITLES = [
    "Sprout", "Seedling", "Sapling", "Bloomer", "Grower",
    "Achiever", "Trailblazer", "Champion", "Legend", "Zen Master",
  ];

  const CELEBRATIONS = [
    "Nice one! 🎉", "You did it! 🌟", "Crushing it! 💪", "Keep glowing! ✨",
    "Habit locked in! 🔒", "That's the spirit! 🔥", "Proud of you! 💚",
  ];

  const BADGES = [
    { id: "first",     emoji: "🌱", name: "First Step",      desc: "Complete your first goal",         test: s => s.stats.totalDone >= 1 },
    { id: "streak3",   emoji: "🔥", name: "On a Roll",       desc: "Reach a 3-day streak",              test: s => bestStreakEver(s) >= 3 },
    { id: "streak7",   emoji: "⚡", name: "Week Warrior",     desc: "Reach a 7-day streak",              test: s => bestStreakEver(s) >= 7 },
    { id: "streak30",  emoji: "👑", name: "Consistency King", desc: "Reach a 30-day streak",            test: s => bestStreakEver(s) >= 30 },
    { id: "perfect",   emoji: "🎯", name: "Perfect Day",     desc: "Complete every goal in one day",    test: s => s.stats.perfectDays >= 1 },
    { id: "points100", emoji: "💎", name: "Century Club",    desc: "Earn 100 points",                   test: s => s.user.points >= 100 },
    { id: "points500", emoji: "🏆", name: "High Roller",     desc: "Earn 500 points",                   test: s => s.user.points >= 500 },
    { id: "done50",    emoji: "🌳", name: "Deep Roots",      desc: "Complete 50 goals total",           test: s => s.stats.totalDone >= 50 },
    { id: "buddy",     emoji: "🤝", name: "Better Together", desc: "Add an accountability buddy",       test: s => !!s.buddy },
    { id: "level5",    emoji: "🚀", name: "Rising Star",     desc: "Reach level 5",                     test: s => levelFromPoints(s.user.points) >= 5 },
  ];

  // ---------- State ----------
  let state = load();

  function defaultState() {
    return {
      user: { name: "", avatar: "🙂", points: 0 },
      habits: [],                 // { id, name, emoji, createdAt, history: { "YYYY-MM-DD": true } }
      badges: [],                 // unlocked badge ids
      buddy: null,                // decoded buddy snapshot
      stats: { totalDone: 0, perfectDays: 0 },
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return Object.assign(defaultState(), JSON.parse(raw));
    } catch {
      return defaultState();
    }
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }

  // ---------- Date helpers ----------
  function todayKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function dayOffsetKey(offset) {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return todayKey(d);
  }

  // ---------- Scoring ----------
  function levelFromPoints(pts) { return Math.floor(pts / LEVEL_SIZE) + 1; }
  function levelTitle(level) { return LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)]; }

  function currentStreak(habit) {
    let streak = 0;
    for (let i = 0; i < 3650; i++) {
      if (habit.history[dayOffsetKey(i)]) streak++;
      else if (i === 0) continue; // today not done yet doesn't break a streak that ran up to yesterday
      else break;
    }
    return streak;
  }

  function bestStreakEver(s) {
    let best = 0;
    for (const h of s.habits) {
      const days = Object.keys(h.history).filter(k => h.history[k]).sort();
      let run = 0, prev = null;
      for (const k of days) {
        if (prev && isNextDay(prev, k)) run++;
        else run = 1;
        best = Math.max(best, run);
        prev = k;
      }
    }
    return best;
  }

  function isNextDay(a, b) {
    const da = new Date(a + "T00:00:00");
    const db = new Date(b + "T00:00:00");
    return (db - da) === 86400000;
  }

  function completedCountOn(dayKey) {
    return state.habits.filter(h => h.history[dayKey]).length;
  }

  // ---------- Element refs ----------
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  // ---------- Boot ----------
  function boot() {
    if (!state.user.name) {
      $("#onboarding").classList.remove("hidden");
      $("#onboarding").setAttribute("aria-hidden", "false");
    } else {
      startApp();
    }
    wireGlobalEvents();
  }

  function startApp() {
    $("#onboarding").classList.add("hidden");
    $("#app").classList.remove("hidden");
    renderAll();
  }

  // ---------- Rendering ----------
  function renderAll() {
    renderHeader();
    renderToday();
    renderProgress();
    renderRewards();
    renderBuddy();
  }

  function renderHeader() {
    const level = levelFromPoints(state.user.points);
    $("#hdr-level").textContent = level;
    $("#hdr-points").textContent = state.user.points;
    $("#hdr-avatar").textContent = state.user.avatar;

    const into = state.user.points % LEVEL_SIZE;
    $("#level-bar-fill").style.width = `${into}%`;
    $("#level-bar-label").textContent = `${into} / ${LEVEL_SIZE} to level ${level + 1}`;
  }

  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }

  function renderToday() {
    $("#today-greeting").textContent = `${greeting()}, ${state.user.name} 👋`;
    $("#today-date").textContent = new Date().toLocaleDateString(undefined, {
      weekday: "long", month: "long", day: "numeric",
    });

    const list = $("#habit-list");
    const empty = $("#habits-empty");
    list.innerHTML = "";

    if (state.habits.length === 0) {
      empty.classList.remove("hidden");
      $("#today-summary").innerHTML = "";
      return;
    }
    empty.classList.add("hidden");

    const tKey = todayKey();
    const doneToday = completedCountOn(tKey);
    const pct = Math.round((doneToday / state.habits.length) * 100);

    $("#today-summary").innerHTML = `
      <div class="ring" style="--p:${pct}"><span>${pct}%</span></div>
      <div class="summary-text">
        <b>${doneToday} of ${state.habits.length}</b> goals done today.
        ${doneToday === state.habits.length ? "Perfect day! 🎉" : "You've got this 💪"}
      </div>`;

    for (const habit of state.habits) {
      const done = !!habit.history[tKey];
      const streak = currentStreak(habit);
      const li = document.createElement("li");
      li.className = "habit-item" + (done ? " done" : "");
      li.innerHTML = `
        <div class="habit-emoji">${habit.emoji}</div>
        <div class="habit-info">
          <div class="habit-name"></div>
          <div class="habit-meta">
            ${streak > 0 ? `<span class="habit-streak-badge">🔥 ${streak}-day streak</span>` : `<span>No streak yet</span>`}
          </div>
        </div>
        <div class="habit-actions">
          <button class="habit-del" title="Delete goal" aria-label="Delete">🗑️</button>
          <button class="check-btn ${done ? "checked" : ""}" aria-label="Toggle done">${done ? "✓" : ""}</button>
        </div>`;
      li.querySelector(".habit-name").textContent = habit.name;
      li.querySelector(".check-btn").addEventListener("click", () => toggleHabit(habit.id));
      li.querySelector(".habit-del").addEventListener("click", () => deleteHabit(habit.id));
      list.appendChild(li);
    }
  }

  function renderProgress() {
    const grid = $("#stat-grid");
    const totalStreak = state.habits.reduce((m, h) => Math.max(m, currentStreak(h)), 0);
    const rate = completionRate();
    grid.innerHTML = `
      ${statBox(state.habits.length, "Active goals")}
      ${statBox("🔥 " + totalStreak, "Best current streak")}
      ${statBox(state.stats.totalDone, "Total completions")}
      ${statBox(rate + "%", "30-day completion")}`;

    // heatmap: last 30 days
    const heat = $("#heatmap");
    heat.innerHTML = "";
    const total = Math.max(state.habits.length, 1);
    for (let i = 29; i >= 0; i--) {
      const key = dayOffsetKey(i);
      const done = completedCountOn(key);
      const ratio = done / total;
      let lvl = 0;
      if (ratio > 0) lvl = 1;
      if (ratio >= 0.34) lvl = 2;
      if (ratio >= 0.67) lvl = 3;
      if (ratio >= 1) lvl = 4;
      const cell = document.createElement("div");
      cell.className = "heat-cell";
      cell.dataset.lvl = lvl;
      cell.title = `${key}: ${done}/${state.habits.length} done`;
      heat.appendChild(cell);
    }

    // per-habit streaks
    const hs = $("#habit-streaks");
    if (state.habits.length === 0) {
      hs.innerHTML = `<p class="muted small">Add a goal to start tracking streaks.</p>`;
    } else {
      hs.innerHTML = state.habits.map(h => `
        <div class="streak-row">
          <div class="habit-emoji">${h.emoji}</div>
          <div class="sr-name"></div>
          <div class="sr-val">🔥 ${currentStreak(h)}</div>
        </div>`).join("");
      $$("#habit-streaks .sr-name").forEach((el, i) => { el.textContent = state.habits[i].name; });
    }
  }

  function completionRate() {
    if (state.habits.length === 0) return 0;
    let possible = 0, done = 0;
    for (let i = 0; i < 30; i++) {
      const key = dayOffsetKey(i);
      for (const h of state.habits) {
        if (h.createdAt && key < h.createdAt.slice(0, 10)) continue;
        possible++;
        if (h.history[key]) done++;
      }
    }
    return possible === 0 ? 0 : Math.round((done / possible) * 100);
  }

  function statBox(num, label) {
    return `<div class="stat-box"><div class="stat-num">${num}</div><div class="stat-label">${label}</div></div>`;
  }

  function renderRewards() {
    const level = levelFromPoints(state.user.points);
    $("#reward-level").textContent = level;
    $("#reward-title").textContent = levelTitle(level);
    $("#reward-points").textContent = state.user.points;

    const grid = $("#badge-grid");
    grid.innerHTML = BADGES.map(b => {
      const unlocked = state.badges.includes(b.id);
      return `<div class="badge ${unlocked ? "unlocked" : "locked"}">
        <div class="badge-emoji">${b.emoji}</div>
        <div class="badge-name">${b.name}</div>
        <div class="badge-desc">${b.desc}</div>
      </div>`;
    }).join("");
  }

  function renderBuddy() {
    $("#my-code").value = encodeSnapshot(mySnapshot());
    const view = $("#buddy-view");
    if (!state.buddy) { view.classList.add("hidden"); return; }
    view.classList.remove("hidden");

    const b = state.buddy;
    $("#buddy-avatar").textContent = b.avatar || "🙂";
    $("#buddy-name").textContent = b.name || "Your buddy";
    $("#buddy-sub").textContent = `Level ${levelFromPoints(b.points)} · ${levelTitle(levelFromPoints(b.points))}`;
    $("#buddy-stats").innerHTML = `
      <div class="buddy-stat"><div class="bn">💎 ${b.points}</div><div class="bl">points</div></div>
      <div class="buddy-stat"><div class="bn">🔥 ${b.bestStreak || 0}</div><div class="bl">best streak</div></div>
      <div class="buddy-stat"><div class="bn">✅ ${b.totalDone || 0}</div><div class="bl">completions</div></div>`;
  }

  // ---------- Snapshots (buddy sharing) ----------
  function mySnapshot() {
    return {
      name: state.user.name,
      avatar: state.user.avatar,
      points: state.user.points,
      bestStreak: bestStreakEver(state),
      totalDone: state.stats.totalDone,
      updated: todayKey(),
    };
  }

  function encodeSnapshot(snap) {
    try { return btoa(unescape(encodeURIComponent(JSON.stringify(snap)))); }
    catch { return ""; }
  }
  function decodeSnapshot(code) {
    const snap = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    if (typeof snap.name !== "string" || typeof snap.points !== "number") throw new Error("bad");
    return snap;
  }

  // ---------- Actions ----------
  function toggleHabit(id) {
    const habit = state.habits.find(h => h.id === id);
    if (!habit) return;
    const key = todayKey();
    const wasDone = !!habit.history[key];

    if (wasDone) {
      delete habit.history[key];
      state.user.points = Math.max(0, state.user.points - POINTS_PER_DONE);
      state.stats.totalDone = Math.max(0, state.stats.totalDone - 1);
    } else {
      habit.history[key] = true;
      const streak = currentStreak(habit);
      const bonus = Math.min(streak, STREAK_BONUS_CAP);
      const gained = POINTS_PER_DONE + bonus;
      state.user.points += gained;
      state.stats.totalDone += 1;
      celebrate(gained, streak);

      // perfect day?
      if (completedCountOn(key) === state.habits.length && state.habits.length > 0) {
        if (!isPerfectDayCounted(key)) {
          state.stats.perfectDays += 1;
          state.stats._lastPerfect = key;
          toast("🎯 Perfect day! Every goal done!", "gold");
        }
      }
    }
    checkBadges();
    save();
    renderAll();
  }

  function isPerfectDayCounted(key) {
    return state.stats._lastPerfect === key;
  }

  function deleteHabit(id) {
    const habit = state.habits.find(h => h.id === id);
    if (!habit) return;
    if (!confirm(`Delete "${habit.name}"? Your points stay, but its history is removed.`)) return;
    state.habits = state.habits.filter(h => h.id !== id);
    save();
    renderAll();
  }

  function addHabit(name, emoji) {
    state.habits.push({
      id: "h_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name.trim(),
      emoji,
      createdAt: new Date().toISOString(),
      history: {},
    });
    save();
    renderAll();
    toast(`${emoji} New goal added!`);
  }

  function checkBadges() {
    for (const b of BADGES) {
      if (!state.badges.includes(b.id) && b.test(state)) {
        state.badges.push(b.id);
        toast(`${b.emoji} Badge unlocked: ${b.name}!`, "gold");
      }
    }
  }

  // ---------- Celebration ----------
  function celebrate(points, streak) {
    const layer = $("#celebrate");
    const msg = $("#celebrate-msg");
    const base = CELEBRATIONS[Math.floor(Math.random() * CELEBRATIONS.length)];
    msg.innerHTML = `${base}<br><span style="font-size:0.9rem;color:var(--muted)">+${points} points${streak > 1 ? ` · 🔥 ${streak}-day streak` : ""}</span>`;
    layer.classList.remove("hidden");
    runConfetti();
    setTimeout(() => layer.classList.add("hidden"), 1500);
  }

  function runConfetti() {
    const canvas = $("#confetti-canvas");
    const ctx = canvas.getContext("2d");
    const W = canvas.width = window.innerWidth;
    const H = canvas.height = window.innerHeight;
    const colors = ["#4ade80", "#7c93ff", "#fbbf24", "#60d6ff", "#f87171"];
    const pieces = Array.from({ length: 120 }, () => ({
      x: Math.random() * W,
      y: -20 - Math.random() * H * 0.5,
      r: 4 + Math.random() * 6,
      c: colors[Math.floor(Math.random() * colors.length)],
      vy: 3 + Math.random() * 4,
      vx: -2 + Math.random() * 4,
      rot: Math.random() * Math.PI,
      vr: -0.2 + Math.random() * 0.4,
    }));
    let frame = 0;
    (function draw() {
      ctx.clearRect(0, 0, W, H);
      for (const p of pieces) {
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
        ctx.restore();
      }
      frame++;
      if (frame < 90) requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, W, H);
    })();
  }

  // ---------- Toasts ----------
  function toast(text, kind = "") {
    const wrap = $("#toast-wrap");
    const el = document.createElement("div");
    el.className = "toast " + kind;
    el.textContent = text;
    wrap.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity 0.3s, transform 0.3s";
      el.style.opacity = "0";
      el.style.transform = "translateY(10px)";
      setTimeout(() => el.remove(), 300);
    }, 2600);
  }

  // ---------- Modal ----------
  let editingEmoji = "💧";

  function openHabitModal() {
    editingEmoji = "💧";
    $("#habit-name").value = "";
    $("#habit-emoji").value = editingEmoji;
    buildEmojiPicker();
    $("#habit-modal").classList.remove("hidden");
    setTimeout(() => $("#habit-name").focus(), 50);
  }
  function closeHabitModal() { $("#habit-modal").classList.add("hidden"); }

  function buildEmojiPicker() {
    const picker = $("#emoji-picker");
    picker.innerHTML = "";
    for (const e of EMOJIS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "emoji-opt" + (e === editingEmoji ? " selected" : "");
      btn.textContent = e;
      btn.addEventListener("click", () => {
        editingEmoji = e;
        $("#habit-emoji").value = e;
        $$(".emoji-opt").forEach(o => o.classList.remove("selected"));
        btn.classList.add("selected");
      });
      picker.appendChild(btn);
    }
  }

  // ---------- Event wiring ----------
  function wireGlobalEvents() {
    // Onboarding
    $("#onboarding-form").addEventListener("submit", e => {
      e.preventDefault();
      const name = $("#onboarding-name").value.trim();
      if (!name) return;
      state.user.name = name;
      save();
      startApp();
      // Seed a couple of starter goals so it doesn't feel empty
      addHabit("Drink water 💧", "💧");
      addHabit("Move for 20 min", "🏃");
    });

    // Tabs
    $$(".tab").forEach(tab => {
      tab.addEventListener("click", () => {
        $$(".tab").forEach(t => t.classList.remove("active"));
        $$(".panel").forEach(p => p.classList.remove("active"));
        tab.classList.add("active");
        $("#panel-" + tab.dataset.tab).classList.add("active");
      });
    });

    // Add habit
    $("#add-habit-btn").addEventListener("click", openHabitModal);
    $("#add-habit-empty").addEventListener("click", openHabitModal);
    $("#modal-cancel").addEventListener("click", closeHabitModal);
    $("#habit-modal").addEventListener("click", e => {
      if (e.target.id === "habit-modal") closeHabitModal();
    });
    $("#habit-form").addEventListener("submit", e => {
      e.preventDefault();
      const name = $("#habit-name").value.trim();
      if (!name) return;
      addHabit(name, $("#habit-emoji").value || "⭐");
      closeHabitModal();
    });

    // Buddy — copy
    $("#copy-code-btn").addEventListener("click", async () => {
      const code = $("#my-code").value;
      try {
        await navigator.clipboard.writeText(code);
        toast("📋 Code copied — send it to your friend!");
      } catch {
        $("#my-code").select();
        document.execCommand("copy");
        toast("📋 Code copied!");
      }
    });

    // Buddy — import
    $("#import-code-btn").addEventListener("click", () => {
      const input = $("#buddy-code-input").value.trim();
      const msg = $("#import-msg");
      if (!input) { msg.textContent = "Paste a code first."; msg.className = "import-msg err"; return; }
      try {
        const snap = decodeSnapshot(input);
        state.buddy = snap;
        save();
        checkBadges();
        renderAll();
        msg.textContent = `Added ${snap.name}! 🎉`;
        msg.className = "import-msg ok";
        $("#buddy-code-input").value = "";
      } catch {
        msg.textContent = "Hmm, that code doesn't look right. Double-check it.";
        msg.className = "import-msg err";
      }
    });

    $("#remove-buddy-btn").addEventListener("click", () => {
      state.buddy = null;
      save();
      renderAll();
    });

    // Cheers
    $$(".btn-cheer").forEach(b => {
      b.addEventListener("click", () => {
        const cheer = b.dataset.cheer;
        $("#cheer-msg").textContent = `Sent "${cheer}" to ${state.buddy?.name || "your buddy"}! Share it with them 💌`;
        runConfetti();
        $("#celebrate").classList.remove("hidden");
        $("#celebrate-msg").textContent = cheer;
        setTimeout(() => $("#celebrate").classList.add("hidden"), 1200);
      });
    });

    // Reset
    $("#reset-btn").addEventListener("click", () => {
      if (confirm("Reset everything? This clears all your goals, points and buddy.")) {
        localStorage.removeItem(STORAGE_KEY);
        state = defaultState();
        location.reload();
      }
    });
  }

  // ---------- Go ----------
  boot();
})();
