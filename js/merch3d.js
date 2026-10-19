/* OneByZero – Merch page: a 3D t-shirt carousel with a spotlight view.
   Needs a local server (not file://) because three.js is loaded as a module.
   Shirt model (media/3d/tshirt.glb), fabric and print projection live in js/tee3d.js.

   How it works: two canvases share one camera. The lower canvas is the carousel (it gets blurred by the
   .veil in css/merch.css). When you click a tee it is moved to the upper canvas, which sits above the veil,
   so it stays sharp and spins in the light while everything else is frozen and blurred behind it. */
import * as THREE from "three";
import {
  loadShirt,
  createTee,
  makeTeeMaterial,
  makePrints,
  loadImage,
  makeStudioEnv,
  addTeeLights,
} from "./tee3d.js";

/* ===================== EDIT HERE ===================== */
// One entry per tee.
//   color:  shirt colour (any CSS colour)
//   front / back: path to your artwork, relative to portfolio/merch.html (PNG with a transparent background looks best).
//                 Leave as null to show an original placeholder design for now.
//   printScale / printY: size and height of the front print (optional, default 0.5 / 0.2; y 0 = middle of the shirt, up is higher)
//   backScale / backY:   same for the back print (optional, default 0.5 / 0.3)
//   art: which placeholder design to draw while front is null (infinity | orb | wave | type | sun | grid)
// Prices below are SAMPLE values – replace them with your real ones.
const PRODUCTS = [
  {
    name: "Infinity Tee",
    color: "#0c0c10",
    art: "infinity",
    front: null,
    back: null,
  },
  {
    name: "Orbit Tee",
    color: "#e8e4da",
    art: "orb",
    front: null,
    back: null,
  },
  {
    name: "Signal Tee",
    color: "#2b2d36",
    art: "wave",
    front: null,
    back: null,
  },
  {
    name: "Zero Tee",
    color: "#4a1020",
    art: "type",
    front: null,
    back: null,
  },
  {
    name: "Daybreak Tee",
    color: "#101a3a",
    art: "sun",
    front: null,
    back: null,
  },
  {
    name: "Grid Tee",
    color: "#14231d",
    art: "grid",
    front: null,
    back: null,
  },
];

const CONFIG = {
  spacing: 2.75, // distance between tees in the carousel
  drift: 0.3, // how fast the carousel drifts by itself (0 = still)
  dragInertia: 3, // higher = the carousel stops sooner after you let go
  recede: 0.5, // how far side tees sink back
  turn: 0.14, // how much side tees turn towards the middle
  fov: 28,
  camY: 0.1,
  needHeight: 3.7, // world height that must fit in the carousel
  needWidth: 7.4, // world width that must fit (wide screens)
  needWidthNarrow: 4.4, // world width that must fit (phones)
  focus: { y: 0.3, z: 0.9, scale: 1.0, duration: 1.15, autoSpin: 0.55 }, // spotlight view (autoSpin in rad/s)
  flipDuration: 0.8,
  modelUrl: "../media/3d/tshirt.glb",
  textureSize: 2048, // print sharpness (smaller on phones)
  lightIntensity: 3, // brightness of the spotlight
};
/* ====================================================== */

const $ = (id) => document.getElementById(id);
const root = $("merch");
const stage = $("carousel");
const cvA = $("merchCanvas");
const cvB = $("spotCanvas");
const listEl = $("merchList");
const noGL = $("noGL");
const veil = $("veil");
const closeBtn = $("spotClose");
const spotEls = {
  kicker: $("spotKicker"),
  name: $("spotName"),
};
const segBtns = [...document.querySelectorAll(".seg button")];

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const N = PRODUCTS.length;
const TAU = Math.PI * 2;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const pad = (n) => String(n).padStart(2, "0");

/* ---------- Keyboard / no-WebGL list of designs ---------- */
let openTee = () => {};
PRODUCTS.forEach((p, i) => {
  const li = document.createElement("li");
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = `${p.name}`;
  b.addEventListener("click", () => openTee(i));
  li.appendChild(b);
  listEl.appendChild(li);
});

/* ---------- Main ---------- */
async function main() {
  // WebGL + renderers
  let rA;
  let rB;
  try {
    const opts = {
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    };
    rA = new THREE.WebGLRenderer({ canvas: cvA, ...opts });
    rB = new THREE.WebGLRenderer({ canvas: cvB, ...opts });
  } catch (e) {
    throw new Error("WebGL unavailable");
  }
  [rA, rB].forEach((r) => {
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.setClearColor(0x000000, 0);
  });

  const camera = new THREE.PerspectiveCamera(CONFIG.fov, 1, 0.1, 100);
  const sceneA = new THREE.Scene();
  const sceneB = new THREE.Scene();
  sceneA.environment = makeStudioEnv(rA);
  sceneB.environment = makeStudioEnv(rB);
  sceneA.environmentIntensity = sceneB.environmentIntensity = 0.9;
  addTeeLights(sceneA);
  addTeeLights(sceneB);

  // Spotlight (only exists in the upper scene; fades in while a tee is focused)
  const spotLight = new THREE.SpotLight(0xffffff, 0, 0, 0.62, 0.85, 0);
  spotLight.position.set(0, 7, 4.5);
  spotLight.target.position.set(0, CONFIG.focus.y, CONFIG.focus.z);
  sceneB.add(spotLight, spotLight.target);

  // Fonts first so the placeholder prints use Inter / Playfair
  try {
    await Promise.race([
      document.fonts.ready,
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch (e) {
    /* ignore */
  }

  // Tees
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const shirt = await loadShirt(CONFIG.modelUrl);
  const aniso = Math.min(8, rA.capabilities.getMaxAnisotropy());
  const tees = [];
  for (let i = 0; i < N; i++) {
    const item = { ...PRODUCTS[i] };
    const [frontImg, backImg] = await Promise.all([
      loadImage(item.front),
      loadImage(item.back),
    ]);
    const prints = makePrints(item, frontImg, backImg, {
      aniso,
      maxPx: small ? 1024 : CONFIG.textureSize,
    });
    const tee = createTee(shirt, makeTeeMaterial(item, prints));
    tee.userData.i = i;
    tee.userData.hover = 0;
    sceneA.add(tee);
    tees.push(tee);
  }

  /* ----- sizing ----- */
  let dist = 8;
  let worldPerPx = 0.01;
  let needsRender = true;
  const resize = () => {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    [rA, rB].forEach((r) => {
      r.setPixelRatio(dpr);
      r.setSize(w, h, false);
    });
    camera.aspect = w / h;
    const t = 2 * Math.tan(THREE.MathUtils.degToRad(CONFIG.fov / 2));
    const needW = w < 700 ? CONFIG.needWidthNarrow : CONFIG.needWidth;
    dist = Math.max(CONFIG.needHeight / t, needW / (t * camera.aspect));
    camera.position.set(0, CONFIG.camY, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    worldPerPx = (t * dist * camera.aspect) / w;
    needsRender = true;
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  /* ----- carousel layout ----- */
  const total = N * CONFIG.spacing;
  let scroll = 0;
  let vel = 0;
  const slot = (i) => {
    let o = (((i * CONFIG.spacing - scroll) % total) + total) % total;
    if (o > total / 2) o -= total;
    const a = Math.abs(o);
    return {
      x: o,
      y: 0,
      z: -Math.min(a, 7) * CONFIG.recede,
      ry: -o * CONFIG.turn,
      s: 1 - Math.min(a * 0.04, 0.22),
    };
  };

  /* ----- state ----- */
  let state = "idle"; // idle | opening | focused | closing
  let focusIdx = -1;
  let anim = null; // {t0, dur, from, to}
  let f = 0; // spotlight amount 0..1
  let spinning = true;
  let rotVel = 0;
  let rotAnim = null; // {t0, dur, from, to}
  let lastFacing = "";
  let returnFocusTo = null;

  const setFacing = () => {
    const mesh = tees[focusIdx];
    const front = Math.round(mesh.rotation.y / Math.PI) % 2 === 0;
    const side = front ? "front" : "back";
    if (side !== lastFacing) {
      lastFacing = side;
      segBtns.forEach((b) => {
        const on = b.dataset.side === side;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", String(on));
      });
    }
  };

  // Rotate to the nearest front (even multiple of PI) or back (odd multiple)
  const flipTo = (side, forceMove = false) => {
    const mesh = tees[focusIdx];
    const ry = mesh.rotation.y;
    const wantOdd = side === "back";
    let m = Math.round(ry / Math.PI);
    if (
      (m % 2 !== 0) !== wantOdd ||
      (forceMove && Math.abs(ry - m * Math.PI) < 0.3)
    ) {
      const dir = ry >= m * Math.PI ? 1 : -1;
      const cand = [m + dir, m - dir];
      m = cand.find((c) => (Math.abs(c) % 2 === 1) === wantOdd);
    }
    spinning = false;
    rotVel = 0;
    const dur = reduced ? 0.01 : CONFIG.flipDuration;
    rotAnim = {
      t0: performance.now(),
      dur: dur * 1000,
      from: ry,
      to: m * Math.PI,
    };
  };
  const flip = () => {
    const mesh = tees[focusIdx];
    const m = Math.round(mesh.rotation.y / Math.PI);
    flipTo(m % 2 === 0 ? "back" : "front", true);
  };

  const fillInfo = (i) => {
    const p = PRODUCTS[i];
    spotEls.kicker.textContent = `Tee · ${pad(i + 1)} / ${pad(N)}`;
    spotEls.name.textContent = p.name;
  };

  const poseOf = (mesh) => ({
    x: mesh.position.x,
    y: mesh.position.y,
    z: mesh.position.z,
    ry: mesh.rotation.y,
    s: mesh.scale.x,
  });

  openTee = (i) => {
    if (state !== "idle") return;
    state = "opening";
    focusIdx = i;
    const mesh = tees[i];
    const from = poseOf(mesh);
    sceneB.add(mesh); // moves it from the carousel scene to the spotlight scene
    mesh.rotation.x = 0;
    mesh.rotation.z = 0;
    const fo = CONFIG.focus;
    anim = {
      t0: performance.now(),
      dur: (reduced ? 0.01 : fo.duration) * 1000,
      from,
      to: {
        x: 0,
        y: fo.y,
        z: fo.z,
        ry: Math.ceil(from.ry / TAU) * TAU + TAU,
        s: fo.scale,
      },
    };
    spinning = !reduced;
    rotVel = 0;
    rotAnim = null;
    lastFacing = "";
    fillInfo(i);
    returnFocusTo = document.activeElement;
    document.documentElement.classList.add("merch-lock");
    root.classList.add("is-focused");
    veil.setAttribute("aria-hidden", "false");
    stage.classList.remove("is-pointer");
    setTimeout(() => closeBtn.focus({ preventScroll: true }), 50);
    needsRender = true;
  };

  const closeTee = () => {
    if (state !== "focused" && state !== "opening") return;
    state = "closing";
    const mesh = tees[focusIdx];
    const to = slot(focusIdx);
    const from = poseOf(mesh);
    to.ry = to.ry + TAU * Math.round((from.ry - to.ry) / TAU);
    rotAnim = null;
    anim = {
      t0: performance.now(),
      dur: (reduced ? 0.01 : CONFIG.focus.duration * 0.8) * 1000,
      from,
      to,
    };
    root.classList.remove("is-focused");
    veil.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("merch-lock");
    if (returnFocusTo && returnFocusTo.focus)
      returnFocusTo.focus({ preventScroll: true });
  };

  /* ----- stage input: drag to browse, tap to open ----- */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pick = (clientX, clientY, canvas, objects) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1,
    );
    ray.setFromCamera(ndc, camera);
    objects.forEach((o) => o.updateMatrixWorld(true));
    const hit = ray.intersectObjects(
      objects.map((o) => o.userData.proxy),
      false,
    )[0];
    return hit ? hit.object.userData.owner : null;
  };
  const carouselTees = () => tees.filter((t) => t.parent === sceneA);

  let drag = null;
  let hovered = null;
  let hoverQueued = 0;
  stage.addEventListener("pointerdown", (e) => {
    if (state !== "idle" || e.button > 0 || e.target.closest(".spot")) return;
    drag = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      t: performance.now(),
      moved: false,
    };
    vel = 0;
    try {
      stage.setPointerCapture(e.pointerId);
    } catch (err) {
      /* ignore */
    }
  });
  stage.addEventListener("pointermove", (e) => {
    if (state !== "idle") return;
    if (drag && drag.id === e.pointerId) {
      const dx = e.clientX - drag.x;
      if (
        !drag.moved &&
        Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6
      ) {
        drag.moved = true;
        stage.classList.add("is-dragging");
      }
      if (drag.moved) {
        const now = performance.now();
        const dt = Math.max((now - drag.t) / 1000, 0.001);
        scroll -= dx * worldPerPx;
        vel = lerp(vel, (-dx * worldPerPx) / dt, 0.4);
        drag.t = now;
      }
      drag.x = e.clientX;
      return;
    }
    if (e.pointerType === "mouse" && !hoverQueued) {
      const cx = e.clientX;
      const cy = e.clientY;
      hoverQueued = window.setTimeout(() => {
        hoverQueued = 0;
        if (state !== "idle") return;
        hovered = pick(cx, cy, cvA, carouselTees());
        stage.classList.toggle("is-pointer", !!hovered);
      }, 50);
    }
  });
  const endDrag = (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const d = drag;
    drag = null;
    stage.classList.remove("is-dragging");
    if (!d.moved && e.type === "pointerup") {
      const hit = pick(e.clientX, e.clientY, cvA, carouselTees());
      if (hit) openTee(hit.userData.i);
    }
    if (performance.now() - d.t > 90) vel = 0; // stopped before letting go
  };
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);
  stage.addEventListener("pointerleave", () => {
    if (!drag) {
      hovered = null;
      stage.classList.remove("is-pointer");
    }
  });

  /* ----- spotlight input: drag to rotate, tap the tee to flip, tap outside to close ----- */
  let sd = null;
  veil.addEventListener("pointerdown", (e) => {
    if (state !== "focused" || e.button > 0) return;
    sd = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      t: performance.now(),
      t0: performance.now(),
      moved: false,
    };
    rotAnim = null;
    spinning = false;
    rotVel = 0;
    try {
      veil.setPointerCapture(e.pointerId);
    } catch (err) {
      /* ignore */
    }
  });
  veil.addEventListener("pointermove", (e) => {
    if (!sd || sd.id !== e.pointerId) return;
    if (!sd.moved && Math.hypot(e.clientX - sd.x0, e.clientY - sd.y0) > 6)
      sd.moved = true;
    if (sd.moved) {
      const now = performance.now();
      const dt = Math.max((now - sd.t) / 1000, 0.001);
      const dr = (e.clientX - sd.x) * 0.012;
      tees[focusIdx].rotation.y += dr;
      rotVel = lerp(rotVel, dr / dt, 0.4);
      sd.t = now;
    }
    sd.x = e.clientX;
  });
  const endSpotDrag = (e) => {
    if (!sd || sd.id !== e.pointerId) return;
    const d = sd;
    sd = null;
    if (!d.moved && e.type === "pointerup") {
      const hit = pick(e.clientX, e.clientY, cvB, [tees[focusIdx]]);
      hit ? flip() : closeTee();
    } else if (performance.now() - d.t > 90) {
      rotVel = 0;
    }
  };
  veil.addEventListener("pointerup", endSpotDrag);
  veil.addEventListener("pointercancel", endSpotDrag);

  closeBtn.addEventListener("click", closeTee);
  segBtns.forEach((b) =>
    b.addEventListener("click", () => flipTo(b.dataset.side)),
  );
  window.addEventListener("keydown", (e) => {
    if (state !== "focused" && state !== "opening") return;
    if (e.key === "Escape") closeTee();
    else if (e.key === "ArrowLeft" || e.key === "ArrowRight") flip();
  });

  /* ----- render loop ----- */
  let visible = true;
  new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
  }).observe(stage);
  let last = performance.now();

  const applyPose = (mesh, p) => {
    mesh.position.set(p.x, p.y, p.z);
    mesh.rotation.y = p.ry;
    mesh.scale.setScalar(p.s);
  };

  const frame = (now) => {
    requestAnimationFrame(frame);
    if (document.hidden || (!visible && state === "idle")) {
      last = now;
      return;
    }
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const time = now / 1000;

    // Focus tween (opening / closing)
    if (anim) {
      const k = Math.min((now - anim.t0) / anim.dur, 1);
      const e = ease(k);
      const mesh = tees[focusIdx];
      const to =
        state === "closing"
          ? { ...anim.to, ...slot(focusIdx), ry: anim.to.ry }
          : anim.to;
      applyPose(mesh, {
        x: lerp(anim.from.x, to.x, e),
        y: lerp(anim.from.y, to.y, e),
        z: lerp(anim.from.z, to.z, e),
        ry: lerp(anim.from.ry, to.ry, e),
        s: lerp(anim.from.s, to.s, e),
      });
      f = state === "closing" ? 1 - e : e;
      if (k >= 1) {
        anim = null;
        if (state === "opening") {
          state = "focused";
          last = performance.now();
        } else {
          state = "idle";
          sceneA.add(mesh);
          rB.clear();
          f = 0;
          focusIdx = -1;
        }
      }
      needsRender = true;
    }

    // Carousel motion (frozen while a tee is in the spotlight)
    if (state === "idle") {
      if (!drag) {
        scroll += (vel + (reduced ? 0 : CONFIG.drift)) * dt;
        vel *= Math.exp(-dt * CONFIG.dragInertia);
        if (Math.abs(vel) < 0.001) vel = 0;
      }
      needsRender = true;
    }
    if (state === "idle" || state === "opening" || state === "closing") {
      tees.forEach((mesh, i) => {
        if (mesh.parent !== sceneA) return;
        const p = slot(i);
        const h = (mesh.userData.hover = lerp(
          mesh.userData.hover,
          hovered === mesh ? 1 : 0,
          Math.min(dt * 8, 1),
        ));
        const sway = reduced ? 0 : Math.sin(time * 0.7 + i * 1.7) * 0.05;
        mesh.position.set(
          p.x,
          p.y + h * 0.05 + (reduced ? 0 : Math.sin(time * 0.9 + i) * 0.03),
          p.z,
        );
        mesh.rotation.set(0, p.ry + sway, 0);
        mesh.scale.setScalar(p.s * (1 + h * 0.05));
      });
    }

    // Spotlight view: spin / drag / flip
    if (state === "focused") {
      const mesh = tees[focusIdx];
      if (rotAnim) {
        const k = Math.min((now - rotAnim.t0) / rotAnim.dur, 1);
        mesh.rotation.y = lerp(rotAnim.from, rotAnim.to, ease(k));
        if (k >= 1) rotAnim = null;
        needsRender = true;
      } else if (!sd && Math.abs(rotVel) > 0.01) {
        mesh.rotation.y += rotVel * dt;
        rotVel *= Math.exp(-dt * 3);
        needsRender = true;
      } else if (spinning && !sd) {
        mesh.rotation.y += CONFIG.focus.autoSpin * dt;
        needsRender = true;
      }
      mesh.position.y =
        CONFIG.focus.y + (reduced ? 0 : Math.sin(time * 1.1) * 0.02);
      setFacing();
      needsRender = true;
    }

    if (state === "opening" || state === "closing") {
      setFacing && lastFacing === "" && state === "opening" && setFacing();
    }

    spotLight.intensity = CONFIG.lightIntensity * f;

    if (needsRender) {
      needsRender = false;
      if (state !== "focused") rA.render(sceneA, camera); // carousel stays frozen (and blurred) behind the veil
      if (state !== "idle") rB.render(sceneB, camera);
    }
  };

  cvA.classList.add("is-ready");
  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.warn("Merch 3D view unavailable:", err);
  noGL.hidden = false;
  listEl.classList.add("is-plain");
});
