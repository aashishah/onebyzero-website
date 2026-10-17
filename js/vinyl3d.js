/* OneByZero – Album Cover Art page: album sleeve with a spinning vinyl sliding out of it (three.js).
   The sleeve art and the record's label always show the same cover (see js/album-covers.js).
   Drag to spin the record, click to pause / play.
   If WebGL or the CDN is unavailable, the CSS version in the HTML stays visible. */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

/* ======================  TWEAK HERE  ====================== */
const CONFIG = {
    /* Shapes */
    radius: 2,             // record radius in world units – leave as is and use `fit` to resize on screen
    labelRatio: 0.34,      // label size relative to the whole record (a real LP is about 1/3)
    sleeveScale: 1.08,     // sleeve size relative to the record (1.08 = a little bigger than the record)
    out: 0.95,             // how much of the record sticks out of the sleeve (1 = half of the record)
    fit: { w: 10, h: 6.8 },// visible area around the pair – larger numbers make the pair smaller

    /* Look */
    envIntensity: 0.9,     // strength of the reflections on the vinyl
    roughness: 0.32,       // lower = glossier vinyl
    sheen: 0.85,           // opacity of the light streaks that sweep across the grooves
    gloss: 0.5,            // opacity of the soft shine that drifts across the sleeve (0 = none)
    exposure: 1.05,

    /* Motion */
    spin: 1.1,             // resting spin speed (radians per second)
    tilt: { pitch: 0.5, yaw: -0.35, roll: -0.25 }, // resting angle; roll tilts it clockwise, pitch leans it back
    sway: { pitch: 0.05, yaw: 0.12 },              // how far it rocks back and forth
    swaySpeed: 0.35,
    float: 0.08,           // up-and-down drift
    pointer: 0.25,         // how much it follows the cursor
    dragSpeed: 0.012,      // radians per pixel while dragging
    fade: 0.7,             // seconds the sleeve art and label take to crossfade
};
/* ========================================================= */

const host = document.getElementById('showcase');
const canvas = document.getElementById('vinylCanvas');

/* Fine concentric grooves, smooth gaps between "tracks", and a smooth outer rim */
function makeGrooveTexture(size, aniso) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    const c = size / 2;

    g.fillStyle = '#08080c';
    g.fillRect(0, 0, size, size);

    const step = (size / 1024) * 0.9;
    for (let r = c * 0.37; r < c * 0.955; r += step) {
        g.beginPath();
        g.arc(c, c, r, 0, Math.PI * 2);
        g.strokeStyle = `rgba(255,255,255,${(0.018 + Math.random() * 0.05).toFixed(3)})`;
        g.lineWidth = step * 0.7;
        g.stroke();
    }

    const band = (f0, f1, color) => {
        g.beginPath();
        g.arc(c, c, c * ((f0 + f1) / 2), 0, Math.PI * 2);
        g.lineWidth = c * (f1 - f0);
        g.strokeStyle = color;
        g.stroke();
    };
    [0.5, 0.63, 0.74, 0.85].forEach((f) => band(f - 0.004, f + 0.004, 'rgba(6,6,10,0.95)')); // gaps between tracks
    band(0.345, 0.375, '#0b0b11');   // lead-in
    band(0.955, 0.985, '#0a0a0f');   // run-out
    band(0.99, 0.995, 'rgba(255,255,255,0.1)'); // rim highlight

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = aniso;
    return tex;
}

/* Two soft wedge-shaped light streaks, like light raking across real grooves */
function makeSheenTexture(size) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    if (!g.createConicGradient) return null;
    const c = size / 2;

    const grad = g.createConicGradient(0, c, c);
    [
        [0, 'rgba(255,255,255,0)'], [0.06, 'rgba(255,255,255,0)'],
        [0.095, 'rgba(196,206,255,0.85)'], [0.13, 'rgba(255,255,255,0)'],
        [0.27, 'rgba(255,255,255,0)'], [0.3, 'rgba(150,120,255,0.28)'], [0.33, 'rgba(255,255,255,0)'],
        [0.56, 'rgba(255,255,255,0)'], [0.595, 'rgba(150,255,235,0.8)'], [0.63, 'rgba(255,255,255,0)'],
        [0.77, 'rgba(255,255,255,0)'], [0.8, 'rgba(120,160,255,0.28)'], [0.83, 'rgba(255,255,255,0)'],
        [1, 'rgba(255,255,255,0)'],
    ].forEach(([o, col]) => grad.addColorStop(o, col));
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);

    // Keep the streaks on the grooves only (not on the label)
    g.globalCompositeOperation = 'destination-in';
    const mask = g.createRadialGradient(c, c, 0, c, c, c);
    mask.addColorStop(0, 'rgba(0,0,0,0)');
    mask.addColorStop(CONFIG.labelRatio, 'rgba(0,0,0,0)');
    mask.addColorStop(CONFIG.labelRatio + 0.07, 'rgba(0,0,0,1)');
    mask.addColorStop(0.94, 'rgba(0,0,0,1)');
    mask.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = mask;
    g.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

/* The shadow the sleeve casts on the part of the record just outside it.
   `edge` = where the sleeve's edge falls across the record (0 = left side, 1 = right side). */
function makeShadowTexture(edge) {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 8;
    const g = cv.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 512, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0.85)');
    grad.addColorStop(Math.min(edge, 0.98), 'rgba(0,0,0,0.85)');
    grad.addColorStop(Math.min(edge + 0.07, 0.99), 'rgba(0,0,0,0.5)');
    grad.addColorStop(Math.min(edge + 0.3, 1), 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 8);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

/* A soft diagonal shine for the sleeve; wider than the sleeve so it can drift across it */
function makeGlossTexture() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 512;
    const g = cv.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 512, 512);
    [
        [0, 'rgba(255,255,255,0)'], [0.3, 'rgba(255,255,255,0)'], [0.42, 'rgba(255,255,255,0.28)'],
        [0.5, 'rgba(255,255,255,0.05)'], [0.58, 'rgba(255,255,255,0.18)'], [0.7, 'rgba(255,255,255,0)'],
        [1, 'rgba(255,255,255,0)'],
    ].forEach(([o, col]) => grad.addColorStop(o, col));
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(0.5, 1);
    return tex;
}

/* Two stacked copies of a surface: the new texture fades in on top, then replaces the one below.
   `parent` decides which way the surface faces (its +Z is the surface normal). */
function makeFader(parent, geometry, seconds) {
    const matA = new THREE.MeshBasicMaterial({ color: 0x1b1626, toneMapped: false });
    const matB = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0, depthWrite: false });
    const a = new THREE.Mesh(geometry, matA);
    const b = new THREE.Mesh(geometry, matB);
    b.position.z = 0.0015;
    b.visible = false;
    parent.add(a, b);

    let first = true;
    let fading = false;
    let p = 0;

    const finish = () => {
        if (!fading) return;
        matA.map = matB.map;
        matA.needsUpdate = true;
        matB.opacity = 0;
        b.visible = false;
        fading = false;
    };

    return {
        set(tex) {
            if (first) {
                matA.map = tex;
                matA.color.set(0xffffff);
                matA.needsUpdate = true;
                first = false;
                return;
            }
            finish();
            matB.map = tex;
            matB.needsUpdate = true;
            matB.opacity = 0;
            b.visible = true;
            fading = true;
            p = 0;
        },
        update(dt) {
            if (!fading) return;
            p += dt / Math.max(seconds, 0.001);
            if (p >= 1) finish();
            else matB.opacity = p * p * (3 - 2 * p);
        },
    };
}

function init() {
    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (err) {
        return; // WebGL unavailable – keep the CSS version
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const smallScreen = window.matchMedia('(max-width: 767px)').matches;
    const motion = reduceMotion ? 0 : 1;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = CONFIG.exposure;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

    /* Studio environment: mostly dark with a few narrow strips in the site's violet / teal */
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x07070f);
    const addPanel = (color, intensity, size, position) => {
        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(size[0], size[1]),
            new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide })
        );
        mesh.position.set(position[0], position[1], position[2]);
        mesh.lookAt(0, 0, 0);
        envScene.add(mesh);
    };
    addPanel(0xffffff, 3.2, [9, 1.4], [0, 9, 3]);    // thin top strip
    addPanel(0x8566ff, 2.6, [2.2, 12], [-9, 1, 3]);  // violet left
    addPanel(0x66e0d2, 2.6, [2.2, 12], [9, -1, 3]);  // teal right
    addPanel(0x5b8cff, 1.2, [10, 2], [0, -8, 4]);    // blue floor strip

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0.03).texture;
    pmrem.dispose();

    const aniso = renderer.capabilities.getMaxAnisotropy();
    const R = CONFIG.radius;
    const T = 0.05;                              // record thickness
    const H = R * CONFIG.sleeveScale;            // half the sleeve's width
    const Ts = 0.06;                             // sleeve thickness
    const discX = H - R + CONFIG.out * R;        // record centre; the sleeve is centred on x = 0
    const discZ = -Ts / 2 - 0.05 - T / 2;        // record sits just behind the sleeve

    /* rig tilts / floats the whole pair. comp centres the pair on the rig's pivot. */
    const rig = new THREE.Group();
    rig.rotation.order = 'ZYX';
    const comp = new THREE.Group();
    comp.position.x = -(discX + R - H) / 2;
    rig.add(comp);
    scene.add(rig);

    /* ---------- Sleeve ---------- */
    const sleeve = new THREE.Group();
    comp.add(sleeve);
    sleeve.add(new THREE.Mesh(
        new THREE.BoxGeometry(H * 2, H * 2, Ts),
        new THREE.MeshStandardMaterial({ color: 0x140b0f, roughness: 0.7, metalness: 0.1, envMapIntensity: 0.5 })
    ));

    const sleeveFace = new THREE.Group();
    sleeveFace.position.z = Ts / 2 + 0.001;
    sleeve.add(sleeveFace);
    const sleeveFader = makeFader(sleeveFace, new THREE.PlaneGeometry(H * 2, H * 2), CONFIG.fade * motion);

    const glossTex = CONFIG.gloss > 0 ? makeGlossTexture() : null;
    if (glossTex) {
        const gloss = new THREE.Mesh(
            new THREE.PlaneGeometry(H * 2, H * 2),
            new THREE.MeshBasicMaterial({
                map: glossTex,
                transparent: true,
                opacity: CONFIG.gloss,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                toneMapped: false,
            })
        );
        gloss.position.z = Ts / 2 + 0.005;
        sleeve.add(gloss);
    }

    /* ---------- Record (turned to face the camera, sitting behind the sleeve) ---------- */
    const discRoot = new THREE.Group();
    discRoot.position.set(discX, 0, discZ);
    discRoot.rotation.x = Math.PI / 2;
    comp.add(discRoot);

    const spin = new THREE.Group();          // turns with the record
    const sheenPivot = new THREE.Group();    // light streaks that do NOT turn with the record
    discRoot.add(spin, sheenPivot);

    const grooves = makeGrooveTexture(smallScreen ? 1024 : 2048, aniso);
    const topMat = new THREE.MeshPhysicalMaterial({
        map: grooves,
        color: 0xffffff,
        metalness: 0.15,
        roughness: CONFIG.roughness,
        clearcoat: 1,
        clearcoatRoughness: 0.22,
        envMapIntensity: CONFIG.envIntensity,
    });
    const sideMat = new THREE.MeshStandardMaterial({ color: 0x050507, roughness: 0.5, metalness: 0.2 });
    spin.add(new THREE.Mesh(new THREE.CylinderGeometry(R, R, T, 160, 1, false), [sideMat, topMat, topMat]));

    /* Label: wears the same cover as the sleeve */
    const top = T / 2;
    const labelFace = new THREE.Group();
    labelFace.rotation.x = -Math.PI / 2;     // lay it on the top of the record
    labelFace.position.y = top + 0.0015;
    spin.add(labelFace);
    const labelFader = makeFader(labelFace, new THREE.CircleGeometry(R * CONFIG.labelRatio, 96), CONFIG.fade * motion);

    const labelRim = new THREE.Mesh(
        new THREE.RingGeometry(R * CONFIG.labelRatio, R * CONFIG.labelRatio + 0.025, 96),
        new THREE.MeshBasicMaterial({ color: 0x050507 })
    );
    labelRim.rotation.x = -Math.PI / 2;
    labelRim.position.y = top + 0.0025;
    spin.add(labelRim);

    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.07, 32), new THREE.MeshBasicMaterial({ color: 0x050507 }));
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = top + 0.0055;
    spin.add(hole);

    const holeRing = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.1, 48), new THREE.MeshBasicMaterial({ color: 0x9a9aac }));
    holeRing.rotation.x = -Math.PI / 2;
    holeRing.position.y = top + 0.005;
    spin.add(holeRing);

    /* Light streaks */
    const sheenTex = makeSheenTexture(smallScreen ? 512 : 1024);
    if (sheenTex) {
        const sheen = new THREE.Mesh(
            new THREE.CircleGeometry(R * 0.985, 128),
            new THREE.MeshBasicMaterial({
                map: sheenTex,
                transparent: true,
                opacity: CONFIG.sheen,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                toneMapped: false,
                polygonOffset: true,
                polygonOffsetFactor: -2,
            })
        );
        sheen.rotation.x = -Math.PI / 2;
        sheen.position.y = top + 0.006;
        sheenPivot.add(sheen);
    }

    /* Shadow of the sleeve falling on the record where it comes out */
    const edge = (H - (discX - R)) / (2 * R);
    const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(R * 0.995, 96),
        new THREE.MeshBasicMaterial({ map: makeShadowTexture(edge), transparent: true, depthWrite: false, toneMapped: false })
    );
    shadow.position.set(discX, 0, discZ + top + 0.012);
    comp.add(shadow);

    /* ---------- Cover textures ---------- */
    const loader = new THREE.TextureLoader();
    const textures = new Map();
    let wanted = '';

    // Crop non-square images to a square from the centre so nothing is stretched
    const cropSquare = (tex) => {
        const img = tex.image;
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) return;
        if (w > h) { tex.repeat.x = h / w; tex.offset.x = (1 - tex.repeat.x) / 2; }
        else if (h > w) { tex.repeat.y = w / h; tex.offset.y = (1 - tex.repeat.y) / 2; }
    };

    const applyCover = (tex) => {
        sleeveFader.set(tex);
        labelFader.set(tex);
    };

    const setCover = (src) => {
        if (!src || src === wanted) return;
        wanted = src;
        if (textures.has(src)) { applyCover(textures.get(src)); return; }
        loader.load(
            src,
            (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.anisotropy = aniso;
                cropSquare(tex);
                textures.set(src, tex);
                if (wanted === src) applyCover(tex);
            },
            undefined,
            () => { if (wanted === src) wanted = ''; } // image failed – keep the previous cover
        );
    };

    window.addEventListener('album:cover', (e) => setCover(e.detail && e.detail.src));
    if (window.albumCover) setCover(window.albumCover);

    /* ---------- Sizing ---------- */
    const resize = () => {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        const t = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
        const z = Math.max(CONFIG.fit.w / 2 / (t * camera.aspect), CONFIG.fit.h / 2 / t);
        camera.position.set(0, 0, z);
        camera.updateProjectionMatrix();
    };

    /* ---------- Interaction ---------- */
    const pointer = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    window.addEventListener(
        'pointermove',
        (e) => {
            target.x = (e.clientX / window.innerWidth) * 2 - 1;
            target.y = (e.clientY / window.innerHeight) * 2 - 1;
        },
        { passive: true }
    );

    let angle = 0;
    let vel = 0;
    let playing = true;
    let dragging = false;
    let lastX = 0;
    let lastT = 0;
    let downT = 0;
    let moved = 0;

    const toggle = () => {
        playing = !playing;
        host.classList.toggle('is-paused', !playing);
    };

    host.addEventListener('pointerdown', (e) => {
        dragging = true;
        moved = 0;
        lastX = e.clientX;
        lastT = downT = performance.now();
        host.setPointerCapture(e.pointerId);
        host.classList.add('is-dragging');
    });
    host.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const now = performance.now();
        const dx = e.clientX - lastX;
        moved += Math.abs(dx);
        const dt = Math.max((now - lastT) / 1000, 1 / 240);
        const dAngle = -dx * CONFIG.dragSpeed;           // dragging right turns the record clockwise
        angle += dAngle;
        vel = THREE.MathUtils.clamp(vel * 0.6 + (dAngle / dt) * 0.4, -14, 14);
        lastX = e.clientX;
        lastT = now;
    });
    host.addEventListener('pointerup', () => {
        if (!dragging) return;
        dragging = false;
        host.classList.remove('is-dragging');
        if (moved < 5 && performance.now() - downT < 350) toggle(); // a tap / click, not a drag
    });
    host.addEventListener('pointercancel', () => { dragging = false; host.classList.remove('is-dragging'); });
    host.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
        if (e.key === 'ArrowLeft') vel += 4;
        if (e.key === 'ArrowRight') vel -= 4;
    });

    /* ---------- Render loop ---------- */
    let last = performance.now();
    let running = false;
    let raf = 0;

    const frame = (now) => {
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        const t = now / 1000;

        if (!dragging) {
            const targetVel = playing ? CONFIG.spin * motion : 0;
            vel += (targetVel - vel) * (1 - Math.exp(-dt * 1.2)); // coast back to resting speed
            angle += vel * dt;
        }
        spin.rotation.y = angle;

        pointer.x += (target.x - pointer.x) * 0.05;
        pointer.y += (target.y - pointer.y) * 0.05;

        rig.rotation.x = -CONFIG.tilt.pitch + Math.sin(t * CONFIG.swaySpeed * 0.8) * CONFIG.sway.pitch * motion + pointer.y * CONFIG.pointer * 0.5;
        rig.rotation.y = CONFIG.tilt.yaw + Math.sin(t * CONFIG.swaySpeed) * CONFIG.sway.yaw * motion + pointer.x * CONFIG.pointer;
        rig.rotation.z = CONFIG.tilt.roll + Math.sin(t * CONFIG.swaySpeed * 0.6) * 0.03 * motion;
        rig.position.y = Math.sin(t * 0.9) * CONFIG.float * motion;
        sheenPivot.rotation.y = -pointer.x * 0.6 + t * 0.04 * motion;
        if (glossTex) glossTex.offset.x = 0.25 + pointer.x * 0.2 + Math.sin(t * 0.3) * 0.1 * motion;

        sleeveFader.update(dt);
        labelFader.update(dt);

        renderer.render(scene, camera);
        if (running) raf = requestAnimationFrame(frame);
    };
    const start = () => {
        if (running) return;
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
    };
    const stop = () => {
        running = false;
        cancelAnimationFrame(raf);
    };

    resize();
    frame(performance.now());
    host.classList.add('is-ready');

    new ResizeObserver(() => {
        resize();
        if (!running) frame(performance.now());
    }).observe(canvas);

    let inView = true;
    new IntersectionObserver(([entry]) => {
        inView = entry.isIntersecting;
        if (inView && !document.hidden) start();
        else stop();
    }).observe(host);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stop();
        else if (inView) start();
    });

    start();
}

/* Keep this call last so everything above is defined before it runs */
if (host && canvas) init();
