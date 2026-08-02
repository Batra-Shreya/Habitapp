/* Habitat API client — talks to the backend for auth, state sync, and live buddy updates.
   Exposed as window.HabitatAPI. If the backend is unreachable, the app falls back
   to offline (localStorage-only) mode. */

window.HabitatAPI = (() => {
  "use strict";

  const TOKEN_KEY = "habitat.token";
  let token = localStorage.getItem(TOKEN_KEY) || null;
  let es = null;

  function setToken(t) {
    token = t;
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }

  async function req(path, method = "GET", body) {
    const opts = { method, headers: {} };
    if (token) opts.headers["Authorization"] = "Bearer " + token;
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return {
    hasToken: () => !!token,
    getToken: () => token,

    async health() {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        return res.ok;
      } catch { return false; }
    },

    async signup(name, passcode) {
      const d = await req("/api/signup", "POST", { name, passcode });
      setToken(d.token);
      return d;
    },
    async login(name, passcode) {
      const d = await req("/api/login", "POST", { name, passcode });
      setToken(d.token);
      return d;
    },
    logout() { setToken(null); this.closeEvents(); },

    getState() { return req("/api/state"); },
    putState(state, snapshot) { return req("/api/state", "PUT", { state, snapshot }); },

    getBuddy() { return req("/api/buddy"); },
    addBuddy(name) { return req("/api/buddy", "POST", { name }); },
    removeBuddy() { return req("/api/buddy", "DELETE"); },
    cheer(message) { return req("/api/cheer", "POST", { message }); },

    connectEvents(handlers) {
      this.closeEvents();
      if (!token) return null;
      es = new EventSource("/api/events?token=" + encodeURIComponent(token));
      es.addEventListener("hello", () => handlers.hello && handlers.hello());
      es.addEventListener("buddy", e => handlers.buddy && handlers.buddy(JSON.parse(e.data)));
      es.addEventListener("cheer", e => handlers.cheer && handlers.cheer(JSON.parse(e.data)));
      es.onerror = () => handlers.error && handlers.error();
      return es;
    },
    closeEvents() { if (es) { es.close(); es = null; } },
  };
})();
