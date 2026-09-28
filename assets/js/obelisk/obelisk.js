/* ==========================================================================
   obelisk.js — builds the triangular obelisk in the style of the exhibition
   poster: a dark 3-sided shaft on a stepped plinth, capped by a pyramidion.

   The 3 shaft faces are not identical:
     Face 1 — a bespoke 490mm x 460mm rectangle: reliability-qr stretched
               full width across the bottom third, anatomy-qr and
               contrast-qr side by side above it. See layoutFace1() for
               the exact geometry.
     Face 2 — to the right of face 1 — a bespoke 490mm x 1270mm vertical
               column of 6 QR codes, stacked top to bottom: tiles,
               handwritten, lenticular (centre view only, for now),
               perspective, color, scam. See layoutFace2() for the exact
               geometry.
     Face 3 — blank. No panels, no QR codes; just the bare shaft colour.

   buildObelisk() -> {
     group,      THREE.Group   (add to the scene; centred on the origin)
     qrTargets,  Array<Mesh>   (raycaster targets — the 9 panels)
     height,     number        (full silhouette height in metres, for framing)
   }

   World units are metres.
   ========================================================================== */

import * as THREE from "three";

/* ---- silhouette dimensions (metres) --------------------------------- */
const SIDE = 0.6; // shaft triangle edge
const SHAFT_H = 2.0; // shaft height
const PYRAMIDION_H = 0.3; // pointed cap
const STEP1_H = 0.1; // upper base step
const STEP2_H = 0.09; // lower base step (widest)

const R = SIDE / Math.sqrt(3); // shaft circumradius
const APOTHEM = R / 2; // shaft centre -> face
const STEP1_W = SIDE * 1.35; // upper plinth step (square)
const STEP2_W = SIDE * 1.7; // lower plinth step (square, widest)

const ALIGN_ROT = Math.PI / 3; // rotate the shaft/cap so a face points +Z

// local y layout, base sitting at y = 0
const Y_STEP2 = STEP2_H / 2;
const Y_STEP1 = STEP2_H + STEP1_H / 2;
const Y_SHAFT = STEP2_H + STEP1_H + SHAFT_H / 2;
const Y_PYRAMIDION = STEP2_H + STEP1_H + SHAFT_H + PYRAMIDION_H / 2;
const TOTAL_H = STEP2_H + STEP1_H + SHAFT_H + PYRAMIDION_H;

/* ---- panel layout ---------------------------------------------------- */
const FACE_MARGIN_Y = 0.06;
const FACE_MARGIN_X = 0.055;
const PANEL_GAP = 0.022;
const PANEL_W = SIDE - FACE_MARGIN_X * 2;
const CARD_RADIUS = 0.028;

// per-face panel arrangement:
//   "face1"  — face 1's bespoke 490mm x 460mm rectangle (see layoutFace1)
//   "face2"  — face 2's bespoke 490mm x 1270mm vertical column (see
//              layoutFace2)
//   "blank"  — no panels at all (face 3)
const FACE_LAYOUTS = [
  { type: "face1" }, // face 1 — anatomy-qr, contrast-qr, reliability-qr
  { type: "face2" }, // face 2 — to the right: 6 QR codes, vertical column
  { type: "blank" }, // face 3 — blank, no QR codes
];

// ---- fixed physical envelopes, in metres (1mm = 0.001m) -----------------
const MM = 0.001;

// face 1: a 490mm x 460mm rectangle, centred on the face. reliability-qr
// stretches full width across the bottom third; anatomy-qr and
// contrast-qr sit side by side across the top two-thirds.
const F1_RECT_W = 490 * MM; // == PANEL_W (600 - 55*2)
const F1_RECT_H = 460 * MM;
const F1_RELIABILITY_H = F1_RECT_H / 3;
const F1_PAIR_H = F1_RECT_H - F1_RELIABILITY_H - PANEL_GAP;
const F1_PAIR_W = (F1_RECT_W - PANEL_GAP) / 2;

// face 2: a 490mm x 1270mm column centred on the face, 6 equal full-width
// rows stacked top to bottom — tiles-qr, handwritten-qr, lenticular-qr
// (centre view only, for now), perspective-qr, color-qr, scam-qr.
const F2_COLUMN_W = 490 * MM;
const F2_COLUMN_H = 1270 * MM;
const F2_ROWS = 6;
const F2_ROW_H = (F2_COLUMN_H - PANEL_GAP * (F2_ROWS - 1)) / F2_ROWS;

// poster-ish palette: pink / cyan / yellow / violet / teal
const PALETTE = [0xff8fb1, 0x33c9ef, 0xffd23f, 0x9b5de5, 0x2ec4b6];
const BODY_COLOR = 0x112777; // obelisk shaft + caps

/* ---- seeded RNG ----------------------------------------------------- */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- QR-ish texture (transparent bg, dark modules + scan brackets) --- */
function makeQrTexture(seed, framed) {
  const modules = 21;
  const quiet = 2;
  const cells = modules + quiet * 2;
  const scale = 12;
  const px = cells * scale;

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#1b1420";

  const rand = mulberry32(seed);
  const dark = (c, r) =>
    ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);

  const finder = (ox, oy) => {
    for (let i = 0; i < 7; i++)
      for (let j = 0; j < 7; j++) {
        const edge = i === 0 || i === 6 || j === 0 || j === 6;
        const core = i >= 2 && i <= 4 && j >= 2 && j <= 4;
        if (edge || core) dark(ox + i, oy + j);
      }
  };
  finder(0, 0);
  finder(modules - 7, 0);
  finder(0, modules - 7);

  const density = framed ? 0.32 : 0.5;
  for (let i = 0; i < modules; i++)
    for (let j = 0; j < modules; j++) {
      const inFinder =
        (i < 8 && j < 8) ||
        (i > modules - 9 && j < 8) ||
        (i < 8 && j > modules - 9);
      if (inFinder) continue;
      if (i === 6 || j === 6) {
        if ((i + j) % 2 === 0) dark(i, j);
      } else if (rand() > 1 - density) {
        dark(i, j);
      }
    }

  if (framed) {
    // corner scan brackets just outside the module grid
    const t = scale * 1.4;
    const len = scale * 6;
    const lo = scale * 0.4;
    const hi = px - scale * 0.4;
    ctx.fillRect(lo, lo, len, t);
    ctx.fillRect(lo, lo, t, len);
    ctx.fillRect(hi - len, lo, len, t);
    ctx.fillRect(hi - t, lo, t, len);
    ctx.fillRect(lo, hi - t, len, t);
    ctx.fillRect(lo, hi - len, t, len);
    ctx.fillRect(hi - len, hi - t, len, t);
    ctx.fillRect(hi - t, hi - len, t, len);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ---- rounded-rectangle shape --------------------------------------- */
function roundedRectShape(w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  const x = -w / 2;
  const y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/* ---- one panel (rounded card + QR) -------------------------------- */
// align: -1 = left, 0 = centre, 1 = right
function makePanel(qrId, w, h, color, align, seed, framed) {
  const panel = new THREE.Mesh(
    new THREE.ShapeGeometry(roundedRectShape(w, h, CARD_RADIUS)),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.55,
      metalness: 0.0,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0,
    }),
  );

  const qrDim = Math.min(h * 0.6, w * 0.42, 0.16);
  const chip = qrDim * 1.22;

  const backing = new THREE.Mesh(
    new THREE.ShapeGeometry(roundedRectShape(chip, chip, chip * 0.16)),
    new THREE.MeshBasicMaterial({ color: 0xfdfbf5 }),
  );
  backing.position.z = 0.001;

  const qr = new THREE.Mesh(
    new THREE.PlaneGeometry(qrDim, qrDim),
    new THREE.MeshBasicMaterial({
      map: makeQrTexture(seed, framed),
      transparent: true,
    }),
  );
  qr.position.z = 0.002;

  const chipGroup = new THREE.Group();
  chipGroup.add(backing, qr);
  if (align === 0) {
    chipGroup.position.set(0, 0, 0.003);
  } else {
    const inset = w / 2 - chip / 2 - 0.028;
    chipGroup.position.set(align > 0 ? inset : -inset, 0, 0.003);
  }
  panel.add(chipGroup);

  panel.userData = { qrId, color: new THREE.Color(color) };
  qr.userData.panel = panel;
  return panel;
}

/* ---- face 1's bespoke rectangle --------------------------------------
   A 490mm x 460mm rectangle centred on the face: reliability-qr stretched
   full width across the bottom third, anatomy-qr and contrast-qr side by
   side across the top two-thirds.
   ------------------------------------------------------------------- */
function layoutFace1(faceIndex, qrTargets) {
  const group = new THREE.Group();

  // n is the panel's fixed qrId index (0 = anatomy-qr, 1 = contrast-qr,
  // 2 = reliability-qr) -> qrId face1-(n+1).
  const addPanel = (n, w, h, x, y) => {
    const qrId = `face${faceIndex + 1}-${n + 1}`;
    const color = PALETTE[(faceIndex * 2 + n) % PALETTE.length];
    const seed = (faceIndex + 1) * 1000 + n * 37 + 5;
    const panel = makePanel(qrId, w, h, color, 0, seed, n % 2 === 0);
    panel.position.set(x, y, 0.006);
    group.add(panel);
    qrTargets.push(panel);
  };

  const top = F1_RECT_H / 2; // top edge of the 460mm rectangle
  const pairY = top - F1_PAIR_H / 2;
  const reliabilityY = top - F1_PAIR_H - PANEL_GAP - F1_RELIABILITY_H / 2;
  const pairX = F1_PAIR_W / 2 + PANEL_GAP / 2;

  addPanel(0, F1_PAIR_W, F1_PAIR_H, -pairX, pairY); // anatomy-qr
  addPanel(1, F1_PAIR_W, F1_PAIR_H, pairX, pairY); // contrast-qr
  addPanel(2, F1_RECT_W, F1_RELIABILITY_H, 0, reliabilityY); // reliability-qr

  return group;
}

/* ---- face 2's bespoke vertical column -------------------------------
   A 490mm x 1270mm column centred on the face: 6 equal full-width rows,
   stacked top to bottom — tiles-qr, handwritten-qr, lenticular-qr (centre
   view only, for now), perspective-qr, color-qr, scam-qr.
   ------------------------------------------------------------------- */
function layoutFace2(faceIndex, qrTargets) {
  const group = new THREE.Group();

  // n is the panel's fixed qrId index (0 = tiles-qr, 5 = scam-qr) ->
  // qrId face2-(n+1).
  const addPanel = (n, y) => {
    const qrId = `face${faceIndex + 1}-${n + 1}`;
    const color = PALETTE[(faceIndex * 2 + n) % PALETTE.length];
    const seed = (faceIndex + 1) * 1000 + n * 37 + 5;
    const panel = makePanel(qrId, F2_COLUMN_W, F2_ROW_H, color, 0, seed, n % 2 === 0);
    panel.position.set(0, y, 0.006);
    group.add(panel);
    qrTargets.push(panel);
  };

  let cursor = F2_COLUMN_H / 2; // top edge of the 1270mm column
  for (let n = 0; n < F2_ROWS; n++) {
    addPanel(n, cursor - F2_ROW_H / 2);
    cursor -= F2_ROW_H;
    if (n < F2_ROWS - 1) cursor -= PANEL_GAP;
  }

  return group;
}

/* ---- one shaft face -------------------------------------------------- */
function makeFace(faceIndex, qrTargets) {
  const group = new THREE.Group();
  const angle = (faceIndex * 2 * Math.PI) / 3;
  group.rotation.y = angle;
  group.position.set(Math.sin(angle) * APOTHEM, 0, Math.cos(angle) * APOTHEM);

  const layout = FACE_LAYOUTS[faceIndex];
  if (layout.type === "face1") {
    group.add(layoutFace1(faceIndex, qrTargets));
  } else if (layout.type === "face2") {
    group.add(layoutFace2(faceIndex, qrTargets));
  }
  // "blank" -> nothing added; the bare shaft colour shows

  return group;
}

/* ---- triangular prism (shaft) / pyramidion ------------------------- */
function triPrism(radiusTop, radiusBottom, height, material) {
  const geo = new THREE.CylinderGeometry(
    radiusTop,
    radiusBottom,
    height,
    3,
    1,
    false,
  );
  const mesh = new THREE.Mesh(geo, material);
  mesh.rotation.y = ALIGN_ROT;
  return mesh;
}

/* ---- contact shadow --------------------------------------------- */
function makeContactShadow(y) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0, "rgba(35,20,45,0.28)");
  g.addColorStop(0.55, "rgba(35,20,45,0.12)");
  g.addColorStop(1, "rgba(35,20,45,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(STEP2_W * 1.7, 48),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y + 0.001;
  mesh.renderOrder = -1;
  mesh.userData.ignoreRaycast = true;
  return mesh;
}

/* ---- public builder --------------------------------------------- */
export function buildObelisk() {
  const group = new THREE.Group();
  const qrTargets = [];

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: BODY_COLOR,
    roughness: 0.72,
    metalness: 0.04,
  });

  // stepped square plinth (wider than the triangular shaft)
  const step2 = new THREE.Mesh(
    new THREE.BoxGeometry(STEP2_W, STEP2_H, STEP2_W),
    bodyMaterial,
  );
  step2.position.y = Y_STEP2;
  const step1 = new THREE.Mesh(
    new THREE.BoxGeometry(STEP1_W, STEP1_H, STEP1_W),
    bodyMaterial,
  );
  step1.position.y = Y_STEP1;

  // triangular shaft
  const shaft = triPrism(R, R, SHAFT_H, bodyMaterial);
  shaft.position.y = Y_SHAFT;

  // pyramidion (3-sided pointed cap)
  const cap = triPrism(0.0001, R, PYRAMIDION_H, bodyMaterial);
  cap.position.y = Y_PYRAMIDION;

  group.add(step2, step1, shaft, cap);
  group.add(makeContactShadow(0));

  // faces live on the shaft; parent them to a group at the shaft centre
  const shaftFaces = new THREE.Group();
  shaftFaces.position.y = Y_SHAFT;
  for (let f = 0; f < 3; f++) shaftFaces.add(makeFace(f, qrTargets));
  group.add(shaftFaces);

  // centre the whole silhouette on the origin
  group.position.y = -(TOTAL_H / 2);

  return { group, qrTargets, height: TOTAL_H };
}

/* ---- hover feedback ------------------------------------------------- */
export function setPanelHover(panel, hovered) {
  if (!panel || !panel.material) return;
  panel.material.emissiveIntensity = hovered ? 0.4 : 0;
  panel.scale.setScalar(hovered ? 1.03 : 1);
}

/* ---- enable/disable (dims any panel without a wired-up route) ------- */
export function setPanelEnabled(panel, enabled) {
  panel.userData.disabled = !enabled;
  panel.traverse((obj) => {
    if (!obj.material) return;
    obj.material.transparent = true;
    obj.material.opacity = enabled ? 1 : 0.22;
  });
}
