import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const CONFIG = {
  /* Shape */
  scale: 2.2, // overall size of the loops
  heightStretch: 1, // >1 = taller, rounder loops; <1 = flatter
  depth: 0.9, // how far apart the two strands sit at the crossing (keep > thickness)
  width: 0.4, // ribbon width (how "wide" the metal band is)
  thickness: 0.09, // metal thickness – visible on the edges
  twist: Math.PI / 2.4, // 0 = flat ribbon, always face-on · PI/2 = like the reference · PI = more twist
  segments: 600, // smoothness along the ribbon (lowered automatically on small screens)

  /* Metal */
  color: 0xf4f5f7, // silver tint: 0xffffff = bright chrome, 0xc9ccd2 = darker steel
  metalness: 1,
  roughness: 0.18, // lower = mirror-like, higher = brushed
  clearcoat: 0.35,
  clearcoatRoughness: 0.12,
  envIntensity: 1.3, // strength of the reflections
  exposure: 1.1,

  /* Motion */
  tilt: { x: 0.3, y: -0.2, z: 0 }, // resting angle (radians)
  sway: { x: 0.08, y: 0.35 }, // how far it rocks back and forth
  speed: 0.3, // sway speed
  float: 0.12, // up-and-down drift
  pointer: 0.3, // how much it follows the cursor

  /* Framing */
  fitWidth: 8.4, // larger = ribbon appears smaller in the hero
  fitWidthMobile: 6.4, // same, on phones / small tablets
};

const visual = document.getElementById("heroVisual");
const canvas = document.getElementById("heroCanvas");

/* Flat metal band that follows an infinity path. The band's width direction rotates between
   "standing like a belt" at the loop tips and "lying flat" at the crossing, like a twisted strip. */
function buildRibbon(c, segments) {
  const zHat = new THREE.Vector3(0, 0, 1);
  const q1 = new THREE.Vector3();
  const q2 = new THREE.Vector3();
  const p = new THREE.Vector3();
  const t = new THREE.Vector3();
  const n = new THREE.Vector3();
  const b = new THREE.Vector3();
  const w = new THREE.Vector3();
  const v = new THREE.Vector3();

  const point = (a, out) => {
    const d = 1 + Math.sin(a) ** 2;
    return out.set(
      (c.scale * Math.cos(a)) / d,
      (c.scale * c.heightStretch * Math.sin(a) * Math.cos(a)) / d,
      c.depth * Math.sin(a),
    );
  };

  const hw = c.width / 2;
  const ht = c.thickness / 2;
  const e = 1e-3;
  const pos = new Float32Array(segments * 8 * 3);

  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    point(a, p);
    t.copy(point(a + e, q1))
      .sub(point(a - e, q2))
      .normalize();

    n.crossVectors(zHat, t).normalize(); // in-plane normal
    b.crossVectors(t, n).normalize(); // roughly the viewing axis
    const phi = c.twist * Math.cos(a);
    w.copy(n)
      .multiplyScalar(Math.cos(phi))
      .addScaledVector(b, Math.sin(phi))
      .normalize(); // width direction
    v.crossVectors(t, w).normalize(); // surface normal

    const base = i * 8;
    const put = (slot, sw, sv) => {
      const k = (base + slot) * 3;
      pos[k] = p.x + w.x * hw * sw + v.x * ht * sv;
      pos[k + 1] = p.y + w.y * hw * sw + v.y * ht * sv;
      pos[k + 2] = p.z + w.z * hw * sw + v.z * ht * sv;
    };
    // Four faces (top, side, bottom, side), each with its own vertices so the edges stay crisp
    put(0, 1, 1);
    put(1, -1, 1);
    put(2, -1, 1);
    put(3, -1, -1);
    put(4, -1, -1);
    put(5, 1, -1);
    put(6, 1, -1);
    put(7, 1, 1);
  }

  const index = [];
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    for (let f = 0; f < 4; f++) {
      const a = i * 8 + f * 2;
      const bb = a + 1;
      const cc = j * 8 + f * 2;
      const dd = cc + 1;
      index.push(a, bb, cc, bb, dd, cc);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

function init() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
  } catch (err) {
    return; // WebGL unavailable – keep the SVG fallback
  }

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const smallScreen = window.matchMedia("(max-width: 767px)").matches;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = CONFIG.exposure;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

  /* Studio environment: a dark room with large light panels. A flat metal band reflects these
       as long bright streaks, and the violet / teal panels tie it to the hero gradient. */
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x050505);

  const addPanel = (color, intensity, size, position) => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity),
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size[0], size[1]),
      material,
    );
    mesh.position.set(position[0], position[1], position[2]);
    mesh.lookAt(0, 0, 0);
    envScene.add(mesh);
  };

  /* All neutral greys / whites, so the metal reads as chrome silver.
     Brighter panels = brighter streaks. Try 0xffffff everywhere for a harder mirror look. */
  addPanel(0xffffff, 6, [14, 6], [0, 9, 2]); // top softbox
  addPanel(0xd5d8de, 4.5, [6, 14], [-9, 1, 3]); // left strip (cool silver)
  addPanel(0xf2f2f2, 4.5, [6, 14], [9, -1, 3]); // right strip
  addPanel(0x9a9ea6, 2.5, [16, 4], [0, -8, 4]); // floor (darker grey)
  addPanel(0xffffff, 4, [3, 12], [0, 0, -9]); // rim strip behind
  addPanel(0xffffff, 0.5, [10, 10], [0, 0, 10]); // soft front fill (keep low for contrast)

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.03).texture;
  pmrem.dispose();

  /* Steel ribbon */
  const geometry = buildRibbon(
    CONFIG,
    smallScreen ? Math.min(CONFIG.segments, 360) : CONFIG.segments,
  );
  const material = new THREE.MeshPhysicalMaterial({
    color: CONFIG.color,
    metalness: CONFIG.metalness,
    roughness: CONFIG.roughness,
    clearcoat: CONFIG.clearcoat,
    clearcoatRoughness: CONFIG.clearcoatRoughness,
    envMapIntensity: CONFIG.envIntensity,
  });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, material));
  scene.add(group);

  /* Sizing */
  const resize = () => {
    const w = visual.clientWidth;
    const h = visual.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const narrow = window.innerWidth < 992;
    const zToFitWidth =
      (narrow ? CONFIG.fitWidthMobile : CONFIG.fitWidth) /
      2 /
      (Math.tan(fov / 2) * camera.aspect);
    camera.position.set(0, 0, Math.max(zToFitWidth, narrow ? 7 : 10.5));
    camera.updateProjectionMatrix();
  };

  /* Pointer parallax */
  const pointer = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };
  window.addEventListener(
    "pointermove",
    (e) => {
      target.x = (e.clientX / window.innerWidth) * 2 - 1;
      target.y = (e.clientY / window.innerHeight) * 2 - 1;
    },
    { passive: true },
  );

  const render = (timeMs) => {
    const t = timeMs * 0.001;
    pointer.x += (target.x - pointer.x) * 0.05;
    pointer.y += (target.y - pointer.y) * 0.05;

    group.rotation.y =
      CONFIG.tilt.y +
      Math.sin(t * CONFIG.speed) * CONFIG.sway.y +
      pointer.x * CONFIG.pointer;
    group.rotation.x =
      CONFIG.tilt.x +
      Math.sin(t * CONFIG.speed * 0.77) * CONFIG.sway.x +
      pointer.y * CONFIG.pointer * 0.6;
    group.rotation.z = CONFIG.tilt.z + Math.sin(t * CONFIG.speed * 0.6) * 0.04;
    group.position.y = Math.sin(t * 0.9) * CONFIG.float;

    renderer.render(scene, camera);
  };

  /* Run the loop only while the hero is on screen and the tab is visible */
  let running = false;
  let raf = 0;
  let inView = true;

  const loop = (ts) => {
    render(ts);
    raf = requestAnimationFrame(loop);
  };
  const start = () => {
    if (running || reduceMotion) return;
    running = true;
    raf = requestAnimationFrame(loop);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  resize();
  render(reduceMotion ? 1200 : performance.now());
  visual.classList.add("is-ready");

  new ResizeObserver(() => {
    resize();
    if (!running) render(reduceMotion ? 1200 : performance.now());
  }).observe(visual);

  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView && !document.hidden) start();
    else stop();
  }).observe(visual);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else if (inView) start();
  });

  start();
}

/* Keep this call last so everything above is defined before it runs */
if (visual && canvas) init();
