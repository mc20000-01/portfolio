async function myId() {
  let id = localStorage.getItem("sdisk_id");
  if (!id) {
    id = (
      await fetch("https://wbst-api.sdisk.us/make/id").then((r) => r.json())
    ).generated_id;
    localStorage.setItem("sdisk_id", id);
  }
  return id;
}

async function setcount() {
  const res = await fetch("https://wbst-api.sdisk.us/count/" + (await myId()));
  const data = await res.json();
  document.getElementById("count").textContent = "visitors: " + data.visitors;
}

const songs = [
  "01-intro.mp3",
  "02-faster.mp3",
  "03-witches.mp3",
  "04-tell-me-you-know.mp3",
  "05-nomu.mp3",
  "06-alchemist.mp3",
  "07-atlas.mp3",
  "08-ghost-king-appears.mp3",
  "09-ghost-gang-theme.mp3",
  "10-ghost-dance.mp3",
  "11-octochet-theme.mp3",
  "12-mecha-raccoon-theme.mp3",
  "13-ghost-king-theme.mp3",
  "14-final-battle.mp3",
  "15-slingshot.mp3",
  "16-drifting.mp3",
  "17-everything-everything.mp3",
  "18-down-with-the-king.mp3",
  "19-aloe-lite.mp3",
  "20-pox.mp3",
  "21-outro.mp3",
];
let i = 0;
const audio = new Audio("/assets/music/" + songs[0]);
audio.addEventListener("ended", () => {
  i = (i + 1) % songs.length;
  audio.src = "/assets/music/" + songs[i];
  audio.play();
});

const loaded = (el) =>
  new Promise((res) => {
    el.onload = el.onerror = res;
  });

let revealed = false;
function reveal() {
  if (revealed) return;
  revealed = true;
  document.querySelector('link[href$="hide.css"]')?.remove();
}

setTimeout(reveal, 5000);

const scriptsDone = fetch("/scripts.html")
  .then((r) => r.text())
  .then((head) => {
    const doc = new DOMParser().parseFromString(head, "text/html");
    const waits = [];

    for (const old of doc.querySelectorAll("script")) {
      const s = document.createElement("script");
      for (const a of old.attributes) s.setAttribute(a.name, a.value);
      s.async = false;
      s.textContent = old.textContent;
      if (s.src) waits.push(loaded(s));
      document.body.append(s);
    }

    doc.querySelectorAll("link, meta").forEach((n) => {
      if (n.tagName === "LINK" && n.rel === "stylesheet") waits.push(loaded(n));
      document.head.append(n);
    });

    return Promise.all(waits);
  });

const footerDone = fetch("/footer.html")
  .then((r) => r.text())
  .then((body) => {
    document.body.insertAdjacentHTML("beforeEnd", body);
    document.getElementById("play").onclick = () =>
      audio.paused ? audio.play() : audio.pause();
    setcount();
  });

const topbarDone = fetch("/topbar.html")
  .then((r) => r.text())
  .then((body) => {
    document.body.insertAdjacentHTML("afterBegin", body);
  });

Promise.allSettled([
  scriptsDone,
  footerDone,
  topbarDone,
  document.fonts.ready,
]).then(reveal);

window.addEventListener(
  "mousedown",
  () => {
    if (audio.paused) {
      audio.play().catch(() => {});
    }
  },
  { once: true },
);

audio.addEventListener("play", () => {
  document.getElementById("play").textContent = "music  ⏸";
});

audio.addEventListener("pause", () => {
  document.getElementById("play").textContent = "music  ▶";
});

document.addEventListener("DOMContentLoaded", () => {
  const el = document.getElementById("age");
  if (!el) return;

  const birthMs = Date.parse("2012-05-27");
  const msPerYear = 1000 * 60 * 60 * 24 * 365.2425;
  const decimals = 2;

  function tick() {
    const years = (Date.now() - birthMs) / msPerYear;
    el.textContent = years.toFixed(decimals);
    requestAnimationFrame(tick);
  }

  tick();
});
