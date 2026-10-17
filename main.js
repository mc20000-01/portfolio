const BASE = "https://wbst-api.sdisk.us";
const CSS_FILE = "main.css";      // loaded from the same folder as this script, "" to disable
const DEBUG_FONT = false;          // prints the fonts in use under your name, set false when done
const POLL_MS = 3000;
const PICKER_PAGE = 40;
const MAX_DOM_MSGS = 300;
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

const api = {
  async get(path) {
    const r = await fetch(BASE + path);
    return r.json();
  },
  async post(path, body) {
    const r = await fetch(BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: r.ok, data: await r.json().catch(() => ({})) };
  },
};

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

function avatar(seed, size) {
  const box = el("span", { className: "c-av", style: `width:${size}px;height:${size}px;` });
  if (window.jdenticon) box.innerHTML = jdenticon.toSvg(seed, size);
  return box;
}

// default look lives in a low-priority layer, so anything in main.css always wins
const CSS = `
@layer chat {
  #chat{display:block;width:100%;box-sizing:border-box;--c-line:rgba(128,128,128,.6);--c-soft:rgba(128,128,128,.2)}
  #chat *{box-sizing:border-box}
  #chat [hidden]{display:none !important}
  #chat button,#chat input{font:inherit}
  #chat .c-box{width:100%;padding:6px;border:1px solid var(--c-line)}
  #chat .c-head{display:flex;flex-wrap:wrap;align-items:center;gap:6px;border-bottom:1px solid var(--c-line);padding-bottom:6px;margin-bottom:6px}
  #chat .c-me{display:flex;align-items:center;gap:6px;cursor:pointer;background:none;border:0;color:inherit;padding:0}
  #chat .c-debug{flex-basis:100%;font-size:11px;opacity:.7;word-break:break-all}
  #chat .c-av{display:inline-block;flex:none}
  #chat .c-panel{border:1px solid var(--c-line);padding:6px;margin-bottom:6px}
  #chat .c-row{display:flex;align-items:center;gap:4px;margin-bottom:4px}
  #chat .c-row input{flex:1;min-width:0}
  #chat .c-note{font-size:11px;opacity:.6;margin-bottom:6px}
  #chat .c-grid{display:flex;flex-wrap:wrap;gap:3px;margin:4px 0}
  #chat .c-tile{cursor:pointer;border:1px solid transparent;padding:1px;background:none;color:inherit}
  #chat .c-tile:hover{border-color:var(--c-line)}
  #chat .c-tile.sel{outline:2px solid currentColor}
  #chat .c-auto{width:36px;height:36px;border:1px dashed currentColor}
  #chat .c-log{position:relative;height:260px;overflow-y:auto;border:1px solid var(--c-line);padding:4px;margin-bottom:6px}
  #chat .c-status{opacity:.6}
  #chat .c-msg{display:flex;gap:6px;margin-bottom:6px;align-items:flex-start;padding:2px}
  #chat .c-msg.flash{background:var(--c-soft)}
  #chat .c-body{min-width:0;flex:1}
  #chat .c-name{font-weight:bold}
  #chat .c-id,#chat .c-time{font-size:11px;opacity:.6;margin-left:4px}
  #chat .c-rbtn{margin-left:6px;font-size:11px;padding:0 4px;cursor:pointer;background:none;border:1px solid var(--c-line);color:inherit;opacity:.6}
  #chat .c-rbtn:hover{opacity:1}
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

  const head = el("div", { className: "c-head" });
  const panel = el("div", { className: "c-panel", hidden: true });
  const status = el("div", { className: "c-status", textContent: "loading..." });
  const msgs = el("div", { className: "c-msgs" });
  const log = el("div", { className: "c-log" }, status, msgs);
  const replyBar = el("div", { className: "c-replybar", hidden: true });
  const err = el("div", { className: "c-err" });
  const input = el("input", { type: "text" });
  const sendBtn = el("button", { type: "button", textContent: "send" });
  const form = el("div", { className: "c-form" }, input, sendBtn);
  root.append(el("div", { className: "c-box" }, head, panel, log, replyBar, err, form));

  const me = await api.get(`/cht/me?id=${id}`);
  if (!me || me.error) throw new Error("me failed");
  const maxLen = me.max_len || 200;
  const maxReplies = me.max_replies || 5;
  const nameMax = me.name_max || 10;
  input.maxLength = maxLen;
  input.placeholder = `say something (${maxLen} max)`;

  let lastId = 0;
  let gen = 0;               // bumps on reload so stale poll results get thrown away
  let polling = false;
  let pollAgain = false;
  let forceScroll = false;
  let page = 0;
  const pages = Math.ceil(me.pfp_max / PICKER_PAGE);
  const replyTo = new Map(); // msg id -> name

  // ----- header + settings panel -----
  function renderHead() {
    head.textContent = "";
    const nameEl = el("span", { textContent: `you: ${me.name}` });
    head.append(
      el("button", { className: "c-me", type: "button", title: "profile settings", onclick: togglePanel },
        avatar(me.seed, 28),
        nameEl
      )
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

    const nameInput = el("input", { type: "text", maxLength: nameMax, value: me.username || "", placeholder: "blank = random name" });
    nameInput.addEventListener("input", () => {
      nameInput.value = nameInput.value.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    });
    nameInput.addEventListener("keydown", e => { if (e.key === "Enter") saveName(nameInput.value); });
    const nameRow = el("div", { className: "c-row" },
      el("span", { textContent: "name:" }),
      nameInput,
      el("button", { type: "button", textContent: "save", onclick: () => saveName(nameInput.value) })
    );
    const note = el("div", { className: "c-note", textContent: `a-z 0-9 - _ only, ${nameMax} max. a short id tag gets added to the end.` });

    const grid = el("div", { className: "c-grid" });
    grid.append(
      el("button", {
        type: "button", className: "c-tile c-auto" + (me.pfp === 0 ? " sel" : ""),
        title: "auto (unique to you)", textContent: "auto", onclick: () => choosePfp(0),
      })
    );
    const start = page * PICKER_PAGE + 1;
    const end = Math.min(start + PICKER_PAGE - 1, me.pfp_max);
    for (let n = start; n <= end; n++) {
      const t = el("button", {
        type: "button", className: "c-tile" + (me.pfp === n ? " sel" : ""),
        title: `#${n}`, onclick: () => choosePfp(n),
      });
      t.append(avatar(`pfp-${n}`, 32));
      grid.append(t);
    }
    const nav = el("div", {},
      el("button", { type: "button", textContent: "<", onclick: () => { page = (page - 1 + pages) % pages; renderPanel(); } }),
      ` page ${page + 1}/${pages} `,
      el("button", { type: "button", textContent: ">", onclick: () => { page = (page + 1) % pages; renderPanel(); } })
    );

    panel.append(nameRow, note, el("div", { textContent: "profile picture:" }), grid, nav);
  }

  async function choosePfp(n) {
    err.textContent = "";
    try {
      const { ok, data } = await api.post("/cht/pfp", { id, pfp: n });
      if (!ok) { err.textContent = data.error || "couldn't set pfp"; return; }
      me.pfp = data.pfp;
      me.seed = data.seed;
      me.name = data.name;
      panel.hidden = true;
      renderHead();
      reloadLog();
    } catch { err.textContent = OFFLINE; }
  }

  async function saveName(name) {
    err.textContent = "";
    try {
      const { ok, data } = await api.post("/cht/name", { id, name });
      if (!ok) { err.textContent = data.error || "couldn't set name"; return; }
      me.username = data.username;
      me.name = data.name;
      panel.hidden = true;
      renderHead();
      reloadLog();
    } catch { err.textContent = OFFLINE; }
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
      replyBar.append(
        el("button", {
          type: "button", className: "c-chip", title: "remove",
          textContent: `${name} #${mid} x`,
          onclick: () => { replyTo.delete(mid); renderReplyBar(); },
        })
      );
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
        el("span", { className: "c-name", textContent: m.name }),
        el("span", { className: "c-id", textContent: `#${m.id}` }),
        el("span", { className: "c-time", textContent: t }),
        el("button", { type: "button", className: "c-rbtn", textContent: "reply", title: "reply to this message", onclick: () => addReply(m.id, m.name) })
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

    const row = el("div", { className: "c-msg" }, avatar(m.seed, 28), body);
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
      const d = await api.get(`/cht/msgs?after=${lastId}&limit=100`);
      if (myGen !== gen) return;                      // log was reloaded mid-request
      if (!d || !d.messages) throw new Error("bad response");

      if (err.textContent === OFFLINE) err.textContent = "";

      if (d.messages.length) {
        const wasEmpty = lastId === 0;
        const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
        for (const m of d.messages) {
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
    sendBtn.disabled = true;
    err.textContent = "";
    try {
      const { ok, data } = await api.post("/cht/send", { id, text, reply_to: [...replyTo.keys()] });
      if (ok) {
        input.value = "";
        replyTo.clear();
        renderReplyBar();
        forceScroll = true;
        await poll();
      } else {
        err.textContent = data.error || "send failed";
        if (data.missing) {                           // replied-to message no longer exists
          data.missing.forEach(i => replyTo.delete(i));
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

  renderHead();
  renderReplyBar();
  await poll();
  setInterval(poll, POLL_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
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
      const d = await api.get(`/vc/hit?id=${id}`);
      countEl.textContent = "vistor count: " + String(d.count - 1);
    } catch {
      countEl.textContent = "??????";
    }
  }

  try {
    await buildChat(id);
  } catch {
    if (chatEl) chatEl.textContent = "chat unavailable";
  }
})();