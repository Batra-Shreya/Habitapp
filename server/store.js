"use strict";

/* Tiny JSON-file store. Good enough for a small self-hosted buddy app:
   no native deps, atomic writes, and everything held in memory for fast reads. */

const fs = require("fs");
const path = require("path");

const DB_PATH = process.env.HABITAT_DB || path.join(__dirname, "db.json");

function emptyDb() {
  return {
    users: {},   // key: lowercased username -> { id, name, passHash, salt, state, snapshot, buddyName, updatedAt }
    tokens: {},  // token -> lowercased username
  };
}

let db = emptyDb();

function loadFromDisk() {
  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    db = Object.assign(emptyDb(), JSON.parse(raw));
  } catch {
    db = emptyDb();
  }
  return db;
}

// Atomic write: write a temp file then rename over the real one, so a crash
// mid-write can never corrupt the database. Creates the directory if needed
// (e.g. a freshly mounted persistent disk).
function writeNow() {
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const tmp = DB_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_PATH);
  } catch (err) {
    console.error("[store] failed to persist:", err.message);
  }
}

let writeTimer = null;
function persist() {
  // Debounce bursts of changes into a single write.
  if (writeTimer) return;
  writeTimer = setTimeout(() => { writeTimer = null; writeNow(); }, 120);
}

// Write immediately, cancelling any pending debounced write. Called on shutdown
// so an in-flight change survives a redeploy/restart.
function flushSync() {
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
  writeNow();
}

function key(name) {
  return String(name || "").trim().toLowerCase();
}

module.exports = {
  DB_PATH,
  init() { return loadFromDisk(); },
  raw() { return db; },
  key,

  getUser(name) { return db.users[key(name)] || null; },
  userExists(name) { return !!db.users[key(name)]; },

  putUser(user) {
    db.users[key(user.name)] = user;
    persist();
    return user;
  },

  setToken(token, name) {
    db.tokens[token] = key(name);
    persist();
  },
  userForToken(token) {
    const k = db.tokens[token];
    return k ? db.users[k] || null : null;
  },
  clearToken(token) {
    delete db.tokens[token];
    persist();
  },

  // Everyone who has picked `name` as their buddy (i.e. is watching them).
  watchersOf(name) {
    const k = key(name);
    return Object.values(db.users).filter(u => key(u.buddyName) === k);
  },

  persist,
  flushSync,
};
