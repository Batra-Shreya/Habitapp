"use strict";

/* Backend integration test — starts the real server and exercises auth, state
   sync, buddy linking, and the live Server-Sent Events path (presence, live
   progress, live cheers). Uses only Node built-ins, so CI needs no browser. */

const { spawn } = require("child_process");
const http = require("http");
const os = require("os");
const path = require("path");
const fs = require("fs");

const PORT = 3900 + Math.floor(Math.random() * 200);
const BASE = `http://localhost:${PORT}`;
const DB = path.join(os.tmpdir(), `habitat-test-${Date.now()}.json`);

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗ FAIL:", name); }
};

function request(method, pathname, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const headers = {};
    if (token) headers["Authorization"] = "Bearer " + token;
    if (data) { headers["Content-Type"] = "application/json"; headers["Content-Length"] = Buffer.byteLength(data); }
    const req = http.request(BASE + pathname, { method, headers }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => { try { resolve({ status: res.statusCode, json: d ? JSON.parse(d) : {} }); } catch { resolve({ status: res.statusCode, json: {} }); } });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

// Minimal SSE client that collects events.
function openStream(token) {
  const events = [];
  const req = http.get(BASE + "/api/events?token=" + token, res => {
    res.setEncoding("utf8");
    let buf = "";
    res.on("data", chunk => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const raw = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = (raw.match(/event: (.*)/) || [])[1];
        const dt = (raw.match(/data: (.*)/) || [])[1];
        if (ev) events.push({ ev, data: dt });
      }
    });
  });
  return { events, close: () => req.destroy() };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitForHealth(tries = 50) {
  for (let i = 0; i < tries; i++) {
    try { const r = await request("GET", "/api/health"); if (r.status === 200) return; } catch {}
    await sleep(100);
  }
  throw new Error("server did not become healthy");
}

async function main() {
  const server = spawn(process.execPath, [path.join(__dirname, "..", "server", "server.js")], {
    env: Object.assign({}, process.env, { PORT: String(PORT), HABITAT_DB: DB }),
    stdio: "ignore",
  });

  try {
    await waitForHealth();

    console.log("Auth");
    const a = await request("POST", "/api/signup", { body: { name: "Ann", passcode: "abcd" } });
    check("signup returns a token", a.status === 200 && typeof a.json.token === "string");
    const annToken = a.json.token;
    const b = await request("POST", "/api/signup", { body: { name: "Ben", passcode: "wxyz" } });
    const benToken = b.json.token;
    check("second signup works", b.status === 200 && !!benToken);

    check("duplicate name rejected", (await request("POST", "/api/signup", { body: { name: "Ann", passcode: "1111" } })).status === 409);
    check("short passcode rejected", (await request("POST", "/api/signup", { body: { name: "Zoe", passcode: "1" } })).status === 400);
    check("wrong passcode rejected", (await request("POST", "/api/login", { body: { name: "Ann", passcode: "nope" } })).status === 401);
    check("correct login works", (await request("POST", "/api/login", { body: { name: "Ann", passcode: "abcd" } })).status === 200);
    check("unauthorized state blocked", (await request("GET", "/api/state")).status === 401);

    console.log("State sync");
    await request("PUT", "/api/state", { token: annToken, body: { state: { points: 40, habits: [] }, snapshot: { name: "Ann", avatar: "🦊", points: 40, bestStreak: 4, totalDone: 6 } } });
    const st = await request("GET", "/api/state", { token: annToken });
    check("state round-trips", st.json.state && st.json.state.points === 40);

    console.log("Buddy linking");
    check("add nonexistent buddy 404s", (await request("POST", "/api/buddy", { token: annToken, body: { name: "Ghost" } })).status === 404);
    const link = await request("POST", "/api/buddy", { token: benToken, body: { name: "Ann" } });
    check("Ben links to Ann", link.status === 200 && link.json.buddy.name === "Ann");
    check("Ben sees Ann's synced points", link.json.buddy.points === 40);

    console.log("Live SSE: presence, progress, cheers");
    // Ben watches Ann. Open Ben's stream.
    const ben = openStream(benToken);
    await sleep(250);
    check("stream sends initial buddy snapshot", ben.events.some(e => e.ev === "buddy"));

    // Ann comes online -> Ben should see presence update
    const ann = openStream(annToken);
    await sleep(250);
    check("Ben sees Ann come online", ben.events.some(e => e.ev === "buddy" && /"online":true/.test(e.data)));

    // Ann updates progress -> pushed to Ben live
    await request("PUT", "/api/state", { token: annToken, body: { state: { points: 90 }, snapshot: { name: "Ann", avatar: "🦊", points: 90, bestStreak: 5, totalDone: 9 } } });
    await sleep(250);
    check("Ben sees Ann's live progress (90 pts)", ben.events.some(e => e.ev === "buddy" && /"points":90/.test(e.data)));

    // Ann links back and cheers Ben -> Ben gets a live cheer
    await request("POST", "/api/buddy", { token: annToken, body: { name: "Ben" } });
    const cheer = await request("POST", "/api/cheer", { token: annToken, body: { message: "keep going!" } });
    check("cheer reports delivered (Ben online)", cheer.json.delivered === true);
    await sleep(250);
    check("Ben receives live cheer", ben.events.some(e => e.ev === "cheer" && /keep going/.test(e.data)));

    ben.close(); ann.close();

    console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  } finally {
    server.kill();
    try { fs.unlinkSync(DB); } catch {}
    try { fs.unlinkSync(DB + ".tmp"); } catch {}
  }

  process.exit(fail === 0 ? 0 : 1);
}

main().catch(err => { console.error("TEST CRASHED:", err); process.exit(2); });
