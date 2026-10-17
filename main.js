const API = "https://wbst-api.sdisk.us/vc/hit";

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
  return hex.slice(0, 16); // truncated to 16 hex chars (64 bits)
}

(async () => {
  const el = document.getElementById("count");
  try {
    const id = await getVisitorId();
    const r = await fetch(`${API}?id=${id}`);
    const d = await r.json();
    el.textContent = String(d.count).padStart(6, "0");
  } catch {
    el.textContent = "??????";
  }
})();