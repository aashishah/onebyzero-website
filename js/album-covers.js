/* OneByZero – Album Cover Art page: picks the cover shown on the sleeve (and the record's label).
   A plain script (no modules): it also drives the CSS fallback if the 3D version can't load.
   vinyl3d.js listens for the "album:cover" event this script fires. */
(() => {
  "use strict";

  /* ===================== EDIT HERE ===================== */
  // Covers shown on the sleeve, in this order. Paths are relative to portfolio/album-covers.html.
  // Square images work best (others are cropped to a square from the centre).
  const COVERS = [
    "../media/covers/FEIN.jpeg",
    "../media/covers/thismoonlightsuburbia.jpg",
    "../media/covers/ikweethetnietv2.jpg",
    "../media/covers/into_space.jpg",
    "../media/covers/Islept2.jpg",
    "../media/covers/luciddream.jpg",
    "../media/covers/TL_Dark.jpg",
    "../media/covers/yeha.jpg",
    "../media/covers/ls2.jpg",
    "../media/covers/MELTDOWN.jpeg",
  ];
  const INTERVAL = 3000; // milliseconds each cover stays on the sleeve
  /* ====================================================== */

  const showcase = document.getElementById("showcase");
  const dotsBox = document.getElementById("dots");
  const fallbackImg = document.getElementById("fallbackCover");
  if (!showcase || !COVERS.length) return;

  const abs = (src) => new URL(src, document.baseURI).href;
  const preload = (src) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(src);
      img.onerror = () => resolve(null); // skip covers that fail to load
      img.src = src;
    });

  document.documentElement.style.setProperty("--interval", `${INTERVAL}ms`);
  showcase.style.setProperty("--interval", `${INTERVAL}ms`);

  Promise.all(COVERS.map(preload)).then((results) => {
    const covers = results.filter(Boolean);
    if (!covers.length) return;

    let index = -1;
    let timer = 0;
    let active = true;

    /* Progress dots – one per cover, click to jump */
    const dots = covers.map((src, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", `Show cover ${i + 1} of ${covers.length}`);
      b.addEventListener("click", () => {
        show(i);
        restart();
      });
      if (dotsBox) dotsBox.appendChild(b);
      return b;
    });

    const show = (i) => {
      index = (i + covers.length) % covers.length;
      const src = covers[index];

      window.albumCover = src; // read by vinyl3d.js if it loads after this event fires
      showcase.style.setProperty("--label", `url("${abs(src)}")`);
      if (fallbackImg) fallbackImg.src = src;

      dots.forEach((d, n) => {
        d.classList.remove("is-active");
        if (n === index) {
          void d.offsetWidth; // restart the progress animation
          d.classList.add("is-active");
        }
      });
      window.dispatchEvent(new CustomEvent("album:cover", { detail: { src } }));
    };

    const restart = () => {
      clearInterval(timer);
      timer = setInterval(() => {
        if (active) show(index + 1);
      }, INTERVAL);
    };

    show(0);
    restart();

    /* Pause while off screen or in a background tab */
    let inView = true;
    const sync = () => {
      active = inView && !document.hidden;
    };
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([entry]) => {
        inView = entry.isIntersecting;
        sync();
      }).observe(showcase);
    }
    document.addEventListener("visibilitychange", sync);
  });
})();
