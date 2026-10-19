/* =========================================================
   OneByZero – Website design page
   - splits each domain heading into single letters
   - when a row scrolls into view: letters rise out of a mask while
     "decoding" (random characters that settle one by one)
   - hovering a row replays a quick decode wave
   Everything else (text rising, card wipe, hairlines) is CSS,
   switched on by the .is-in class added here.
   ========================================================= */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  const rows = [...document.querySelectorAll(".wb-row")];
  const GLYPHS = "abcdefghijklmnopqrstuvwxyz0123456789";
  const pick = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

  /* ----- split a domain into [www.] [name] [.tld] letters ----- */
  const build = (heading) => {
    const full = heading.dataset.domain || heading.textContent.trim();
    heading.setAttribute("aria-label", full); // screen readers read the real domain
    heading.textContent = "";

    const prefix = full.startsWith("www.") ? "www." : "";
    const rest = full.slice(prefix.length);
    const dot = rest.lastIndexOf(".");
    const name = dot > 0 ? rest.slice(0, dot) : rest;
    const tld = dot > 0 ? rest.slice(dot) : "";

    const letters = [];
    [
      [prefix, "dim"],
      [name, "main"],
      [tld, "tld"],
    ].forEach(([text, kind]) => {
      if (!text) return;
      const seg = document.createElement("span");
      seg.className = "wb-seg";
      seg.setAttribute("aria-hidden", "true");
      [...text].forEach((ch) => {
        const mask = document.createElement("span");
        mask.className = `wb-c wb-c--${kind}`;
        const inner = document.createElement("span");
        inner.className = "wb-c__in";
        inner.textContent = ch;
        inner.dataset.ch = ch;
        mask.appendChild(inner);
        seg.appendChild(mask);
        letters.push(inner);
      });
      heading.appendChild(seg);
    });
    return letters;
  };

  // Lock every letter to its real width (in em, so it still scales with the
  // font size) so the heading doesn't jitter while random letters flick past.
  const lockWidths = (heading, letters) => {
    const size = parseFloat(getComputedStyle(heading).fontSize) || 16;
    // measure the real letters (a scramble frame may be showing something else)
    letters.forEach((el) => {
      el.textContent = el.dataset.ch;
      el.parentElement.style.width = "";
    });
    letters.forEach((el) => {
      const mask = el.parentElement;
      const w = mask.getBoundingClientRect().width;
      mask.style.width = `${w / size}em`;
    });
  };

  /* ----- the decode effect ----- */
  const scramble = (letters, { delay = 0, step = 45, base = 420 } = {}) =>
    new Promise((resolve) => {
      if (reduceMotion) return resolve();
      const t0 = performance.now();
      const tick = (now) => {
        let pending = false;
        letters.forEach((el, i) => {
          const final = el.dataset.ch;
          const t = now - t0 - delay - i * step;
          if (final !== "." && t < base) {
            pending = true;
            if (now - (el._t || 0) > 55) {
              el.textContent = pick();
              el._t = now;
            }
            el.classList.add("is-scr");
          } else {
            el.textContent = final;
            el.classList.remove("is-scr");
          }
        });
        if (pending) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });

  /* ----- set up each row ----- */
  const state = rows.map((row) => {
    const heading = row.querySelector(".wb-domain");
    if (!heading) return null;
    const letters = build(heading);
    // stagger the rise of the letters (read by the CSS as --cd)
    letters.forEach((el, i) => el.style.setProperty("--cd", `${i * 45}ms`));

    const s = { row, heading, letters, ready: false, busy: false };
    const lock = () => lockWidths(heading, letters);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(lock);
    else lock();
    return s;
  });

  const reveal = (s) => {
    s.row.classList.add("is-in");
    if (reduceMotion) {
      s.ready = true;
      return;
    }
    s.busy = true;
    scramble(s.letters, { delay: 150 }).then(() => {
      s.busy = false;
      s.ready = true;
    });
  };

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const s = state.find((x) => x && x.row === e.target);
          if (s) reveal(s);
          io.unobserve(e.target);
        });
      },
      { threshold: 0.25, rootMargin: "0px 0px -8% 0px" }
    );
    rows.forEach((r) => io.observe(r));
  } else {
    state.forEach((s) => s && reveal(s));
  }

  // hovering a finished row replays a fast decode wave
  state.forEach((s) => {
    if (!s) return;
    s.row.addEventListener("mouseenter", () => {
      if (!s.ready || s.busy) return;
      s.busy = true;
      scramble(s.letters, { step: 22, base: 280 }).then(() => (s.busy = false));
    });
  });

  // widths depend on font size, so re-measure if the screen size changes
  let timer;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(
      () => state.forEach((s) => s && lockWidths(s.heading, s.letters)),
      200
    );
  });
})();
