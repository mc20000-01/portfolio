const BASE = "https://wbst-api.sdisk.us";
const ROTUR_APP = "";                               // your Rotur app id (app_ + 16 chars). "" hides linking
const ROTUR_SDK = "https://unpkg.com/rotur-sdk";    // pin a version here once you've picked one
const CSS_FILE = "main.css";                        // loaded from the same folder as this script, "" to disable
const BADGE_DIR = "assets/badges/";                 // <name>.svg, relative to this script
const DEBUG_FONT = false;                            // prints fonts under your name, set false when done
const POLL_MS = 3000;
const PICKER_PAGE = 40;
const MAX_DOM_MSGS = 300;
const REFRESH_MS = 12 * 3600 * 1000;                // how often a linked name is refreshed from Rotur
const OFFLINE = "can't reach server";
const JDENTICON = "https://cdn.jsdelivr.net/npm/jdenticon@3.3.0/dist/jdenticon.min.js";
const SCRIPT_URL = (document.currentScript && document.currentScript.src) || location.href;

// ---------- visitor id ----------
async function getVisitorId() {
  try {
    const saved = localStorage.getItem("vid");
    if (saved && /^[0-9a-f]{16}$/.test(saved)) return saved;
  } catch {}

  const n = navigator;
  const parts = {
    ua: n.userAgent,
    platform: n.platform,
    lang: n.languages?.join(","),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    cores: n.hardwareConcurrency,
    mem: n.deviceMemory,
    touch: n.maxTouchPoints,
  };

  if (n.userAgentData) {
    try {
      const h = await n.userAgentData.getHighEntropyValues(
        ["model", "platformVersion", "architecture", "bitness"]
      );
      parts.model = h.model;
      parts.arch = h.architecture;
      parts.bits = h.bitness;
      parts.osver = h.platformVersion;
    } catch {}
  }

  const str = Object.entries(parts).map(([k, v]) => `${k}: ${v}`).join(" | ");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  const id = hex.slice(0, 16);

  try { localStorage.setItem("vid", id); } catch {}
  return id;
}

// ---------- helpers ----------
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = res;
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

function loadCss(href) {
  const abs = new URL(href, SCRIPT_URL).href;
  const already = [...document.querySelectorAll('link[rel="stylesheet"]')].some(l => l.href === abs);
  if (already) return Promise.resolve();
  return new Promise(res => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = abs;
    l.onload = l.onerror = res;
    document.head.appendChild(l);
  });
}

function mkStore(which) {
  return {
    get(k) { try { return window[which].getItem(k); } catch { return null; } },
    set(k, v) { try { window[which].setItem(k, v); } catch {} },
    del(k) { try { window[which].removeItem(k); } catch {} },
  };
}
const local = mkStore("localStorage");
const session = mkStore("sessionStorage");

// token === undefined sends the default token, null sends none (plain GETs stay simple requests)
function makeApi(defaultToken) {
  async function req(path, opts, token) {
    const headers = { ...(opts.headers || {}) };
    const t = token === undefined ? defaultToken() : token;
    if (t) headers["X-Chat-Token"] = t;
    const r = await fetch(BASE + path, { ...opts, headers });
    return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
  }
  return {
    get: (path, token = null) => req(path, {}, token),
    post: (path, body, token) => req(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, token),
  };
}

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "style") e.style.cssText = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e[k] = v;
  }
  for (const k of kids) if (k != null && k !== false) e.append(k);
  return e;
}

// o = { avatar, seed }: a Rotur avatar when linked, otherwise a jdenticon from the seed
function avatar(o, size) {
  const box = el("span", { className: "c-av", style: `width:${size}px;height:${size}px;` });
  const draw = () => { if (window.jdenticon) box.innerHTML = jdenticon.toSvg(o.seed || "x", size); };
  if (o.avatar) {
    const img = el("img", { src: `${o.avatar}?s=${size * 2}`, alt: "", width: size, height: size });
    img.addEventListener("error", () => { img.remove(); draw(); });
    box.append(img);
  } else {
    draw();
  }
  return box;
}

function badgeEl(name, withText) {
  const wrap = el("span", { className: "c-badge", title: name });
  const img = el("img", { src: new URL(`${BADGE_DIR}${encodeURIComponent(name)}.svg`, SCRIPT_URL).href, alt: name, width: 14, height: 14 });
  img.addEventListener("error", () => {
    img.remove();
    if (!withText) wrap.append(el("span", { textContent: `[${name}]` }));
  });
  wrap.append(img);
  if (withText) wrap.append(el("span", { textContent: ` ${name}` }));
  return wrap;
}

// ---------- rotur sdk (loaded only when needed) ----------
let roturP = null;
function getRotur() {
  if (!ROTUR_APP) return Promise.reject(new Error("Rotur linking isn't set up"));
  if (!roturP) {
    roturP = (window.Rotur ? Promise.resolve() : loadScript(ROTUR_SDK))
      .then(() => new window.Rotur({ app: ROTUR_APP }))
      .catch(e => { roturP = null; throw e; });
  }
  return roturP;
}

function whenSignedIn(rotur, ms) {
  return new Promise(res => {
    if (rotur.user) return res(rotur.user);
    const t = setTimeout(() => res(null), ms);
    rotur.onChange(u => { if (u) { clearTimeout(t); res(u); } });
  });
}

// default look lives in a low-priority layer, so anything in main.css always wins
const CSS = `
@layer chat {
  #chat{display:block;width:100%;box-sizing:border-box;--c-line:rgba(128,128,128,.6);--c-soft:rgba(128,128,128,.2)}
  #chat *{box-sizing:border-box}
  #chat [hidden]{display:none !important}
  #chat button,#chat input,#chat select{font:inherit}
  #chat .c-box{width:100%;padding:6px;border:1px solid var(--c-line)}
  #chat .c-head{display:flex;flex-wrap:wrap;align-items:center;gap:6px;border-bottom:1px solid var(--c-line);padding-bottom:6px;margin-bottom:6px}
  #chat .c-me,#chat .c-namebtn,#chat .c-avbtn{display:inline-flex;align-items:center;gap:6px;cursor:pointer;background:none;border:0;color:inherit;padding:0;text-align:left}
  #chat .c-pinsbtn{margin-left:auto;cursor:pointer}
  #chat .c-debug{flex-basis:100%;font-size:11px;opacity:.7;word-break:break-all}
  #chat .c-av{display:inline-block;flex:none;overflow:hidden}
  #chat .c-av img{display:block;width:100%;height:100%;object-fit:cover}
  #chat .c-panel{border:1px solid var(--c-line);padding:6px;margin-bottom:6px}
  #chat .c-pins{max-height:220px;overflow-y:auto}
  #chat .c-row{display:flex;align-items:center;gap:4px;margin-bottom:4px}
  #chat .c-row input{flex:1;min-width:0}
  #chat .c-note{font-size:11px;opacity:.6;margin-bottom:6px}
  #chat .c-grid{display:flex;flex-wrap:wrap;gap:3px;margin:4px 0}
  #chat .c-tile{cursor:pointer;border:1px solid transparent;padding:1px;background:none;color:inherit}
  #chat .c-tile:hover{border-color:var(--c-line)}
  #chat .c-tile.sel{outline:2px solid currentColor}
  #chat .c-auto{width:36px;height:36px;border:1px dashed currentColor}
  #chat .c-pf-top{display:flex;gap:10px;align-items:center;margin-bottom:6px}
  #chat .c-pf-badges{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px}
  #chat .c-badge{display:inline-flex;align-items:center;vertical-align:middle}
  #chat .c-badge img{width:14px;height:14px}
  #chat .c-log{position:relative;height:260px;overflow-y:auto;border:1px solid var(--c-line);padding:4px;margin-bottom:6px}
  #chat .c-status{opacity:.6}
  #chat .c-msg{display:flex;gap:6px;margin-bottom:6px;align-items:flex-start;padding:2px}
  #chat .c-msg.is-pinned{border-left:2px solid var(--c-line)}
  #chat .c-msg.flash{background:var(--c-soft)}
  #chat .c-body{min-width:0;flex:1}
  #chat .c-line{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
  #chat .c-name{font-weight:bold}
  #chat .c-id,#chat .c-time{font-size:11px;opacity:.6}
  #chat .c-pintag{font-size:11px;opacity:.7;border:1px solid var(--c-line);padding:0 3px}
  #chat .c-rbtn{font-size:11px;padding:0 4px;cursor:pointer;background:none;border:1px solid var(--c-line);color:inherit;opacity:.6}
  #chat .c-rbtn:hover{opacity:1}
  #chat .c-admin-only{display:none}
  #chat .is-admin .c-admin-only{display:inline-flex;gap:4px}
  #chat .c-quote{font-size:11px;opacity:.7;border-left:2px solid var(--c-line);padding-left:5px;margin:2px 0;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #chat .c-text{word-break:break-word;white-space:pre-wrap}
  #chat .c-replybar{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-bottom:4px;font-size:12px}
  #chat .c-chip{font-size:11px;cursor:pointer;background:var(--c-soft);border:1px solid var(--c-line);color:inherit;padding:0 4px}
  #chat .c-form{display:flex;gap:4px}
  #chat .c-form input{flex:1;min-width:0}
  #chat .c-err{color:#c00;min-height:1.2em;font-size:12px}
}`;

// ---------- chat ----------
async function buildChat(id) {
  const root = document.getElementById("chat");
  if (!root) return;
  root.style.display = "block";
  root.textContent = "";

  document.head.append(el("style", { textContent: CSS }));
  await Promise.all([
    loadScript(JDENTICON).catch(() => {}),
    CSS_FILE ? loadCss(CSS_FILE) : null,
  ]);

  // ----- tokens: a link token from Rotur linking, an admin token from /admin -----
  const kL = `chat_ltok_${id}`, kA = `chat_atok_${id}`, kR = `chat_lref_${id}`, kP = "chat_link_pending";
  const linkToken = () => local.get(kL);
  function adminState() {
    try {
      const a = JSON.parse(local.get(kA) || "null");
      if (a && a.token && a.exp > Date.now()) return a;
    } catch {}
    return null;
  }
  function writeToken() {
    const a = adminState();
    return linkToken() || (a && a.token) || null;
  }
  const api = makeApi(writeToken);

  // ----- elements -----
  const head = el("div", { className: "c-head" });
  const pinsBtn = el("button", { type: "button", className: "c-pinsbtn", textContent: "pins" });
  const panel = el("div", { className: "c-panel", hidden: true });
  const profile = el("div", { className: "c-panel", hidden: true });
  const pinsBox = el("div", { className: "c-panel c-pins", hidden: true });
  const status = el("div", { className: "c-status", textContent: "loading..." });
  const msgs = el("div", { className: "c-msgs" });
  const log = el("div", { className: "c-log" }, status, msgs);
  const replyBar = el("div", { className: "c-replybar", hidden: true });
  const pw = el("input", { type: "password", placeholder: "admin password", autocomplete: "current-password", maxLength: 200 });
  const adminBox = el("div", { className: "c-row", hidden: true },
    pw,
    el("button", { type: "button", textContent: "log in", onclick: () => adminLogin() }),
    el("button", { type: "button", textContent: "cancel", onclick: () => { adminBox.hidden = true; pw.value = ""; } })
  );
  const err = el("div", { className: "c-err" });
  const input = el("input", { type: "text" });
  const sendBtn = el("button", { type: "button", textContent: "send" });
  const form = el("div", { className: "c-form" }, input, sendBtn);
  const box = el("div", { className: "c-box" }, head, panel, profile, pinsBox, log, replyBar, adminBox, err, form);
  root.append(box);

  // ----- state -----
  let me = {};
  let lastId = 0;
  let gen = 0;               // bumps on reload so stale poll results get thrown away
  let polling = false;
  let pollAgain = false;
  let forceScroll = false;
  let page = 0;
  let lastPins = [];
  const replyTo = new Map(); // msg id -> name

  async function loadMe() {
    const r = await api.get(`/cht/me?id=${id}`, writeToken());
    if (!r.ok || !r.data || r.data.error) throw new Error("me failed");
    me = r.data;
  }
  await loadMe();
  const maxLen = me.max_len || 200;
  const maxReplies = me.max_replies || 5;
  const nameMax = me.name_max || 10;
  const pages = Math.ceil(me.pfp_max / PICKER_PAGE);
  input.maxLength = maxLen;
  input.placeholder = `say something (${maxLen} max)`;

  function showFail(res, fallback) {
    const d = res.data || {};
    if (d.code === "token_required") {
      err.textContent = me.linked
        ? "your Rotur login is missing here. link your account again in settings"
        : "this identity is protected. type /admin to log in";
    } else {
      err.textContent = d.error || fallback;
    }
  }

  // ----- header, settings panel -----
  function renderHead() {
    head.textContent = "";
    const nameEl = el("span", { textContent: `you: ${me.name}` });
    head.append(
      el("button", { className: "c-me", type: "button", title: "settings", onclick: togglePanel },
        avatar(me, 28),
        nameEl,
        me.n ? el("span", { className: "c-id", textContent: `user ${me.n}` }) : null
      ),
      pinsBtn
    );
    if (DEBUG_FONT) {
      const f = n => getComputedStyle(n).fontFamily;
      head.append(el("div", {
        className: "c-debug",
        textContent: `fonts | page: ${f(document.body)} | name: ${f(nameEl)} | input: ${f(input)} | button: ${f(sendBtn)}`,
      }));
    }
  }

  function togglePanel() {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) renderPanel();
  }

  function renderPanel() {
    panel.textContent = "";
    const a = adminState();
    if (a) {
      panel.append(el("div", { className: "c-row" },
        el("span", { textContent: `admin session: ${a.role}` }),
        el("button", { type: "button", textContent: "log out", onclick: adminLogout })
      ));
    } else if (me.role) {
      panel.append(el("div", { className: "c-note", textContent: `you're ${me.role}. type /admin in the message box to log in.` }));
    }

    if (me.linked) {
      panel.append(
        el("div", { textContent: "linked to Rotur: your name and pfp come from your Rotur account." }),
        el("div", { className: "c-row" },
          el("button", { type: "button", textContent: "refresh from Rotur", onclick: e => linkClick(e.currentTarget) }),
          el("button", { type: "button", textContent: "unlink", onclick: unlinkClick })
        )
      );
      return;
    }

    const nameInput = el("input", { type: "text", maxLength: nameMax, value: me.username || "", placeholder: "blank = random name" });
    nameInput.addEventListener("input", () => {
      nameInput.value = nameInput.value.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    });
    nameInput.addEventListener("keydown", e => { if (e.key === "Enter") saveName(nameInput.value); });

    const grid = el("div", { className: "c-grid" });
    grid.append(el("button", {
      type: "button", className: "c-tile c-auto" + (me.pfp === 0 ? " sel" : ""),
      title: "auto (unique to you)", textContent: "auto", onclick: () => choosePfp(0),
    }));
    const start = page * PICKER_PAGE + 1;
    const end = Math.min(start + PICKER_PAGE - 1, me.pfp_max);
    for (let n = start; n <= end; n++) {
      const t = el("button", {
        type: "button", className: "c-tile" + (me.pfp === n ? " sel" : ""),
        title: `#${n}`, onclick: () => choosePfp(n),
      });
      t.append(avatar({ seed: `pfp-${n}` }, 32));
      grid.append(t);
    }

    panel.append(
      el("div", { className: "c-row" },
        el("span", { textContent: "name:" }),
        nameInput,
        el("button", { type: "button", textContent: "save", onclick: () => saveName(nameInput.value) })
      ),
      el("div", { className: "c-note", textContent: `a-z 0-9 - _ only, ${nameMax} max. a short id tag gets added to the end.` }),
      el("div", { textContent: "profile picture:" }),
      grid,
      el("div", {},
        el("button", { type: "button", textContent: "<", onclick: () => { page = (page - 1 + pages) % pages; renderPanel(); } }),
        ` page ${page + 1}/${pages} `,
        el("button", { type: "button", textContent: ">", onclick: () => { page = (page + 1) % pages; renderPanel(); } })
      )
    );

    if (ROTUR_APP) {
      panel.append(
        el("div", { className: "c-note", textContent: "or use your Rotur account for your name and pfp. it shows as yourname-rtr:" }),
        el("button", { type: "button", textContent: "link Rotur account", onclick: e => linkClick(e.currentTarget) })
      );
      getRotur().catch(() => {});   // preload so the sign-in window opens straight from the click
    }
  }

  async function choosePfp(n) {
    err.textContent = "";
    try {
      const res = await api.post("/cht/pfp", { id, pfp: n });
      if (!res.ok) { showFail(res, "couldn't set pfp"); return; }
      me.pfp = res.data.pfp;
      me.seed = res.data.seed;
      me.name = res.data.name;
      panel.hidden = true;
      renderHead();
      reloadLog();
    } catch { err.textContent = OFFLINE; }
  }

  async function saveName(name) {
    err.textContent = "";
    try {
      const res = await api.post("/cht/name", { id, name });
      if (!res.ok) { showFail(res, "couldn't set name"); return; }
      me.username = res.data.username;
      me.name = res.data.name;
      panel.hidden = true;
      renderHead();
      reloadLog();
    } catch { err.textContent = OFFLINE; }
  }

  // ----- rotur linking -----
  async function doLink(rotur) {
    const headers = { "Content-Type": "application/json" };
    const t = writeToken();
    if (t) headers["X-Chat-Token"] = t;
    const res = await rotur.fetch(`${BASE}/cht/link`, { method: "POST", headers, body: JSON.stringify({ id }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "couldn't link");
    local.set(kL, data.token);
    local.set(kR, String(Date.now()));
    return data;
  }

  async function afterLink() {
    await loadMe();
    panel.hidden = true;
    renderHead();
    reloadLog();
    loadPins();
  }

  async function linkClick(btn) {
    err.textContent = "";
    btn.disabled = true;
    try {
      const rotur = await getRotur();
      if (!rotur.user) {
        session.set(kP, "1");   // if the browser blocks the window, the page returns here after sign-in
        await rotur.signIn();
      }
      session.del(kP);
      await doLink(rotur);
      await afterLink();
    } catch (e) {
      session.del(kP);
      err.textContent = e && e.code === "closed" ? "sign-in window closed" : (e && e.message) || "couldn't link";
    }
    btn.disabled = false;
  }

  async function unlinkClick() {
    err.textContent = "";
    try {
      const res = await api.post("/cht/unlink", { id });
      if (!res.ok) { showFail(res, "couldn't unlink"); return; }
      local.del(kL);
      local.del(kR);
      await afterLink();
    } catch { err.textContent = OFFLINE; }
  }

  async function finishPendingLink() {
    if (!ROTUR_APP || !session.get(kP)) return;
    session.del(kP);
    try {
      const rotur = await getRotur();
      const user = await whenSignedIn(rotur, 8000);
      if (!user) { err.textContent = "Rotur sign-in didn't finish"; return; }
      await doLink(rotur);
      await afterLink();
    } catch (e) { err.textContent = (e && e.message) || "couldn't link"; }
  }

  async function maybeRefreshLink() {
    if (!ROTUR_APP || !linkToken()) return;
    if (Date.now() - (Number(local.get(kR)) || 0) < REFRESH_MS) return;
    local.set(kR, String(Date.now()));   // try at most once per interval, signed in or not
    try {
      const rotur = await getRotur();
      const user = await whenSignedIn(rotur, 4000);
      if (!user) return;
      await doLink(rotur);
      await loadMe();
      renderHead();
      reloadLog();
    } catch {}
  }

  // ----- admin -----
  function setAdminUI() {
    box.classList.toggle("is-admin", !!adminState());
  }

  async function adminLogin() {
    const password = pw.value;
    if (!password) { err.textContent = "type the admin password"; return; }
    err.textContent = "";
    try {
      const res = await api.post("/cht/admin/login", { id, password });
      pw.value = "";
      if (!res.ok) { err.textContent = res.data.error || "login failed"; return; }
      local.set(kA, JSON.stringify({
        token: res.data.token, role: res.data.role, badges: res.data.badges,
        exp: Date.now() + res.data.expires_in * 1000,
      }));
      adminBox.hidden = true;
      setAdminUI();
      await loadMe();
      renderHead();
    } catch { err.textContent = OFFLINE; }
  }

  async function adminLogout() {
    const a = adminState();
    if (a) { try { await api.post("/cht/admin/logout", {}, a.token); } catch {} }
    local.del(kA);
    setAdminUI();
    panel.hidden = true;
  }

  async function adminPost(path, body) {
    const a = adminState();
    if (!a) { setAdminUI(); err.textContent = "admin session expired. type /admin"; return null; }
    try {
      const res = await api.post(path, { id, ...body }, a.token);
      if (res.status === 401 && res.data.code === "admin_required") {
        local.del(kA);
        setAdminUI();
        err.textContent = "admin session expired. type /admin";
        return null;
      }
      if (!res.ok) { err.textContent = res.data.error || "failed"; return null; }
      return res.data;
    } catch { err.textContent = OFFLINE; return null; }
  }

  function markPinned(mid, state) {
    root.querySelectorAll(`.c-msg[data-id="${mid}"]`).forEach(row => {
      row.classList.toggle("is-pinned", state);
      const b = row.querySelector(".c-pinbtn");
      if (b) b.textContent = state ? "unpin" : "pin";
      const t = row.querySelector(".c-pintag");
      if (t) t.hidden = !state;
    });
  }

  async function togglePin(mid) {
    const row = root.querySelector(`.c-msg[data-id="${mid}"]`);
    const want = !(row && row.classList.contains("is-pinned"));
    const d = await adminPost("/cht/pin", { msg: mid, pin: want });
    if (!d) return;
    markPinned(mid, want);
    loadPins();
  }

  function confirmDelete(btn, mid) {
    if (btn.dataset.armed) { deleteMsg(mid); return; }
    btn.dataset.armed = "1";
    btn.textContent = "sure?";
    setTimeout(() => { delete btn.dataset.armed; btn.textContent = "del"; }, 3000);
  }

  async function deleteMsg(mid) {
    const d = await adminPost("/cht/admin/delete", { msg: mid });
    if (!d) return;
    root.querySelectorAll(`.c-msg[data-id="${mid}"]`).forEach(r => r.remove());
    loadPins();
  }

  // ----- pins -----
  async function loadPins() {
    try {
      const r = await api.get("/cht/pins");
      if (!r.ok || !r.data.messages) return;
      lastPins = r.data.messages;
      pinsBtn.textContent = lastPins.length ? `pins (${lastPins.length})` : "pins";
      if (!pinsBox.hidden) renderPins();
    } catch {}
  }

  function renderPins() {
    pinsBox.textContent = "";
    if (!lastPins.length) { pinsBox.append(el("div", { className: "c-status", textContent: "nothing pinned" })); return; }
    pinsBox.append(el("div", { className: "c-note", textContent: "pinned messages" }));
    lastPins.forEach(m => pinsBox.append(renderMsg(m)));
  }

  pinsBtn.addEventListener("click", () => {
    pinsBox.hidden = !pinsBox.hidden;
    if (!pinsBox.hidden) renderPins();
  });

  // ----- profile popup -----
  async function showProfile(n) {
    if (!n) return;
    profile.hidden = false;
    profile.textContent = "loading...";
    try {
      const r = await api.get(`/cht/profile?n=${n}`);
      if (!r.ok) { profile.textContent = "couldn't load that profile"; return; }
      renderProfile(r.data);
    } catch { profile.textContent = OFFLINE; }
  }

  function renderProfile(p) {
    profile.textContent = "";
    const joined = p.joined_at ? new Date(p.joined_at * 1000).toLocaleDateString() : "before join dates were recorded";
    profile.append(
      el("div", { className: "c-pf-top" },
        avatar(p, 56),
        el("div", {},
          el("div", { className: "c-name", textContent: p.name }),
          el("div", { className: "c-note", textContent: `user #${p.n} · joined ${joined}` }),
          p.rotur ? el("div", { className: "c-note", textContent: "linked to a Rotur account" }) : null
        )
      ),
      el("div", { className: "c-pf-badges" },
        ...(p.badges.length ? p.badges.map(b => badgeEl(b, true)) : [el("span", { className: "c-note", textContent: "no badges yet" })])
      )
    );

    const a = adminState();
    if (a && a.badges && a.badges.length) {
      const sel = el("select", {}, ...a.badges.map(b => el("option", { value: b, textContent: b })));
      const act = async give => {
        const d = await adminPost("/cht/admin/badge", { n: p.n, badge: sel.value, give });
        if (d) showProfile(p.n);
      };
      profile.append(el("div", { className: "c-row" },
        el("span", { textContent: "badge:" }), sel,
        el("button", { type: "button", textContent: "give", onclick: () => act(true) }),
        el("button", { type: "button", textContent: "remove", onclick: () => act(false) })
      ));
    }
    profile.append(el("button", { type: "button", textContent: "close", onclick: () => { profile.hidden = true; } }));
  }

  // ----- replies -----
  function addReply(msgId, name) {
    if (replyTo.has(msgId)) {
      replyTo.delete(msgId);
    } else {
      if (replyTo.size >= maxReplies) { err.textContent = `max ${maxReplies} replies`; return; }
      replyTo.set(msgId, name);
    }
    err.textContent = "";
    renderReplyBar();
    input.focus();
  }

  function renderReplyBar() {
    replyBar.textContent = "";
    replyBar.hidden = replyTo.size === 0;
    if (!replyTo.size) return;
    replyBar.append(el("span", { textContent: "replying to:" }));
    for (const [mid, name] of replyTo) {
      replyBar.append(el("button", {
        type: "button", className: "c-chip", title: "remove",
        textContent: `${name} #${mid} x`,
        onclick: () => { replyTo.delete(mid); renderReplyBar(); },
      }));
    }
  }

  function jumpTo(msgId) {
    const row = msgs.querySelector(`[data-id="${msgId}"]`);
    if (!row) { err.textContent = "that message isn't on screen"; return; }
    log.scrollTop = Math.max(0, row.offsetTop - 4);
    row.classList.add("flash");
    setTimeout(() => row.classList.remove("flash"), 1200);
  }

  // ----- messages -----
  function renderMsg(m) {
    const t = new Date(m.ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const body = el("div", { className: "c-body" });

    body.append(
      el("div", { className: "c-line" },
        el("button", { type: "button", className: "c-namebtn c-name", textContent: m.name, title: "view profile", onclick: () => showProfile(m.n) }),
        ...(m.badges || []).map(b => badgeEl(b)),
        el("span", { className: "c-id", textContent: `#${m.id}` }),
        el("span", { className: "c-time", textContent: t }),
        el("span", { className: "c-pintag", textContent: "pinned", hidden: !m.pinned }),
        el("button", { type: "button", className: "c-rbtn", textContent: "reply", title: "reply to this message", onclick: () => addReply(m.id, m.name) }),
        el("span", { className: "c-admin-only" },
          el("button", { type: "button", className: "c-rbtn c-pinbtn", textContent: m.pinned ? "unpin" : "pin", onclick: () => togglePin(m.id) }),
          el("button", { type: "button", className: "c-rbtn", textContent: "del", onclick: e => confirmDelete(e.currentTarget, m.id) })
        )
      )
    );

    for (const r of m.replies || []) {
      const q = el("div", {
        className: "c-quote",
        textContent: r.gone ? `\u21AA #${r.id} (deleted)` : `\u21AA ${r.name} #${r.id}: ${r.text}`,
      });
      if (!r.gone) q.addEventListener("click", () => jumpTo(r.id));
      body.append(q);
    }

    body.append(el("div", { className: "c-text", textContent: m.text }));

    const row = el("div", { className: "c-msg" + (m.pinned ? " is-pinned" : "") },
      el("button", { type: "button", className: "c-avbtn", title: "view profile", onclick: () => showProfile(m.n) }, avatar(m, 28)),
      body
    );
    row.dataset.id = m.id;
    return row;
  }

  function reloadLog() {
    gen++;
    lastId = 0;
    forceScroll = true;
    msgs.textContent = "";
    status.textContent = "loading...";
    status.hidden = false;
    return poll();
  }

  async function poll() {
    if (document.hidden) return;
    if (polling) { pollAgain = true; return; }
    polling = true;
    const myGen = gen;
    try {
      const r = await api.get(`/cht/msgs?after=${lastId}&limit=100`);
      if (myGen !== gen) return;                      // log was reloaded mid-request
      if (!r.ok || !r.data.messages) throw new Error("bad response");
      const list = r.data.messages;

      if (err.textContent === OFFLINE) err.textContent = "";

      if (list.length) {
        const wasEmpty = lastId === 0;
        const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
        for (const m of list) {
          msgs.append(renderMsg(m));
          lastId = Math.max(lastId, m.id);
        }
        while (msgs.children.length > MAX_DOM_MSGS) msgs.removeChild(msgs.firstChild);
        if (forceScroll || wasEmpty || atBottom) {
          log.scrollTop = log.scrollHeight;
          forceScroll = false;
        }
      }

      status.hidden = msgs.children.length > 0;
      if (!msgs.children.length) status.textContent = "no messages yet";
    } catch {
      if (!err.textContent) err.textContent = OFFLINE;
    } finally {
      polling = false;
      if (pollAgain || myGen !== gen) { pollAgain = false; poll(); }
    }
  }

  async function send() {
    const text = input.value.trim();
    if (!text) { err.textContent = "type something first"; return; }
    if (text === "/admin") {                          // secret door, never sent as a message
      input.value = "";
      adminBox.hidden = false;
      pw.focus();
      return;
    }
    sendBtn.disabled = true;
    err.textContent = "";
    try {
      const res = await api.post("/cht/send", { id, text, reply_to: [...replyTo.keys()] });
      if (res.ok) {
        input.value = "";
        replyTo.clear();
        renderReplyBar();
        forceScroll = true;
        await poll();
        if (!me.n) { await loadMe(); renderHead(); }   // first message gives them a user number
      } else {
        showFail(res, "send failed");
        if (res.data.missing) {                       // replied-to message no longer exists
          res.data.missing.forEach(i => replyTo.delete(i));
          renderReplyBar();
        }
      }
    } catch { err.textContent = OFFLINE; }
    sendBtn.disabled = false;
    input.focus();
  }

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", e => { if (e.key === "Enter") send(); });
  input.addEventListener("input", () => { err.textContent = ""; });
  pw.addEventListener("keydown", e => { if (e.key === "Enter") adminLogin(); });

  renderHead();
  renderReplyBar();
  setAdminUI();
  setInterval(setAdminUI, 60000);
  await poll();
  loadPins();
  setInterval(poll, POLL_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });

  if (session.get(kP)) finishPendingLink();
  else maybeRefreshLink();
}

// ---------- start ----------
(async () => {
  const countEl = document.getElementById("count");
  const chatEl = document.getElementById("chat");
  let id;
  try {
    id = await getVisitorId();
  } catch {
    if (countEl) countEl.textContent = "??????";
    if (chatEl) chatEl.textContent = "chat unavailable";
    return;
  }

  if (countEl) {
    try {
      const r = await makeApi(() => null).get(`/vc/hit?id=${id}`);
      countEl.textContent = "vistor count: " + String(r.data.count - 1);
    } catch {
      countEl.textContent = "??????";
    }
  }

  try {
    await buildChat(id);
  } catch (e) {
    console.error(e);
    if (chatEl) chatEl.textContent = "chat unavailable";
  }
})();