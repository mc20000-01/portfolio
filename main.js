const BASE = "https://wbst-api.sdisk.us";
const POLL_MS = 3000;
const PICKER_PAGE = 40;

async function getVisitorId() {
  const n = navigator;
  const parts = {
    ua: n.userAgent,
    platform: n.platform,
    lang: n.languages?.join(","),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
    dpr: devicePixelRatio,
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
  return hex.slice(0, 16);
}

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = res;
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

const api = {
  get: (path) => fetch(BASE + path).then(r => r.json()),
  post: (path, body) =>
    fetch(BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async r => ({ ok: r.ok, data: await r.json().catch(() => ({})) })),
};

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "style") e.style.cssText = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e[k] = v;
  }
  kids.forEach(k => e.append(k));
  return e;
}

function avatar(seed, size) {
  const box = el("span", { style: `display:inline-block;width:${size}px;height:${size}px;flex:none;` });
  if (window.jdenticon) box.innerHTML = jdenticon.toSvg(seed, size);
  return box;
}

async function buildChat(id) {
  const root = document.getElementById("chat");
  if (!root) return;
  root.style.display = "block";
  root.textContent = "";

  try { await loadScript("https://cdn.jsdelivr.net/npm/jdenticon@3.3.0/dist/jdenticon.min.js"); } catch {}

  const css = el("style", {
    textContent: `
    #chat .c-box{border:1px solid #888;padding:6px;max-width:420px;font:13px monospace;background:#fff;color:#000}
    #chat .c-head{display:flex;align-items:center;gap:6px;border-bottom:1px solid #888;padding-bottom:6px;margin-bottom:6px}
    #chat .c-me{cursor:pointer;display:flex;align-items:center;gap:6px;background:none;border:0;font:inherit;color:inherit;padding:0}
    #chat .c-log{height:240px;overflow-y:auto;border:1px inset #888;padding:4px;margin-bottom:6px}
    #chat .c-msg{display:flex;gap:6px;margin-bottom:5px;align-items:flex-start}
    #chat .c-name{font-weight:bold}
    #chat .c-time{color:#777;font-size:11px;margin-left:4px}
    #chat .c-text{word-break:break-word;white-space:pre-wrap}
    #chat .c-form{display:flex;gap:4px}
    #chat .c-form input{flex:1;min-width:0;font:inherit}
    #chat .c-err{color:#c00;min-height:1.2em;font-size:12px}
    #chat .c-pick{border:1px solid #888;padding:4px;margin-bottom:6px}
    #chat .c-grid{display:flex;flex-wrap:wrap;gap:3px;margin:4px 0}
    #chat .c-tile{cursor:pointer;border:1px solid transparent;padding:1px;background:none}
    #chat .c-tile:hover{border-color:#888}
    #chat .c-tile.sel{border-color:#00f}`,
  });

  const log = el("div", { className: "c-log" }, "loading...");
  const err = el("div", { className: "c-err" });
  const input = el("input", { type: "text", maxLength: 200, placeholder: "say something (200 max)" });
  const sendBtn = el("button", { type: "button", textContent: "send" });
  const form = el("div", { className: "c-form" }, input, sendBtn);
  const head = el("div", { className: "c-head" });
  const picker = el("div", { className: "c-pick", hidden: true });
  const box = el("div", { className: "c-box" }, head, picker, log, err, form);
  root.append(css, box);

  let me = await api.get(`/cht/me?id=${id}`);
  let lastId = 0;
  let page = 0;
  const pages = Math.ceil(me.pfp_max / PICKER_PAGE);

  function renderHead() {
    head.textContent = "";
    const btn = el(
      "button",
      { className: "c-me", type: "button", title: "change profile picture", onclick: () => { picker.hidden = !picker.hidden; if (!picker.hidden) renderPicker(); } },
      avatar(me.seed, 28),
      el("span", {}, `you: ${me.name}`)
    );
    head.append(btn);
  }

  function renderPicker() {
    picker.textContent = "";
    const grid = el("div", { className: "c-grid" });

    const tile = (n, seed, label) => {
      const t = el("button", { type: "button", className: "c-tile" + (me.pfp === n ? " sel" : ""), title: label, onclick: () => choosePfp(n) });
      t.append(avatar(seed, 32));
      return t;
    };

    grid.append(tile(0, me.pfp === 0 ? me.seed : "auto-preview", "auto (unique to you)"));
    const start = page * PICKER_PAGE + 1;
    const end = Math.min(start + PICKER_PAGE - 1, me.pfp_max);
    for (let n = start; n <= end; n++) grid.append(tile(n, `pfp-${n}`, `#${n}`));

    const nav = el(
      "div", {},
      el("button", { type: "button", textContent: "<", onclick: () => { page = (page - 1 + pages) % pages; renderPicker(); } }),
      ` page ${page + 1}/${pages} `,
      el("button", { type: "button", textContent: ">", onclick: () => { page = (page + 1) % pages; renderPicker(); } })
    );
    picker.append(el("div", {}, "pick a pfp (first tile = auto):"), grid, nav);
  }

  async function choosePfp(n) {
    const { ok, data } = await api.post("/cht/pfp", { id, pfp: n });
    if (!ok) { err.textContent = data.error || "couldn't set pfp"; return; }
    me.pfp = data.pfp;
    me.seed = data.seed;
    picker.hidden = true;
    renderHead();
    log.textContent = "";
    lastId = 0;
    poll();
  }

  function addMsg(m) {
    const t = new Date(m.ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    log.append(
      el("div", { className: "c-msg" },
        avatar(m.seed, 28),
        el("div", {},
          el("div", {}, el("span", { className: "c-name", textContent: m.name }), el("span", { className: "c-time", textContent: t })),
          el("div", { className: "c-text", textContent: m.text })
        )
      )
    );
  }

  async function poll() {
    if (document.hidden) return;
    try {
      const d = await api.get(`/cht/msgs?after=${lastId}&limit=100`);
      if (log.firstChild && log.firstChild.nodeType === 3) log.textContent = "";
      if (!d.messages.length) {
        if (!lastId && !log.children.length) log.textContent = "no messages yet";
        return;
      }
      if (!log.children.length) log.textContent = "";
      const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
      d.messages.forEach(m => { addMsg(m); lastId = Math.max(lastId, m.id); });
      while (log.children.length > 300) log.removeChild(log.firstChild);
      if (atBottom || lastId === d.messages[d.messages.length - 1].id) log.scrollTop = log.scrollHeight;
    } catch {
      err.textContent = "can't reach server";
    }
  }

  async function send() {
    const text = input.value.trim();
    if (!text) { err.textContent = "type something first"; return; }
    sendBtn.disabled = true;
    err.textContent = "";
    try {
      const { ok, data } = await api.post("/cht/send", { id, text });
      if (ok) { input.value = ""; await poll(); }
      else err.textContent = data.error || "send failed";
    } catch {
      err.textContent = "can't reach server";
    }
    sendBtn.disabled = false;
    input.focus();
  }

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", e => { if (e.key === "Enter") send(); });
  input.addEventListener("input", () => { err.textContent = ""; });

  renderHead();
  await poll();
  setInterval(poll, POLL_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
}

(async () => {
  const countEl = document.getElementById("count");
  let id;
  try {
    id = await getVisitorId();
  } catch {
    if (countEl) countEl.textContent = "??????";
    const c = document.getElementById("chat");
    if (c) c.textContent = "chat unavailable";
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
    const c = document.getElementById("chat");
    if (c) c.textContent = "chat unavailable";
  }
})();