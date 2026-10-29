/* ==========================================================================
   perspective-prism.js — the "angle" panel's perspective QR prism, ported
   from the PerspectiveQR-Generator (Hip Roof Simulator) at its default
   settings.

   A hip-roof solid: a W x L base, a ridge of length R at height H. The QR
   graphic is pre-warped across the two trapezoid slopes so it only
   resolves into a clean, scannable square when seen from straight on, a
   scan distance D above the ridge. The two triangular hip ends are plain
   prism colour.

   Generator coordinates (kept here, in cm, so the maths ports 1:1):
   X = width, Y = height (up, out of the base), Z = length (ridge
   direction); from the reveal camera, screen-up is -Z.
     A(W/2,0,-L/2)  B(W/2,0,L/2)  C(-W/2,0,L/2)  D(-W/2,0,-L/2)
     E(0,H,-R/2)    F(0,H,R/2)
   Faces: front A-B-F-E, back D-C-F-E, left hip A-D-E, right hip B-C-F.

   buildPerspectivePrism(shape) returns a THREE.Group in metres, oriented
   for an obelisk face: base on the face's z=0 plane, height along +z,
   width along x, ridge running up/down (y). Footprint W x L = 210mm x
   160mm. It is always clickable, from any angle. shape overrides PRISM's
   R, H and viewDist (see prism-shape.js, which the angle modal sets);
   reshapePerspectivePrism(group, shape) rebuilds it to a new one.

   updateScanCue(group, camera, dt) shows the easter egg: white corner
   brackets hovering over the prism while the camera is where its QR
   resolves (see the scan cue, below). Call it every frame; true while it
   animates.
   ========================================================================== */

import * as THREE from "three";

/* ---- generator defaults (cm) ----------------------------------------- */
export const PRISM = {
  L: 16, // base length, along the ridge (vertical on the face)
  W: 21, // base width (horizontal on the face)
  R: 8, // ridge length
  H: 5, // height out of the face
  viewDist: 10, // scan distance above the ridge top
  prismColor: "#ffffff", // white body
  qrColor: "#112777", // blue QR modules (the obelisk's blue)
};

const GRID_N = 28; // mesh subdivisions per face
const BAKE_RES = 512;
const BUFFER_CM = 1; // total QR buffer (0.5cm per edge)
const MIN_VIEW_DIST_CM = 0.5;
const MIN_MODULE_AREA_CM2 = 1e-6;
const CM = 0.01;

// QR for https://qrcoded.life/angle/ (qrcode@1.5.1, error correction H),
// row by row, 1 = dark module — precomputed so the site needs no QR library.
const QR_ROWS = [
  "111111101010001000000101101111111",
  "100000101011010011110110101000001",
  "101110101101110110000101101011101",
  "101110100000001010100001101011101",
  "101110100011001011010100001011101",
  "100000101011001010010011101000001",
  "111111101010101010101010101111111",
  "000000001000100010101111000000000",
  "001110101111100001011011111100111",
  "111001000011001010011101011000011",
  "101100100110101010000100111101110",
  "101011000011010100111111011001110",
  "101000110111111010010101110000000",
  "101010001001100100100011001101001",
  "111010101000101100101010011001010",
  "010100000011001011100110011100111",
  "010000101110101001011000010110101",
  "000011000101111101101001101100001",
  "011101111001011110011010011000100",
  "011110011100100110000101101001110",
  "010110111100011111011010011111010",
  "110010010011010100100000100000101",
  "101000111000100011110110000010010",
  "101101000000000010110100100101100",
  "101010100110011111111010111110011",
  "000000001110001100100000100011111",
  "111111100111111010001011101010010",
  "100000100011110000000001100011111",
  "101110101100101101100110111110011",
  "101110101001101010001001110011010",
  "101110101000110100001010111000000",
  "100000100000000011101110010101000",
  "111111100101101110001011100000110",
];
const QR = {
  size: QR_ROWS.length,
  get: (row, col) => QR_ROWS[row][col] === "1",
};

/* ---- geometry ------------------------------------------------------- */
function computeVertices(s) {
  return {
    A: [s.W / 2, 0, -s.L / 2],
    B: [s.W / 2, 0, s.L / 2],
    C: [-s.W / 2, 0, s.L / 2],
    D: [-s.W / 2, 0, -s.L / 2],
    E: [0, s.H, -s.R / 2],
    F: [0, s.H, s.R / 2],
  };
}

function faceCornerSets(v) {
  return {
    front: { p00: v.A, p10: v.B, p11: v.F, p01: v.E },
    back: { p00: v.D, p10: v.C, p11: v.F, p01: v.E },
    left: { p00: v.A, p10: v.D, p11: v.E, p01: v.E },
    right: { p00: v.B, p10: v.C, p11: v.F, p01: v.F },
  };
}

// P(s,t) = (1-s)(1-t)p00 + s(1-t)p10 + s t p11 + (1-s) t p01
function bilinear(p00, p10, p11, p01, s, t, out) {
  const w00 = (1 - s) * (1 - t);
  const w10 = s * (1 - t);
  const w11 = s * t;
  const w01 = (1 - s) * t;
  for (let k = 0; k < 3; k++)
    out[k] = w00 * p00[k] + w10 * p10[k] + w11 * p11[k] + w01 * p01[k];
  return out;
}

function buildFaceGeometry(corners, n) {
  const { p00, p10, p11, p01 } = corners;
  const positions = new Float32Array((n + 1) * (n + 1) * 3);
  const uvs = new Float32Array((n + 1) * (n + 1) * 2);
  const tmp = [0, 0, 0];
  let pi = 0;
  let ui = 0;
  for (let j = 0; j <= n; j++) {
    const t = j / n;
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      bilinear(p00, p10, p11, p01, s, t, tmp);
      positions[pi++] = tmp[0];
      positions[pi++] = tmp[1];
      positions[pi++] = tmp[2];
      uvs[ui++] = s;
      uvs[ui++] = t;
    }
  }
  const indices = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      const b = a + 1;
      const c = a + (n + 1);
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/* ---- reveal-camera projection ------------------------------------------
   The graphic is warped for a camera viewDist above the ridge top,
   looking straight down; central projection onto the base plane maps
   (x,y,z) to (x,z) * camHeight / (camHeight - y).
   ------------------------------------------------------------------- */
function effectiveViewDist(s) {
  return Math.max(s.viewDist, MIN_VIEW_DIST_CM);
}

function revealCameraHeight(s) {
  return s.H + effectiveViewDist(s);
}

function apparentRidgeLength(s) {
  return (s.R * revealCameraHeight(s)) / effectiveViewDist(s);
}

// "2 main slopes" coverage: the QR fits the ridge as the camera sees it
function qrSizeCm(s) {
  const pinch = Math.min(s.L, apparentRidgeLength(s));
  return Math.max(0, Math.min(pinch, s.W) - BUFFER_CM);
}

function forwardProject(p, camHeight) {
  const scale = camHeight / (camHeight - p[1]);
  return [p[0] * scale, p[2] * scale];
}

// closed-form inverse of the projection for one face -> its (s,t)
function invertFaceProjection(corners, targetU, targetW, camHeight) {
  const { p00, p10, p11, p01 } = corners;
  const tAxis = Math.abs(p00[0] - p10[0]) < 1e-9 ? 0 : 2;
  const sAxis = tAxis === 0 ? 2 : 0;
  const A0 = p00[tAxis];
  const A1 = p11[tAxis];
  const Y0 = p00[1];
  const Y1 = p11[1];
  const targetA = tAxis === 0 ? targetU : targetW;
  const targetB = tAxis === 0 ? targetW : targetU;
  const D = camHeight;
  const denomT = D * (A1 - A0) + targetA * (Y1 - Y0);
  if (Math.abs(denomT) < 1e-9) return null;
  const t = (targetA * (D - Y0) - D * A0) / denomT;
  const Yt = Y0 + t * (Y1 - Y0);
  const rawB = targetB / (D / (D - Yt));
  const Bbase0 = p00[sAxis];
  const Bbase1 = p10[sAxis];
  const Btop0 = p01[sAxis];
  const Btop1 = p11[sAxis];
  const Boffset = Bbase0 + t * (Btop0 - Bbase0);
  const Bwidth = Bbase1 - Bbase0 + t * (Btop1 - Btop0 - (Bbase1 - Bbase0));
  if (Math.abs(Bwidth) < 1e-9) return null;
  return { s: (rawB - Boffset) / Bwidth, t };
}

function moduleTargetCorners(qr, sizeCm, row, col) {
  const modSize = sizeCm / qr.size;
  const half = sizeCm / 2;
  const u0 = -half + col * modSize;
  const w0 = -half + row * modSize;
  return [
    [u0, w0],
    [u0 + modSize, w0],
    [u0 + modSize, w0 + modSize],
    [u0, w0 + modSize],
  ];
}

/* ---- 2D polygon helpers --------------------------------------------- */
function polygonSignedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

function cross2(a, b, p) {
  return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
}

function lineIntersect2D(a1, a2, b1, b2) {
  const A1 = a2[1] - a1[1];
  const B1 = a1[0] - a2[0];
  const C1 = A1 * a1[0] + B1 * a1[1];
  const A2 = b2[1] - b1[1];
  const B2 = b1[0] - b2[0];
  const C2 = A2 * b1[0] + B2 * b1[1];
  const det = A1 * B2 - A2 * B1;
  if (Math.abs(det) < 1e-12) return b2;
  return [(B2 * C1 - B1 * C2) / det, (A1 * C2 - A2 * C1) / det];
}

// Sutherland-Hodgman clip of `subject` against convex polygon `clip`
function clipPolygonConvex(subject, clip) {
  let output = subject;
  const sign = polygonSignedArea(clip) >= 0 ? 1 : -1;
  for (let i = 0; i < clip.length && output.length; i++) {
    const c1 = clip[i];
    const c2 = clip[(i + 1) % clip.length];
    if (Math.abs(c1[0] - c2[0]) < 1e-9 && Math.abs(c1[1] - c2[1]) < 1e-9)
      continue; // degenerate edge (a triangular face's collapsed corner)
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const curr = input[j];
      const prev = input[(j - 1 + input.length) % input.length];
      const currIn = sign * cross2(c1, c2, curr) >= -1e-9;
      const prevIn = sign * cross2(c1, c2, prev) >= -1e-9;
      if (currIn) {
        if (!prevIn) output.push(lineIntersect2D(c1, c2, prev, curr));
        output.push(curr);
      } else if (prevIn) {
        output.push(lineIntersect2D(c1, c2, prev, curr));
      }
    }
  }
  return output;
}

function faceBoundaryUW(corners, camHeight) {
  const pts = [corners.p00, corners.p10, corners.p11, corners.p01].map((p) =>
    forwardProject(p, camHeight),
  );
  return pts.filter((p, i) => {
    const prev = pts[(i - 1 + pts.length) % pts.length];
    return Math.abs(p[0] - prev[0]) > 1e-9 || Math.abs(p[1] - prev[1]) > 1e-9;
  });
}

/* ---- per-face texture bake ------------------------------------------
   Each dark module, clipped to this face's outline as the reveal camera
   sees it, mapped back into the face's own (s,t) space and filled as a
   vector polygon.
   ------------------------------------------------------------------- */
function bakeFaceTexture(corners, sizeCm, camHeight, bg, dark) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = BAKE_RES;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, BAKE_RES, BAKE_RES);

  const boundary = faceBoundaryUW(corners, camHeight);
  ctx.beginPath();
  for (let row = 0; row < QR.size; row++)
    for (let col = 0; col < QR.size; col++) {
      if (!QR.get(row, col)) continue;
      const clipped = clipPolygonConvex(
        moduleTargetCorners(QR, sizeCm, row, col),
        boundary,
      );
      if (
        clipped.length < 3 ||
        Math.abs(polygonSignedArea(clipped)) < MIN_MODULE_AREA_CM2
      )
        continue;
      const uv = clipped.map(([u, w]) =>
        invertFaceProjection(corners, u, w, camHeight),
      );
      if (uv.some((p) => !p)) continue;
      uv.forEach(({ s, t }, i) => {
        const px = Math.min(1, Math.max(0, s)) * BAKE_RES;
        const py = Math.min(1, Math.max(0, t)) * BAKE_RES;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
    }
  ctx.fillStyle = dark;
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// the prism is a thin double-sided shell: a ray from inside it would hit
// its faces, so main.js's keep-the-camera-outside check skips it
function prismMesh(geometry, material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.noCollide = true;
  return mesh;
}

// a steady glow (the cards' hover glow) so the slopes, shaded grey by the
// lights, keep their true white and blue; hovering only enlarges it
const FACE_GLOW = 0.4;

function faceMaterial(params) {
  return new THREE.MeshStandardMaterial({
    roughness: 0.6,
    metalness: 0.0,
    side: THREE.DoubleSide,
    emissiveIntensity: FACE_GLOW,
    ...params,
  });
}

/* ---- scan cue -----------------------------------------------------------
   The easter egg: white corner brackets, like a phone camera's QR finder,
   hovering over the prism once the camera is where its graphic resolves
   into a square. That's within SCAN_TOLERANCE of revealCameraHeight()
   from the base, and off the axis through the ridge's middle by no more
   than SCAN_TOLERANCE of that height (about 5.7deg), with the prism on
   screen. The brackets sit level with the QR's corners on the slopes
   (so a camera a little off the point still sees them on the corners),
   lifted CUE_LIFT of the way from there toward the point, sized to frame
   the QR as it's seen from there with CUE_MARGIN to spare, a soft shadow
   under them so they show over the white prism, and breathe gently while
   shown.
   ------------------------------------------------------------------- */
const SCAN_TOLERANCE = 0.1;
const CUE_LIFT = 0.08;
const CUE_MARGIN = 1.15; // the frame's side, as a multiple of the QR's
const CUE_ARM = 0.26; // a bracket's arm, as a share of the frame's side
const CUE_LINE = 0.03; // its thickness, as a share of the frame's side
const CUE_SHADOW = 0.35; // the shadow's opacity, at full
const CUE_FADE = 0.25; // seconds to fade fully in or out
const CUE_BREATHE = 0.025; // the frame's swell, either way
const CUE_PERIOD = 1.8; // seconds per breath

// four L's in the XZ plane, their outer corners at (+-half, +-half)
function bracketsGeometry(half, arm, line) {
  const pos = [];
  const rect = (x0, z0, x1, z1) =>
    pos.push(x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z0, x1, 0, z1, x0, 0, z1);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * half;
      const z = sz * half;
      rect(x, z, x - sx * arm, z - sz * line); // along x
      rect(x, z - sz * line, x - sx * line, z - sz * arm); // along z
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return geo;
}

function cueMesh(geometry, color, renderOrder) {
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthTest: false, // always over the prism it frames
      depthWrite: false,
    }),
  );
  mesh.renderOrder = renderOrder;
  // never picked, zoomed at or collided with
  mesh.userData.ignoreRaycast = true;
  mesh.userData.noCollide = true;
  return mesh;
}

// the brackets, in generator space (cm); hidden until updateScanCue
// shows them
function buildScanCue(s, fc, sizeCm, camHeight) {
  // the QR's corners, all at one height (the prism is symmetric), on the
  // front and back slopes
  const corner = invertFaceProjection(fc.front, sizeCm / 2, sizeCm / 2, camHeight);
  const cornerY = corner ? corner.t * s.H : s.H;
  const lift = cornerY + CUE_LIFT * (camHeight - cornerY);
  // as the reveal camera sees it, the frame at `lift` is this much smaller
  // than on the base, where the QR's size is measured
  const side = sizeCm * CUE_MARGIN * ((camHeight - lift) / camHeight);
  const geo = bracketsGeometry(side / 2, CUE_ARM * side, CUE_LINE * side);
  const cue = new THREE.Group();
  cue.position.y = lift;
  cue.visible = false;
  // the shadow: the same brackets, nudged down-right as seen from the
  // reveal camera (screen-right is +X, screen-down +Z)
  const shadow = cueMesh(geo, 0x000000, 10);
  shadow.position.set(0.5, -0.01, 0.5).multiplyScalar(CUE_LINE * side);
  cue.add(shadow, cueMesh(geo, 0xffffff, 11));
  return cue;
}

const camLocal = new THREE.Vector3();
const prismNdc = new THREE.Vector3();

export function updateScanCue(group, camera, dt) {
  const { shape, inner, cue } = group.userData;
  const camHeight = revealCameraHeight(shape);
  // the camera in generator space: y its height over the base, x / z
  // its offset from the axis
  inner.worldToLocal(camLocal.copy(camera.position));
  group.getWorldPosition(prismNdc).project(camera);
  const aligned =
    qrSizeCm(shape) > 0 &&
    Math.abs(camLocal.y - camHeight) <= SCAN_TOLERANCE * camHeight &&
    Math.hypot(camLocal.x, camLocal.z) <= SCAN_TOLERANCE * camHeight &&
    Math.abs(prismNdc.x) <= 1 &&
    Math.abs(prismNdc.y) <= 1 &&
    prismNdc.z < 1;

  const level = group.userData.cueLevel;
  const next = THREE.MathUtils.clamp(level + (aligned ? dt : -dt) / CUE_FADE, 0, 1);
  group.userData.cueLevel = next;
  if (next === 0) {
    cue.visible = false;
    group.userData.cueTime = 0;
    return level !== 0;
  }
  group.userData.cueTime += dt;
  const swell = 1 + CUE_BREATHE * Math.sin((2 * Math.PI * group.userData.cueTime) / CUE_PERIOD);
  cue.scale.set(swell, 1, swell);
  cue.visible = true;
  const [shadow, brackets] = cue.children;
  shadow.material.opacity = CUE_SHADOW * next;
  brackets.material.opacity = next;
  return true; // shown: it breathes
}

/* ---- public builder ------------------------------------------------- */
function buildInner(s) {
  const fc = faceCornerSets(computeVertices(s));
  const sizeCm = qrSizeCm(s);
  const camHeight = revealCameraHeight(s);

  // generator space (cm, Y up) -> face space (m, +z out of the face):
  // rotating +90deg about x sends Y -> +z and -Z -> +y, so the reveal
  // camera's screen-up lands on the face's up.
  const inner = new THREE.Group();
  inner.rotation.x = Math.PI / 2;
  inner.scale.setScalar(CM);

  for (const name of ["front", "back"]) {
    const map = bakeFaceTexture(fc[name], sizeCm, camHeight, s.prismColor, s.qrColor);
    // emissiveMap = the same graphic, so the glow lifts it evenly
    const mat = faceMaterial({ map, emissiveMap: map, emissive: 0xffffff });
    inner.add(prismMesh(buildFaceGeometry(fc[name], GRID_N), mat));
  }
  for (const name of ["left", "right"]) {
    const mat = faceMaterial({ color: s.prismColor, emissive: s.prismColor });
    inner.add(prismMesh(buildFaceGeometry(fc[name], GRID_N), mat));
  }
  const cue = buildScanCue(s, fc, sizeCm, camHeight);
  inner.add(cue);
  inner.userData.cue = cue;
  return inner;
}

// frees an inner's GPU resources (its baked textures among them)
function disposeInner(inner) {
  inner.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.geometry.dispose();
    if (obj.material.map) obj.material.map.dispose();
    obj.material.dispose();
  });
}

function setInner(group, shape) {
  const old = group.userData.inner;
  if (old) {
    group.remove(old);
    disposeInner(old);
  }
  const inner = buildInner(shape);
  group.add(inner);
  group.userData.shape = shape;
  group.userData.inner = inner;
  group.userData.cue = inner.userData.cue;
}

export function buildPerspectivePrism(shape = {}) {
  const group = new THREE.Group();
  group.userData.steadyGlow = true; // setPanelHover leaves the glow alone
  group.userData.cueLevel = 0;
  group.userData.cueTime = 0;
  setInner(group, { ...PRISM, ...shape });
  return group;
}

// the rest of the group (captions on the obelisk) stays as it is
export function reshapePerspectivePrism(group, shape) {
  setInner(group, { ...group.userData.shape, ...shape });
}

export function disposePerspectivePrism(group) {
  if (group.userData.inner) disposeInner(group.userData.inner);
}
