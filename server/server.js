"use strict";

/* Habitat backend — pure Node.js, zero dependencies.
   - Serves the frontend from ../public
   - Auth: username + passcode (scrypt), bearer tokens
   - REST: sync your state, link a buddy, send cheers
   - Live: Server-Sent Events push a buddy's progress + cheers in real time */

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const store = require("./store");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "..", "public");

store.init();

/* ---------- SSE connection registry (for presence + live push) ---------- */
// userKey -> Set of res objects
const connections = new Map();

function sseAdd(userKey, res) {
  let set = connections.get(userKey);
  const wasEmpty = !set || set.size === 0;
  if (!set) { set = new Set(); connections.set(userKey, set); }
  set.add(res);
  if (wasEmpty) broadcastMyUpdate(userKey); // came online -> tell my watchers
}
function sseRemove(userKey, res) {
  const set = connections.get(userKey);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) {
    connections.delete(userKey);
    broadcastMyUpdate(userKey); // went offline -> tell my watchers
  }
}
function isOnline(userKey) {
  const set = connections.get(userKey);
  return !!set && set.size > 0;
}
function sseSend(userKey, event, data) {
  const set = connections.get(userKey);
  if (!set) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) { try { res.write(payload); } catch {} }
}

/* When `name`'s progress or presence changes, push it to everyone watching them. */
function broadcastMyUpdate(nameOrKey) {
  const user = store.getUser(nameOrKey);
  const name = user ? user.name : nameOrKey;
  const snap = publicSnapshot(user, name);
  for (const watcher of store.watchersOf(name)) {
    sseSend(store.key(watcher.name), "buddy", snap);
  }
}

/* ---------- Snapshot the buddy sees ---------- */
function publicSnapshot(user, fallbackName) {
  if (!user) {
    return { name: fallbackName || "Unknown", avatar: "🙂", points: 0, bestStreak: 0, totalDone: 0, online: false, exists: false };
  }
  const s = user.snapshot || {};
  return {
    name: user.name,
    avatar: s.avatar || (user.state && user.state.avatar) || "🙂",
    points: s.points || (user.state && user.state.points) || 0,
    bestStreak: s.bestStreak || 0,
    totalDone: s.totalDone || 0,
    updated: s.updated || null,
    online: isOnline(store.key(user.name)),
    exists: true,
  };
}

/* ---------- Auth helpers ---------- */
function hashPass(passcode, salt) {
  return crypto.scryptSync(String(passcode), salt, 32).toString("hex");
}
function newToken() {
  return crypto.randomBytes(24).toString("hex");
}
function safeEqualHex(a, b) {
  const ba = Buffer.from(String(a), "hex");
  const bb = Buffer.from(String(b), "hex");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
function tokenFromReq(req, url) {
  const auth = req.headers["authorization"] || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  // EventSource can't set headers, so allow ?token= for the SSE endpoint.
  return url.searchParams.get("token") || null;
}
function authUser(req, url) {
  const token = tokenFromReq(req, url);
  if (!token) return null;
  return store.userForToken(token);
}

/* ---------- HTTP helpers ---------- */
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 1e6) { reject(new Error("body too large")); req.destroy(); }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error("invalid json")); }
    });
    req.on("error", reject);
  });
}
function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type");
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/" || rel === "") rel = "/index.html";
  // Normalize and confine to PUBLIC_DIR (block path traversal).
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      // SPA-ish fallback: unknown paths return index.html
      if (rel !== "/index.html") return serveStatic(req, res, "/index.html");
      res.writeHead(404); return res.end("Not found");
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(buf);
  });
}

/* ---------- Route handlers ---------- */
async function handleSignup(req, res) {
  const { name, passcode } = await readBody(req);
  const clean = String(name || "").trim();
  if (clean.length < 2 || clean.length > 24) return sendJson(res, 400, { error: "Name must be 2–24 characters." });
  if (!/^[\w .\-]+$/.test(clean)) return sendJson(res, 400, { error: "Name can only use letters, numbers, spaces, - . _" });
  if (String(passcode || "").length < 4) return sendJson(res, 400, { error: "Passcode must be at least 4 characters." });
  if (store.userExists(clean)) return sendJson(res, 409, { error: "That name is taken. Try logging in instead." });

  const salt = crypto.randomBytes(16).toString("hex");
  const user = {
    id: "u_" + crypto.randomBytes(6).toString("hex"),
    name: clean,
    salt,
    passHash: hashPass(passcode, salt),
    state: null,
    snapshot: null,
    buddyName: null,
    updatedAt: new Date().toISOString(),
  };
  store.putUser(user);
  const token = newToken();
  store.setToken(token, clean);
  sendJson(res, 200, { token, name: clean, state: null });
}

async function handleLogin(req, res) {
  const { name, passcode } = await readBody(req);
  const user = store.getUser(name);
  if (!user || !safeEqualHex(user.passHash, hashPass(passcode, user.salt))) {
    return sendJson(res, 401, { error: "Wrong name or passcode." });
  }
  const token = newToken();
  store.setToken(token, user.name);
  sendJson(res, 200, { token, name: user.name, state: user.state });
}

async function handleGetState(user, req, res) {
  sendJson(res, 200, { state: user.state, buddyName: user.buddyName || null });
}

async function handlePutState(user, req, res) {
  const body = await readBody(req);
  user.state = body.state || user.state;
  user.snapshot = body.snapshot || user.snapshot;
  user.updatedAt = new Date().toISOString();
  store.putUser(user);
  broadcastMyUpdate(user.name); // push my new progress to my watchers, live
  sendJson(res, 200, { ok: true });
}

async function handleGetBuddy(user, req, res) {
  if (!user.buddyName) return sendJson(res, 200, { buddy: null });
  const buddy = store.getUser(user.buddyName);
  sendJson(res, 200, { buddy: publicSnapshot(buddy, user.buddyName) });
}

async function handlePostBuddy(user, req, res) {
  const { name } = await readBody(req);
  const target = String(name || "").trim();
  if (!target) return sendJson(res, 400, { error: "Enter your buddy's name." });
  if (store.key(target) === store.key(user.name)) return sendJson(res, 400, { error: "You can't add yourself 🙂" });
  const buddy = store.getUser(target);
  if (!buddy) return sendJson(res, 404, { error: `No one here is called "${target}" yet. Ask them to sign up first.` });
  user.buddyName = buddy.name;
  store.putUser(user);
  sendJson(res, 200, { buddy: publicSnapshot(buddy, buddy.name) });
}

async function handleDeleteBuddy(user, req, res) {
  user.buddyName = null;
  store.putUser(user);
  sendJson(res, 200, { ok: true });
}

async function handleCheer(user, req, res) {
  const { message } = await readBody(req);
  if (!user.buddyName) return sendJson(res, 400, { error: "Add a buddy first." });
  const buddyKey = store.key(user.buddyName);
  const online = isOnline(buddyKey);
  sseSend(buddyKey, "cheer", { from: user.name, message: String(message || "👏").slice(0, 80) });
  sendJson(res, 200, { ok: true, delivered: online });
}

function handleEvents(user, req, res) {
  req.socket.setTimeout(0);
  req.socket.setNoDelay(true);
  req.socket.setKeepAlive(true);
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("event: hello\ndata: {}\n\n");

  const userKey = store.key(user.name);
  sseAdd(userKey, res);

  // Immediately send current buddy snapshot so the client is fresh on connect.
  if (user.buddyName) {
    sseSend(userKey, "buddy", publicSnapshot(store.getUser(user.buddyName), user.buddyName));
  }

  // Heartbeat keeps proxies from closing the idle connection.
  const beat = setInterval(() => { try { res.write(": ping\n\n"); } catch {} }, 25000);

  req.on("close", () => {
    clearInterval(beat);
    sseRemove(userKey, res);
  });
}

/* ---------- Router ---------- */
const server = http.createServer(async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  try {
    // Public API
    if (p === "/api/signup" && req.method === "POST") return await handleSignup(req, res);
    if (p === "/api/login" && req.method === "POST") return await handleLogin(req, res);
    if (p === "/api/health" && req.method === "GET") return sendJson(res, 200, { ok: true });

    // Authenticated API
    if (p.startsWith("/api/")) {
      const user = authUser(req, url);
      if (!user) return sendJson(res, 401, { error: "Not signed in." });

      if (p === "/api/state" && req.method === "GET") return await handleGetState(user, req, res);
      if (p === "/api/state" && req.method === "PUT") return await handlePutState(user, req, res);
      if (p === "/api/buddy" && req.method === "GET") return await handleGetBuddy(user, req, res);
      if (p === "/api/buddy" && req.method === "POST") return await handlePostBuddy(user, req, res);
      if (p === "/api/buddy" && req.method === "DELETE") return await handleDeleteBuddy(user, req, res);
      if (p === "/api/cheer" && req.method === "POST") return await handleCheer(user, req, res);
      if (p === "/api/events" && req.method === "GET") return handleEvents(user, req, res);

      return sendJson(res, 404, { error: "Unknown endpoint." });
    }

    // Static frontend
    if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res, p);
    res.writeHead(405); res.end("Method not allowed");
  } catch (err) {
    sendJson(res, 400, { error: err.message || "Bad request" });
  }
});

server.listen(PORT, () => {
  console.log(`\n🌱 Habitat is running at http://localhost:${PORT}`);
  console.log(`   Data file: ${store.DB_PATH}`);
  console.log(`   Open the URL in two browsers to see live buddy sync.\n`);
});
