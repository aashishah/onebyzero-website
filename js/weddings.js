(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const pad = (n) => String(n).padStart(2, "0");
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  /* ---------- 1. Scroll reveal ---------- */
  const reveals = $$(".wd-reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("wd-in");
          io.unobserve(e.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("wd-in"));
  }

  /* ---------- 2. Invites carousel ---------- */
  const rail = $("#inviteRail");
  if (rail) {
    const slides = $$(".wd-slide", rail);
    const dotsEl = $("#inviteDots");
    const prevBtn = $("#invitePrev");
    const nextBtn = $("#inviteNext");
    let active = 0;

    // dots + "01 / 03" counters are generated, so adding a slide needs no other edits
    slides.forEach((s, i) => {
      s.setAttribute("aria-label", `${i + 1} of ${slides.length}`);
      const no = $(".wd-cap__no", s);
      if (no) no.textContent = `${pad(i + 1)} / ${pad(slides.length)}`;

      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", `Show invite ${i + 1}`);
      b.addEventListener("click", () => go(i));
      dotsEl.appendChild(b);
    });
    const dots = $$("button", dotsEl);

    const slideLeft = (i) => {
      const s = slides[i];
      return s.offsetLeft - (rail.clientWidth - s.offsetWidth) / 2;
    };
    const go = (i) => {
      i = Math.max(0, Math.min(slides.length - 1, i));
      rail.scrollTo({
        left: slideLeft(i),
        behavior: reduceMotion ? "auto" : "smooth",
      });
    };
    const nearest = () => {
      const mid = rail.scrollLeft + rail.clientWidth / 2;
      let best = 0;
      let bestDist = Infinity;
      slides.forEach((s, i) => {
        const d = Math.abs(s.offsetLeft + s.offsetWidth / 2 - mid);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      return best;
    };

    const setActive = (i) => {
      active = i;
      slides.forEach((s, n) => {
        s.classList.toggle("is-active", n === i);
        if (n !== i) {
          const v = $("video", s);
          if (v && !v.paused) v.pause(); // never keep playing off-screen
        }
      });
      dots.forEach((d, n) => {
        d.classList.toggle("is-active", n === i);
        if (n === i) d.setAttribute("aria-current", "true");
        else d.removeAttribute("aria-current");
      });
      prevBtn.disabled = i === 0;
      nextBtn.disabled = i === slides.length - 1;
    };

    let ticking = false;
    rail.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          const i = nearest();
          if (i !== active) setActive(i);
        });
      },
      { passive: true },
    );

    prevBtn.addEventListener("click", () => go(active - 1));
    nextBtn.addEventListener("click", () => go(active + 1));
    rail.addEventListener("keydown", (e) => {
      if (e.target !== rail) return; // let video controls keep their own keys
      if (e.key === "ArrowRight") {
        e.preventDefault();
        go(active + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(active - 1);
      }
    });

    // Play button + video state
    slides.forEach((s, i) => {
      const v = $("video", s);
      const btn = $(".wd-play", s);
      if (!v || !btn) return;

      // a tap on a side (inactive) slide brings it to the centre instead of playing it
      s.addEventListener(
        "click",
        (e) => {
          if (s.classList.contains("is-active")) return;
          e.preventDefault();
          e.stopPropagation();
          go(i);
        },
        true,
      );

      const start = () => {
        v.controls = true; // native controls appear after the first play
        v.play().catch(() => {});
      };
      btn.addEventListener("click", start);
      v.addEventListener("click", () => {
        if (!v.controls) start();
      });
      v.addEventListener("play", () => s.classList.add("is-playing"));
      v.addEventListener("pause", () => s.classList.remove("is-playing"));
      v.addEventListener("ended", () => s.classList.remove("is-playing"));
    });

    // Mouse drag (touch and trackpads already swipe natively)
    let drag = null;
    let justDragged = false;
    rail.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      const v = e.target.closest("video");
      if (v && v.controls) return; // don't hijack the scrub bar
      drag = { x: e.clientX, left: rail.scrollLeft, moved: false };
    });
    window.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 6) {
        drag.moved = true;
        rail.classList.add("is-dragging");
        rail.style.scrollSnapType = "none"; // snapping would fight the drag
      }
      if (drag.moved) rail.scrollLeft = drag.left - dx;
    });
    const endDrag = () => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      if (!moved) return;
      justDragged = true;
      setTimeout(() => (justDragged = false), 0);
      rail.classList.remove("is-dragging");
      rail.style.scrollSnapType = "";
      go(nearest());
    };
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    rail.addEventListener(
      "click",
      (e) => {
        if (!justDragged) return;
        e.preventDefault();
        e.stopPropagation();
      },
      true,
    );
    rail.addEventListener("dragstart", (e) => e.preventDefault());

    // start centred on the first slide
    window.addEventListener("resize", () => go(active));
    setActive(0);
    rail.scrollLeft = slideLeft(0);
  }

  /* ---------- 3. Stationery mosaic ---------- */
  const grid = $("#mosaic");
  if (grid) {
    const originals = $$(".wd-tile", grid);
    const N = originals.length;

    // Pick columns / max tile size for the current width
    const config = () => {
      const w = window.innerWidth;
      if (w >= 1100) return { cols: 8, max: 3 };
      if (w >= 700) return { cols: 6, max: 3 };
      return { cols: 4, max: 2 };
    };
    const WEIGHTS = { 1: 0.5, 2: 0.35, 3: 0.15 };

    // Fill a cols × rows board with random N×N squares, left→right, top→bottom.
    // A 1×1 always fits, so the board always fills completely – no gaps.
    const pack = (cols, rows, max) => {
      const taken = Array.from({ length: rows }, () => Array(cols).fill(false));
      const out = [];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (taken[y][x]) continue;
          const fits = [];
          for (let s = 1; s <= max; s++) {
            if (x + s > cols || y + s > rows) break;
            let free = true;
            for (let yy = y; yy < y + s && free; yy++)
              for (let xx = x; xx < x + s; xx++)
                if (taken[yy][xx]) {
                  free = false;
                  break;
                }
            if (!free) break;
            fits.push(s);
          }
          const total = fits.reduce((t, s) => t + WEIGHTS[s], 0);
          let r = Math.random() * total;
          let size = fits[0];
          for (const s of fits) {
            r -= WEIGHTS[s];
            if (r <= 0) {
              size = s;
              break;
            }
          }
          for (let yy = y; yy < y + size; yy++)
            for (let xx = x; xx < x + size; xx++) taken[yy][xx] = true;
          out.push({ x, y, s: size });
        }
      }
      return out;
    };

    // Try random boards until one has exactly one tile per image
    // (and a good mix of sizes); otherwise use the closest one.
    const generate = ({ cols, max }) => {
      const avg = Object.keys(WEIGHTS)
        .filter((s) => +s <= max)
        .reduce((t, s) => t + WEIGHTS[s] * s * s, 0);
      const weightSum = Object.keys(WEIGHTS)
        .filter((s) => +s <= max)
        .reduce((t, s) => t + WEIGHTS[s], 0);
      const baseRows = Math.max(2, Math.round((N * (avg / weightSum)) / cols));
      let best = null;
      for (let attempt = 0; attempt < 500; attempt++) {
        const rows = Math.max(2, baseRows + (attempt % 3) - 1);
        const layout = pack(cols, rows, max);
        const mixed = N < 6 || layout.some((t) => t.s >= 2);
        if (layout.length === N && mixed) return layout;
        if (!best || Math.abs(layout.length - N) < Math.abs(best.length - N))
          best = layout;
      }
      return best;
    };

    const layout = () => {
      const cfg = config();
      grid.style.setProperty("--cols", cfg.cols);
      $$(".wd-clone", grid).forEach((c) => c.remove());

      const plan = generate(cfg);
      const tiles = originals.slice();
      // more cells than images: repeat images; fewer: hide the extras
      for (let i = N; i < plan.length; i++) {
        const c = originals[i % N].cloneNode(true);
        c.classList.add("wd-clone");
        c.setAttribute("aria-hidden", "true");
        grid.appendChild(c);
        tiles.push(c);
      }

      tiles.forEach((el, i) => {
        const p = plan[i];
        if (!p) {
          el.hidden = true;
          return;
        }
        el.hidden = false;
        el.style.gridColumn = `${p.x + 1} / span ${p.s}`;
        el.style.gridRow = `${p.y + 1} / span ${p.s}`;
        el.style.setProperty("--n", i);
        el.classList.remove("wd-pop");
        void el.offsetWidth; // restart the fade-in
        if (!reduceMotion) el.classList.add("wd-pop");
      });
    };

    layout();

    // Re-layout only when the column count changes (not on every pixel of resize)
    let lastCols = config().cols;
    let timer;
    window.addEventListener("resize", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const c = config().cols;
        if (c !== lastCols) {
          lastCols = c;
          layout();
        }
      }, 200);
    });
  }
})();
