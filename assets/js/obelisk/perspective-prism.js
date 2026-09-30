/* ==========================================================================
   perspective-prism.js — the "angle" panel's perspective QR prism, ported
   from the PerspectiveQR-Generator (Hip Roof Simulator) at its default
   settings.

   A hip-roof solid: a W x L base, a ridge of length R at height H. The QR
   graphic is pre-warped across the two trapezoid slopes so it only
   resolves into a clean, scannable square when seen from straight on, a
   scan distance D above the ridge. The two triangular hip ends are plain,
   in a lighter tint of the prism colour.

   Generator coordinates (kept here, in cm, so the maths ports 1:1):
   X = width, Y = height (up, out of the base), Z = length (ridge
   direction); from the reveal camera, screen-up is -Z.
     A(W/2,0,-L/2)  B(W/2,0,L/2)  C(-W/2,0,L/2)  D(-W/2,0,-L/2)
     E(0,H,-R/2)    F(0,H,R/2)
   Faces: front A-B-F-E, back D-C-F-E, left hip A-D-E, right hip B-C-F.

   buildPerspectivePrism() returns a THREE.Group in metres, oriented for an
   obelisk face: base on the face's z=0 plane, height along +z, width
   along x, ridge running up/down (y). Footprint W x L = 210mm x 160mm.

   It is only "scannable" — lit up and clickable — while the camera sits
   at the scan point; call updatePrismScan() every frame (see below).
   ========================================================================== */

import * as THREE from "three";

/* ---- generator defaults (cm) ----------------------------------------- */
export const PRISM = {
  L: 16, // base length, along the ridge (vertical on the face)
  W: 21, // base width (horizontal on the face)
  R: 8, // ridge length
  H: 5, // height out of the face
  viewDist: 10, // scan distance above the ridge top
  prismColor: "#112777",
  qrColor: "#ffffff",
};

const GRID_N = 28; // mesh subdivisions per face
const BAKE_RES = 512;
const BUFFER_CM = 1; // total QR buffer (0.5cm per edge)
const TRIANGLE_TINT_FRAC = 0.35; // hip ends: this much lighter than the prism
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

function faceMaterial(params) {
  return new THREE.MeshStandardMaterial({
    roughness: 0.6,
    metalness: 0.0,
    side: THREE.DoubleSide,
    emissiveIntensity: 0,
    ...params,
  });
}

/* ---- "scannable" state -----------------------------------------------
   The QR only resolves from the scan point: straight out from the
   prism's base centre, H + viewDist (150mm) in front of the face. The
   prism counts as scannable while the camera is within SCAN_MAX_ANGLE of
   that line, at SCAN_DIST_RANGE x the scan distance, with the prism on
   screen. Otherwise it is dimmed and not clickable (userData.locked);
   when scannable it lights up, the QR modules glowing.

   Everywhere else it sits at BASE_LEVEL. In between, a transition state:
   with the prism on screen and within TRANSITION_MAX_ANGLE of straight-on
   but not fully scannable, it lights up further in steps by distance
   (TRANSITION_STEPS), but is still not clickable. Only the scan point
   lights it fully.
   ------------------------------------------------------------------- */
const SCAN_MAX_ANGLE = THREE.MathUtils.degToRad(10);
const TRANSITION_MAX_ANGLE = THREE.MathUtils.degToRad(40);
const BASE_LEVEL = 0.2; // look level (0 dimmed .. 1 lit) outside any step
// [within this many m of the prism's base centre, look level added on top
// of BASE_LEVEL], nearest first; further than the last step stays at
// BASE_LEVEL
const TRANSITION_STEPS = [
  [3, 0.6],
  [6, 0.3],
];
const SCAN_DIST_RANGE = [0.75, 1.35];
const SCAN_ON_SCREEN = 0.85; // prism centre within this much of the view (NDC)
const DIM = 0.55; // colour multiplier while not scannable
const QR_GLOW = 0.45; // QR module glow when scannable
const HIP_GLOW = 0.25;
const HOVER_GLOW = 0.2;
const FADE_PER_S = 15; // 1 / fade time

/* ---- public builder ------------------------------------------------- */
export function buildPerspectivePrism(s = PRISM) {
  const fc = faceCornerSets(computeVertices(s));
  const sizeCm = qrSizeCm(s);
  const camHeight = revealCameraHeight(s);
  const prismColor = new THREE.Color(s.prismColor);
  const hipColor = prismColor
    .clone()
    .lerp(new THREE.Color(0xffffff), TRIANGLE_TINT_FRAC);

  // generator space (cm, Y up) -> face space (m, +z out of the face):
  // rotating +90deg about x sends Y -> +z and -Z -> +y, so the reveal
  // camera's screen-up lands on the face's up.
  const inner = new THREE.Group();
  inner.rotation.x = Math.PI / 2;
  inner.scale.setScalar(CM);

  const slopes = [];
  for (const name of ["front", "back"]) {
    const map = bakeFaceTexture(fc[name], sizeCm, camHeight, s.prismColor, s.qrColor);
    // emissiveMap = the same graphic, so only the QR modules glow
    const mat = faceMaterial({ map, emissiveMap: map, emissive: 0xffffff });
    slopes.push(mat);
    inner.add(prismMesh(buildFaceGeometry(fc[name], GRID_N), mat));
  }
  const hips = [];
  for (const name of ["left", "right"]) {
    const mat = faceMaterial({ color: hipColor, emissive: hipColor });
    hips.push(mat);
    inner.add(prismMesh(buildFaceGeometry(fc[name], GRID_N), mat));
  }

  const group = new THREE.Group();
  group.add(inner);
  group.userData.scan = {
    eyeDist: (s.H + s.viewDist) * CM,
    level: BASE_LEVEL, // 0 = dimmed .. 1 = lit
    scannable: false,
    hovered: false,
    slopes,
    hips,
    hipColor,
  };
  group.userData.locked = true;
  applyScanLevel(group.userData.scan, BASE_LEVEL);
  return group;
}

function applyScanLevel(scan, level) {
  scan.level = level;
  const k = DIM + (1 - DIM) * level;
  const hover = scan.hovered ? HOVER_GLOW : 0;
  for (const m of scan.slopes) {
    m.color.setScalar(k);
    m.emissiveIntensity = level * QR_GLOW + hover;
  }
  for (const m of scan.hips) {
    m.color.copy(scan.hipColor).multiplyScalar(k);
    m.emissiveIntensity = level * HIP_GLOW + hover;
  }
}

const _local = new THREE.Vector3();
const _ndc = new THREE.Vector3();

// Updates `prism`'s scannable state for `camera` and eases its look
// toward it. Returns true while still fading (keep rendering).
export function updatePrismScan(prism, camera, dt) {
  const scan = prism.userData.scan;

  _local.copy(camera.position);
  prism.worldToLocal(_local); // base centre at the origin, +z out of the face
  const dist = _local.length();
  const angle = Math.acos(THREE.MathUtils.clamp(_local.z / (dist || 1), -1, 1));
  prism.getWorldPosition(_ndc).project(camera);
  const onScreen =
    _ndc.z < 1 &&
    Math.abs(_ndc.x) <= SCAN_ON_SCREEN &&
    Math.abs(_ndc.y) <= SCAN_ON_SCREEN;
  scan.scannable =
    onScreen &&
    angle <= SCAN_MAX_ANGLE &&
    dist >= scan.eyeDist * SCAN_DIST_RANGE[0] &&
    dist <= scan.eyeDist * SCAN_DIST_RANGE[1];
  prism.userData.locked = !scan.scannable;

  let target = BASE_LEVEL;
  if (scan.scannable) target = 1;
  else if (onScreen && angle <= TRANSITION_MAX_ANGLE) {
    // transition: a brighter step the nearer the camera comes
    const step = TRANSITION_STEPS.find(([maxDist]) => dist <= maxDist);
    if (step) target = BASE_LEVEL + step[1];
  }
  const step = FADE_PER_S * dt;
  const level =
    Math.abs(target - scan.level) <= step
      ? target
      : scan.level + Math.sign(target - scan.level) * step;
  applyScanLevel(scan, level);
  return level !== target;
}

export function setPrismHover(prism, hovered) {
  const scan = prism.userData.scan;
  scan.hovered = hovered;
  applyScanLevel(scan, scan.level);
}
