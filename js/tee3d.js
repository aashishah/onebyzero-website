import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

/* The model is scaled to this height (width follows its shape). Print positions below are in these units:
   y = 0 is the middle of the shirt, +1.12 is the shoulder line and -1.12 the hem. */
export const SHIRT_HEIGHT = 2.24;

/* ---------- Model ---------- */
export async function loadShirt(url) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  gltf.scene.updateMatrixWorld(true);

  // Bake every mesh into one shared coordinate space, centred and scaled to SHIRT_HEIGHT
  const geos = [];
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    // the compressed model stores positions as small integers; turn them back into plain floats before moving them around
    const src = o.geometry;
    const g = new THREE.BufferGeometry();
    ["position", "normal"].forEach((name) => {
      const a = src.attributes[name];
      if (!a) return;
      const f = new Float32Array(a.count * 3);
      for (let i = 0; i < a.count; i++) {
        f[i * 3] = a.getX(i);
        f[i * 3 + 1] = a.getY(i);
        f[i * 3 + 2] = a.getZ(i);
      }
      g.setAttribute(name, new THREE.BufferAttribute(f, 3));
    });
    if (src.index) g.setIndex(src.index.clone());
    g.applyMatrix4(o.matrixWorld);
    geos.push(g);
  });
  const box = new THREE.Box3();
  geos.forEach((g) => {
    g.computeBoundingBox();
    box.union(g.boundingBox);
  });
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const k = SHIRT_HEIGHT / size.y;
  geos.forEach((g) => {
    g.translate(-centre.x, -centre.y, -centre.z);
    g.scale(k, k, k);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    if (!g.attributes.normal) g.computeVertexNormals();
  });
  return { geos, size: size.clone().multiplyScalar(k) };
}

/* One tee = a group of the shared geometries + one material, plus an invisible box used for clicking */
export function createTee(shirt, material) {
  const group = new THREE.Group();
  group.rotation.order = "YXZ";
  shirt.geos.forEach((g) => {
    const m = new THREE.Mesh(g, material);
    m.raycast = () => {}; // too heavy to ray-test; the proxy box below is used instead
    group.add(m);
  });
  const proxy = new THREE.Mesh(
    new THREE.BoxGeometry(
      shirt.size.x * 0.95,
      shirt.size.y,
      shirt.size.z * 1.2,
    ),
    new THREE.MeshBasicMaterial(),
  );
  proxy.material.visible = false;
  proxy.userData.owner = group;
  group.add(proxy);
  group.userData.proxy = proxy;
  return group;
}

/* ---------- Colour helpers ---------- */
export function toHex(color) {
  const g = document.createElement("canvas").getContext("2d");
  g.fillStyle = color;
  return g.fillStyle; // '#rrggbb'
}
export function isLight(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (
    (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) /
      255 >
    0.6
  );
}

/* ---------- Print textures ---------- */
export function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function backPlaceholder(light) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 160;
  const g = c.getContext("2d");
  g.fillStyle = light ? "#111115" : "#f4f4f8";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = "700 84px Inter, system-ui, sans-serif";
  if ("letterSpacing" in g) g.letterSpacing = "16px";
  g.fillText("ONEBYZERO", 512, 84);
  return c;
}

/* Draws the artwork (never stretched) into a texture. Returns { tex, w, h } with w/h in shirt units. */
function printTexture(source, widthUnits, maxHeight, aniso, maxPx) {
  const iw = source.naturalWidth || source.width;
  const ih = source.naturalHeight || source.height;
  let w = widthUnits;
  let h = (w * ih) / iw;
  if (h > maxHeight) {
    h = maxHeight;
    w = (h * iw) / ih;
  }
  const px = Math.min(maxPx, Math.max(iw, 256));
  const c = document.createElement("canvas");
  c.width = Math.round(px);
  c.height = Math.max(8, Math.round((px * ih) / iw));
  c.getContext("2d").drawImage(source, 0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { tex, w, h };
}

/* item: { color, printScale, printY, backScale, backY }; frontImg / backImg: loaded images or null */
export function makePrints(
  item,
  frontImg,
  backImg,
  { aniso = 8, maxPx = 2048 } = {},
) {
  const light = isLight(toHex(item.color || "#0c0c10"));
  const front = frontImg
    ? printTexture(frontImg, (item.printScale ?? 0.5) * 1.28, 1.3, aniso, maxPx)
    : null;
  const back = printTexture(
    backImg || backPlaceholder(light),
    backImg ? (item.backScale ?? 0.5) * 1.28 : 0.62,
    1.3,
    aniso,
    maxPx,
  );
  return {
    front: front && { ...front, y: item.printY ?? 0.2 },
    back: { ...back, y: backImg ? (item.backY ?? 0.3) : 0.64 },
  };
}

/* ---------- Fabric material with the prints projected on ---------- */
const noOp = new THREE.Texture();
export function makeTeeMaterial(item, prints) {
  const base = new THREE.Color(toHex(item.color || "#0c0c10"));
  const light = isLight(toHex(item.color || "#0c0c10"));
  const mat = new THREE.MeshPhysicalMaterial({
    color: base,
    roughness: 0.92,
    metalness: 0,
    side: THREE.DoubleSide,
    sheen: 0.7,
    sheenRoughness: 0.6,
    sheenColor: base.clone().lerp(new THREE.Color(0xffffff), light ? 0.1 : 0.3),
    envMapIntensity: 0.7,
  });
  const uni = {
    uFront: { value: prints.front ? prints.front.tex : noOp },
    uBack: { value: prints.back.tex },
    uFrontRect: {
      value: prints.front
        ? new THREE.Vector4(0, prints.front.y, prints.front.w, prints.front.h)
        : new THREE.Vector4(0, 0, 1, 1),
    },
    uBackRect: {
      value: new THREE.Vector4(0, prints.back.y, prints.back.w, prints.back.h),
    },
    uHasFront: { value: prints.front ? 1 : 0 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uni);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjNormal;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvObjPos = position;\nvObjNormal = normal;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vObjPos;
varying vec3 vObjNormal;
uniform sampler2D uFront;
uniform sampler2D uBack;
uniform vec4 uFrontRect;
uniform vec4 uBackRect;
uniform float uHasFront;`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
{
    vec3 on = normalize(vObjNormal);
    float fm = smoothstep(0.25, 0.55, on.z) * uHasFront;
    float bm = smoothstep(0.25, 0.55, -on.z);
    vec2 fuv = vec2((vObjPos.x - uFrontRect.x) / uFrontRect.z, (vObjPos.y - uFrontRect.y) / uFrontRect.w) + 0.5;
    vec2 buv = vec2(-(vObjPos.x - uBackRect.x) / uBackRect.z, (vObjPos.y - uBackRect.y) / uBackRect.w) + 0.5;
    vec2 fin = step(vec2(0.0), fuv) * step(fuv, vec2(1.0));
    vec2 bin = step(vec2(0.0), buv) * step(buv, vec2(1.0));
    vec4 fp = texture2D(uFront, clamp(fuv, 0.0, 1.0));
    vec4 bp = texture2D(uBack, clamp(buv, 0.0, 1.0));
    float fa = fp.a * fm * fin.x * fin.y;
    float ba = bp.a * bm * bin.x * bin.y;
    diffuseColor.rgb = mix(diffuseColor.rgb, fp.rgb, fa);
    diffuseColor.rgb = mix(diffuseColor.rgb, bp.rgb, ba);
}`,
      );
  };
  mat.customProgramCacheKey = () => "obz-tee";
  return mat;
}

/* ---------- Studio look: environment reflections + lights in the site's colours ---------- */
export function makeStudioEnv(renderer) {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x0a0a14);
  const panel = (color, intensity, size, pos) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size[0], size[1]),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(intensity),
        side: THREE.DoubleSide,
      }),
    );
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.lookAt(0, 0, 0);
    envScene.add(mesh);
  };
  panel(0xffffff, 3.5, [12, 5], [0, 9, 4]);
  panel(0x8566ff, 3, [4, 12], [-9, 1, 3]);
  panel(0x66e0d2, 3, [4, 12], [9, -1, 3]);
  panel(0xdfe4ff, 1.4, [14, 6], [0, 0, 11]);
  panel(0xdfe4ff, 1.4, [14, 6], [0, 2, -11]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();
  return tex;
}

export function addTeeLights(scene) {
  scene.add(new THREE.HemisphereLight(0xdfe4ff, 0x120d1c, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-3, 5, 6);
  const fill = new THREE.DirectionalLight(0xbfc8ff, 0.8);
  fill.position.set(5, 1, 4);
  const rimV = new THREE.DirectionalLight(0x8566ff, 2.2);
  rimV.position.set(-6, 2, -4);
  const rimT = new THREE.DirectionalLight(0x66e0d2, 2.2);
  rimT.position.set(6, 2, -4);
  // light for the back of the shirt while it is spinning
  const back = new THREE.DirectionalLight(0xffffff, 1.4);
  back.position.set(2, 4, -6);
  scene.add(key, fill, rimV, rimT, back);
}
