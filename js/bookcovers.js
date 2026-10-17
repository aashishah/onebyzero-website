const B = [
  [
    "The Starborn Heir",
    "Evelyn Hatcher",
    "Fantasy",
    "img",
    "#2ddae0",
    "A minimal, magical design with a strong sense of adventure and fantastical elements and monotone color palettes.",
    "../media/covers/FantasyIllustrated.jpg",
  ],
  [
    "Our Resonating Souls",
    "Shana Stephens",
    "Paranormal Fantasy",
    "img",
    "#363d85",
    "Rain-soaked gothic streets, a glowing lantern and ornate gold lettering set the mood for a story of fate and the supernatural.",
    "../media/covers/our-resonating-souls.jpg",
  ],
  [
    "Mending My Broken Pieces",
    "Mildred Gates Willingham",
    "Memoir",
    "img",
    "#ffffff",
    "A warm, hopeful design with subtle textures and a soft, comforting colour palette.",
    "../media/covers/mmbp.jpg",
  ],
  [
    "When Halloween Was Green",
    "Bernard Finnigan",
    "Fantasy / Horror",
    "img",
    "#d5733a",
    "A playful, spooky design depicting the actual story and some of it's elements.",
    "../media/covers/whwg.png",
  ],
  [
    "Echoes Of Now",
    "Lilian Hayes",
    "Self-Help",
    "img",
    "#dd945f",
    "A minimalist, modern design with a single bold element.",
    "../media/covers/EchoesOfNow.jpg",
  ],
  [
    "Storm Forged",
    "Cassandra Vale",
    "Fantasy",
    "img",
    "#674eac",
    "A stormy, dramatic design with a strong sense of motion and a hint of magic.",
    "../media/covers/StormForged.jpg",
  ],
  [
    "Within These Walls",
    "Daniel Mercer",
    "Thriller",
    "img",
    "#a1170e",
    "Bold, dramatic design with a strong sense of tension and mystery.",
    "../media/covers/WTW.jpg",
  ],
];
const $ = (s) => document.querySelector(s),
  T = $("#track"),
  V = $("#view");

const mk = (b) =>
  `<div class="cover ${b[3]}" style="--c:${b[4]}44">${
    b[6]
      ? `<img src="${b[6]}" alt="${b[0]} by ${b[1]}" draggable="false" loading="lazy">`
      : `<i class="art"></i><span class="t">${b[0]}</span><span class="a">${b[1]}</span>`
  }</div>`;

T.innerHTML = B.map(
  (b, i) => `<div class="card" data-i="${i}">${mk(b)}</div>`,
).join("");

const pad = (n) => String(n + 1).padStart(2, "0");
// cursor glow + hover colour
addEventListener("pointermove", (e) => {
  const g = $("#glow").style;
  g.setProperty("--mx", e.clientX + "px");
  g.setProperty("--my", e.clientY + "px");
});
T.querySelectorAll(".card").forEach((c) => {
  const cv = c.firstChild,
    b = B[c.dataset.i];
  c.onpointermove = (e) => {
    if (e.pointerType === "touch") return;
    const r = c.getBoundingClientRect(),
      x = (e.clientX - r.left) / r.width - 0.5,
      y = (e.clientY - r.top) / r.height - 0.5;
    cv.style.transform = `rotateY(${x * 22}deg) rotateX(${-y * 18}deg) scale(1.06)`;
  };
  c.onpointerenter = () => $("#glow").style.setProperty("--glow", b[4] + "aa");
  c.onpointerleave = () => {
    cv.style.transform = "";
    $("#glow").style.setProperty("--glow", "#5b34d6");
  };
});
// wheel -> horizontal, drag to scroll
T.addEventListener(
  "wheel",
  (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      T.scrollLeft += e.deltaY * 1.2;
    }
  },
  { passive: false },
);
let down = false,
  sx = 0,
  sl = 0,
  moved = 0;
T.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "touch") return;
  down = true;
  moved = 0;
  sx = e.clientX;
  sl = T.scrollLeft;
});
addEventListener("pointermove", (e) => {
  if (!down) return;
  const d = e.clientX - sx;
  moved = Math.max(moved, Math.abs(d));
  if (moved > 5) T.classList.add("drag");
  T.scrollLeft = sl - d;
});
addEventListener("pointerup", () => {
  down = false;
  T.classList.remove("drag");
});
// progress
const upd = () => {
  const m = T.scrollWidth - T.clientWidth,
    p = m ? T.scrollLeft / m : 0;
  $("#bar").style.width = p * 100 + "%";
  $("#count").textContent =
    pad(Math.round(p * (B.length - 1))) + " / " + pad(B.length - 1);
};
T.addEventListener("scroll", upd);
upd();
// viewer
let cur = 0;
const show = (i) => {
  cur = (i + B.length) % B.length;
  const b = B[cur];
  $("#vcover").innerHTML = mk(b);
  $("#vg").textContent = b[2] + " · " + pad(cur);
  $("#vt").textContent = b[0];
  $("#vd").textContent = b[5];
  V.classList.add("on");
};
T.addEventListener("click", (e) => {
  const c = e.target.closest(".card");
  if (c && moved <= 5) show(+c.dataset.i);
});
$("#close").onclick = () => V.classList.remove("on");
$("#prev").onclick = () => show(cur - 1);
$("#next").onclick = () => show(cur + 1);
V.addEventListener("click", (e) => {
  if (e.target === V) V.classList.remove("on");
});
addEventListener("keydown", (e) => {
  if (!V.classList.contains("on")) {
    if (e.key === "ArrowRight") T.scrollLeft += 300;
    if (e.key === "ArrowLeft") T.scrollLeft -= 300;
    return;
  }
  if (e.key === "Escape") V.classList.remove("on");
  if (e.key === "ArrowRight") show(cur + 1);
  if (e.key === "ArrowLeft") show(cur - 1);
});
