/* ==========================================================================
   obelisk.js — builds the triangular obelisk in the style of the exhibition
   poster: a dark 3-sided shaft with a flat top, standing on a floor ruled
   with a grid of QR finder markers, its cells tiled in the 3 x 3 pattern
   made in the tiles modal (see floor-pattern.js).

   The 3 shaft faces are not identical. Each is laid out after its
   600mm x 2300mm artwork in totem-bg/ (the face's full width and height):
     Face 1 — the artwork (intro copy, "What Makes A Good QR Code?"),
               with 3 SVG artwork panels on it: anatomy and contrast
               side by side, above reliable. See layoutFace1().
     Face 2 — to the right of face 1 — the artwork ("What Else Can A
               QR Code Be?", captions, credits), with 6 QR codes on it,
               zig-zagging top to bottom: tiles, handdrawn, angle (a 3D
               perspective QR prism — see perspective-prism.js), lens (a
               lenticular QR: lens-l / lens-c / lens-r by viewing angle),
               color, scam. See layoutFace2().
     Face 3 — one artwork filling the whole face. No QR codes. See
               layoutFace3().

   buildObelisk() -> {
     group,      THREE.Group   (add to the scene; centred on the origin)
     qrTargets,  Array<Mesh>   (raycaster targets — the 9 panels)
     height,     number        (full silhouette height in metres, for framing)
     assetsReady, Promise      (resolves once text textures are redrawn in
                                their web font and image panels have
                                loaded; re-render then)
     update,     (camera, dt) => bool
                               (call every frame: updates camera-dependent
                                state — the lenticular panel's view; true
                                while still animating)
   }

   World units are metres.
   ========================================================================== */

import * as THREE from "three";
import {
  buildPerspectivePrism,
  PRISM,
} from "./perspective-prism.js";
import { PATTERN_SIZE, getPattern, onPatternChange } from "./floor-pattern.js";
import { loadQrossword, drawQrossword, getFound, onFoundChange } from "./qrossword.js";

/* ---- silhouette dimensions (metres) --------------------------------- */
const SIDE = 0.6; // shaft triangle edge
const SHAFT_H = 2.3; // shaft height (face 3's artwork is 600mm x 2300mm)
// the floor runs out toward the horizon: a disc FLOOR_SIZE across that
// fades to transparent (showing the sky) from FLOOR_FADE out to its edge
const FLOOR_SIZE = 300; // floor disc diameter (m)
const FLOOR_FADE = 15; // distance from the shaft where the fade starts (m)

// floor grid: square cells whose lines are dotted with QR finder markers
// (ring 1, gap 1, centre 3 modules), like the dotted lines in tile.svg
const FLOOR_CELL = 0.3; // grid cell side (m); one tile of the pattern
const FLOOR_CELL_PX = 680; // a cell's side in the floor texture (px)
const FLOOR_MARKERS = 20; // markers per cell side; each is half its pitch
const FLOOR_COLOR = "#000"; // the markers
const FLOOR_BG = "#FFF"; // the floor between them

const R = SIDE / Math.sqrt(3); // shaft circumradius
const APOTHEM = R / 2; // shaft centre -> face

const ALIGN_ROT = Math.PI / 3; // rotate the shaft so a face points +Z

// local y layout, base sitting on the floor at y = 0
const Y_SHAFT = SHAFT_H / 2;
const TOTAL_H = SHAFT_H;

/* ---- panel layout ---------------------------------------------------- */
const FACE_MARGIN_Y = 0.06;
const FACE_MARGIN_X = 0.055;
const PANEL_GAP = 0.022;
const PANEL_W = SIDE - FACE_MARGIN_X * 2;
const CARD_RADIUS = 0.028;

// per-face panel arrangement:
//   "face1"  — face 1's three fixed-size panels (see layoutFace1)
//   "face2"  — face 2's bespoke 490mm x 1270mm column (see layoutFace2)
//   "face3"  — face 3's full-face artwork (see layoutFace3)
//   "blank"  — no panels at all
const FACE_LAYOUTS = [
  { type: "face1" }, // face 1 — anatomy, contrast, reliable
  { type: "face2" }, // face 2 — to the right: 6 QR codes, zig-zag column
  { type: "face3" }, // face 3 — the full-face artwork, no QR codes
];

// face 3: one artwork the size of the whole face, edge to edge
const F3_ART = "totem-bg/SVG/Asset 1.svg";
// its raster's long side: the face is tall and its small print needs
// more pixels than the panels' SVG_PX
const F3_ART_PX = 4096;

// ---- fixed physical envelopes, in metres (1mm = 0.001m) -----------------
const MM = 0.001;

// faces 1 and 2: each shows FACE_ART.full — the face as designed, its
// QR panels drawn in — except round its live panels, where FACE_ART.bg
// (the same face without the panels) shows instead, PANEL_CLEAR mm past
// each panel's edges, so no drawn QR shows round or under a live panel.
// Panel positions are mm on the artboard from its top-left corner (x
// right, y down), as measured on the full artwork; a panel's [x, y] is
// its top-left. A panel's captions ([x, y, w, h] each) are its title and
// caption on the artwork: cut out of FACE_ART.full and attached to the
// panel, so they grow with it on hover (FACE_ART.bg shows in their place
// on the face).
const FACE_ART = {
  face1: { full: "totem-bg/1x/Asset 2.png", bg: "totem-bg/1x/Asset 4.png" },
  face2: { full: "totem-bg/1x/Asset 3.png", bg: "totem-bg/1x/Asset 5.png" },
};
const ARTBOARD_W = SIDE / MM; // 600mm
const ARTBOARD_H = SHAFT_H / MM; // 2300mm
const PANEL_CLEAR = 2;

// the face artwork lies FACE_Z off the shaft; each panel (but the
// perspective prism) is PANEL_THICK mm thick on it, its front at PANEL_Z,
// its edges its own colours darkened by EDGE_TINT
const FACE_Z = 0.002;
const PANEL_THICK = 3;
const PANEL_Z = FACE_Z + PANEL_THICK * MM;
const EDGE_TINT = 0xbfbfbf;
const EDGE_LAYERS = 12; // copies of an artwork panel making up its edge

// artboard mm (top-left origin, y down) -> face metres (centre, y up)
const toFaceX = (xMm) => (xMm - ARTBOARD_W / 2) * MM;
const toFaceY = (yMm) => (ARTBOARD_H / 2 - yMm) * MM;

// face 1's panels, by qrId index (face1-(n+1)): each its SVG artwork
// (frame), or a card as F2_PANELS' (contrast: its artwork is only the
// QR's white modules, on the artboard's grey rounded card)
const F1_PANELS = [
  {
    n: 0, x: 53.9, y: 891.5, w: 157.1, h: 157.1, // anatomy
    frame: "totem-bg/artwork/SVG/Asset 2.svg",
    captions: [[50, 1057, 200, 52]],
  },
  {
    n: 1, x: 386.4, y: 891.5, w: 160.4, h: 160.4, // contrast
    card: { color: 0xd3d3d3, radius: 15, qrBox: [33.84, 33.84, 92.71], qr: "totem-bg/artwork/SVG/Asset 3.svg" },
    captions: [[386, 1057, 162, 52]],
  },
  {
    n: 2, x: 52.5, y: 1138.7, w: 493.5, h: 82.4, // reliable
    frame: "totem-bg/artwork/SVG/Asset 4.svg",
    captions: [[52, 1236, 362, 54]],
  },
];

// face 2's tiles (face2-1): F2_TILE squares of F2_TILE_ART, upright and
// F2_TILE_GAP apart, in an L: [column, row] steps from the top-left
// tile, whose top-left is F2_TILES_AT
const F2_TILE = 140;
const F2_TILE_GAP = 2;
const F2_TILES_AT = [53.6, 450.2];
const F2_TILES = [[0, 0], [1, 0], [0, 1]];
const F2_TILE_ART = "tiles-qr/assets/tile.svg";
const F2_TILES_CAPTIONS = [[204, 601, 88, 23]];

// face 2's rectangular panels, by qrId index (face2-(n+1)). art: the
// panel is artwork images — a frame image filling the panel, optionally
// with a QR image at qrBox [x, y, size] (mm from the panel's top-left).
// card: the panel is a plain white card — corner radius in mm (0 =
// square), with a QR at qrBox [x, y, size] (mm, the modules' extent): the
// image at `qr` (qrFrac: share of its width that is modules, the rest
// being its white margin), or a placeholder QR when there is none yet —
// or, with `lenticular`, one QR per viewing angle (see makeLenticular).
// qrossword: the panel is QROSSWORD, showing the words found in its modal
// (see makeQrosswordPanel). prism: the panel is the 3D perspective QR
// prism (perspective-prism.js) instead of a flat card — its footprint is
// PRISM.W x PRISM.L, i.e. 210mm x 160mm.
const F2_PANELS = [
  // handdrawn: QROSSWORD's square, the art centred in it at full height
  { n: 1, x: 382.1, y: 664.9, w: 164.3, h: 164.3, qrossword: true, captions: [[481, 839, 68, 22]] },
  {
    n: 2, x: 387.4, y: 1183.1, w: 159.3, h: 119.5, // lens (lenticular: l / c / r)
    captions: [[503, 1313, 49, 24]],
    card: {
      radius: 13,
      qrBox: [39.5, 19.0, 82.5],
      qrFrac: 1110 / 1218,
      lenticular: {
        // left to right, as seen moving round the panel from its left
        views: [
          { slug: "lens-l", qr: "lens-l/assets/1_left.png" },
          { slug: "lens-c", qr: "lens-c/assets/2_center.png" },
          { slug: "lens-r", qr: "lens-r/assets/3_right.png" },
        ],
        spreadDeg: 30, // views split the angles -30..+30deg evenly; beyond, the end views
      },
    },
  },
  // angle: centred on the artwork's 210.5mm x 161.5mm card
  { n: 3, x: 53.45, y: 805.25, w: PRISM.W * 10, h: PRISM.L * 10, prism: true, captions: [[51, 977, 61, 23]] },
  {
    n: 4, x: 53.6, y: 1282.5, w: 150.4, h: 150.4, // color
    art: { frame: "totem-bg/artwork/SVG/Asset 5.svg" },
    captions: [[56, 1442, 52, 23]],
  },
  {
    n: 5, x: 379.0, y: 1421.7, w: 168.5, h: 223.4, // scam
    art: { frame: "totem-bg/artwork/SVG/Asset 6.svg" },
    captions: [[482, 1656, 68, 22]],
  },
];

// poster-ish palette: pink / cyan / yellow / violet / teal
const PALETTE = [0xff8fb1, 0x33c9ef, 0xffd23f, 0x9b5de5, 0x2ec4b6];
const BODY_COLOR = 0x00c7ff; // obelisk shaft + caps: the artwork's background cyan

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
  tex.userData.moduleFrac = modules / cells; // share of the width that is modules
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

/* ---- QR chip (off-white backing + QR), centred on its origin ------- */
function makeQrChip(qrDim, seed, framed) {
  const chip = qrDim * 1.22;

  const backing = new THREE.Mesh(
    new THREE.ShapeGeometry(roundedRectShape(chip, chip, chip * 0.16)),
    new THREE.MeshBasicMaterial({ color: 0xfdfbf5 }),
  );
  backing.position.z = 0.001;

  const qrMat = new THREE.MeshBasicMaterial({ transparent: true });
  const qr = new THREE.Mesh(new THREE.PlaneGeometry(qrDim, qrDim), qrMat);
  qr.position.z = 0.002;
  qr.visible = false;
  standInQr().then((tex) => {
    qrMat.map = tex;
    qrMat.needsUpdate = true;
    qr.visible = true;
  });

  const chipGroup = new THREE.Group();
  chipGroup.add(backing, qr);
  return { chipGroup, chip, qr };
}

/* ---- panel card material ------------------------------------------ */
function cardMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.0,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0,
  });
}

/* ---- one panel (rounded card + QR) -------------------------------- */
// align: -1 = left, 0 = centre, 1 = right
function makePanel(qrId, w, h, color, align, seed, framed) {
  const panel = new THREE.Mesh(
    new THREE.ShapeGeometry(roundedRectShape(w, h, CARD_RADIUS)),
    cardMaterial(color),
  );

  const qrDim = Math.min(h * 0.6, w * 0.42, 0.16);
  const { chipGroup, chip, qr } = makeQrChip(qrDim, seed, framed);
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

/* ---- a face's artwork (faces 1 and 2) --------------------------------
   A plane the face's size showing art.full, with art.bg in place of it
   over each rect ({ x, y, w, h } mm on the artboard) and PANEL_CLEAR
   round it. Unlit, like the artwork panels, so it keeps its colours. Not
   a link; hidden until both images load. Returns the mesh and a promise
   of the art.full image, for addCaptions().
   ------------------------------------------------------------------- */
function loadImage(path) {
  const img = new Image();
  img.src = new URL(path, SITE_ROOT).href;
  return img.decode().then(() => img);
}

function makeFaceArt(art, rects, assetLoads) {
  // opaque (the artwork is): a transparent face would be depth-sorted
  // with the panels, and a panel drawn first would mask it with its soft
  // edge, letting the shaft show round the panel. Drawn a hair deeper
  // than it is, so the captions lying just above it never flicker with it
  // (a constant offset only: one scaled by slope could sink it behind the
  // shaft when seen edge-on)
  const material = new THREE.MeshBasicMaterial({ polygonOffset: true, polygonOffsetUnits: 4 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(SIDE, SHAFT_H), material);
  mesh.position.z = FACE_Z;
  mesh.visible = false;
  mesh.userData.ignoreRaycast = true;
  const fullLoad = loadImage(art.full);
  assetLoads.push(
    Promise.all([fullLoad, loadImage(art.bg)])
      .then(([full, bg]) => {
        const canvas = document.createElement("canvas");
        canvas.width = full.naturalWidth;
        canvas.height = full.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(full, 0, 0);
        // the same artboard rect in each image's own pixels (the two
        // exports can differ by a pixel in size)
        const pxRect = (img, { x, y, w, h }) => {
          const sx = img.naturalWidth / ARTBOARD_W;
          const sy = img.naturalHeight / ARTBOARD_H;
          const c = PANEL_CLEAR;
          return [(x - c) * sx, (y - c) * sy, (w + 2 * c) * sx, (h + 2 * c) * sy];
        };
        for (const rect of rects) ctx.drawImage(bg, ...pxRect(bg, rect), ...pxRect(full, rect));

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        material.map = tex;
        material.needsUpdate = true;
        mesh.visible = true;
      })
      .catch((err) => console.error("obelisk: could not load face art", err)),
  );
  return { mesh, full: fullLoad };
}

// the rects to show art.bg over: each panel, and each of its captions
function faceArtRects(panels) {
  return panels.flatMap((p) => [p, ...(p.captions || []).map(([x, y, w, h]) => ({ x, y, w, h }))]);
}

// each caption ([x, y, w, h] mm on the artboard) cut out of the full
// artwork onto its own plane, parented to the panel at its place on the
// face (flat on it, just above the face artwork), so it grows, dims and
// links with the panel
function addCaptions(panel, captions = [], full, assetLoads) {
  for (const [x, y, w, h] of captions) {
    const material = new THREE.MeshBasicMaterial();
    const caption = new THREE.Mesh(new THREE.PlaneGeometry(w * MM, h * MM), material);
    // placed on the face, then into the panel's own frame (the prism's
    // is turned), so it sits square on the face whatever the panel's is
    caption.position.set(toFaceX(x + w / 2), toFaceY(y + h / 2), FACE_Z + 0.0005);
    panel.updateMatrix();
    caption.applyMatrix4(panel.matrix.clone().invert());
    caption.visible = false;
    panel.add(caption);
    assetLoads.push(
      full
        .then((img) => {
          const sx = img.naturalWidth / ARTBOARD_W;
          const sy = img.naturalHeight / ARTBOARD_H;
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(w * sx);
          canvas.height = Math.round(h * sy);
          canvas
            .getContext("2d")
            .drawImage(img, x * sx, y * sy, w * sx, h * sy, 0, 0, canvas.width, canvas.height);
          const tex = new THREE.CanvasTexture(canvas);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 4;
          material.map = tex;
          material.needsUpdate = true;
          caption.visible = true;
        })
        .catch(() => {}), // makeFaceArt reports a failed load
    );
  }
}

/* ---- panel thickness ---------------------------------------------------
   An artwork panel's edge is EDGE_LAYERS tinted copies of its artwork
   stacked behind it down to the face, cut to the artwork's own outline
   (alphaTest), so a hand-drawn frame gets a hand-drawn edge. A card's is
   its outline extruded. Either is marked userData.edge (see
   setPanelEnabled) and left out of raycasts (ignoreRaycast): picking and
   the camera's collisions go by the panel's front alone. (A card edge's
   undrawn back cap faces into the obelisk, and keepCameraOutside's ray,
   cast from an orbit target inside it, would stop on it, pulling the
   camera in.)
   ------------------------------------------------------------------- */
const EDGE_DATA = { edge: true, ignoreRaycast: true };
const EDGE_DEPTH = (PANEL_THICK - 0.2) * MM; // stops short of the face art

// an edge drawn a little deeper than it is, so it never shows through the
// panel's front, however far off or askew the camera
const EDGE_OFFSET = { polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 };

function thickenArt(panel, tex) {
  const material = new THREE.MeshBasicMaterial({
    map: tex,
    color: EDGE_TINT,
    alphaTest: 0.5,
    ...EDGE_OFFSET,
  });
  for (let k = 1; k <= EDGE_LAYERS; k++) {
    const layer = new THREE.Mesh(panel.geometry, material);
    layer.position.z = (-EDGE_DEPTH * k) / EDGE_LAYERS;
    layer.userData = { ...EDGE_DATA };
    panel.add(layer);
  }
}

// only the extrusion's side walls (its caps, material group 0, are left
// undrawn: a cap just behind the card would show through it in patches)
function thickenCard(panel, w, h, r, color) {
  const edge = new THREE.Mesh(
    new THREE.ExtrudeGeometry(roundedRectShape(w, h, r), { depth: EDGE_DEPTH, bevelEnabled: false }),
    [
      new THREE.MeshBasicMaterial({ visible: false }),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiply(new THREE.Color(EDGE_TINT)),
        ...EDGE_OFFSET,
      }),
    ],
  );
  edge.position.z = -EDGE_DEPTH; // its walls run from the card back to the face
  edge.userData = { ...EDGE_DATA };
  panel.add(edge);
}

/* ---- face 1 ------------------------------------------------------------
   The face's artwork, with anatomy and contrast side by side above
   reliable, each its F1_PANELS artwork.
   ------------------------------------------------------------------- */
function layoutFace1(faceIndex, qrTargets, assetLoads) {
  const group = new THREE.Group();
  const faceArt = makeFaceArt(FACE_ART.face1, faceArtRects(F1_PANELS), assetLoads);
  group.add(faceArt.mesh);

  for (const { n, x, y, w, h, frame, card, captions } of F1_PANELS) {
    const qrId = `face${faceIndex + 1}-${n + 1}`;
    const { panel, ready } = card
      ? makeCardPanel(qrId, w * MM, h * MM, card)
      : makeArtPanel(qrId, w * MM, h * MM, { frame });
    assetLoads.push(ready);
    panel.position.set(toFaceX(x + w / 2), toFaceY(y + h / 2), PANEL_Z);
    addCaptions(panel, captions, faceArt.full, assetLoads);
    group.add(panel);
    qrTargets.push(panel);
  }

  return group;
}

/* ---- artwork panel (frame image + optional QR image) ----------------
   A w x h plane showing `art.frame` (transparency kept), with `art.qr`,
   if given, laid on top at art.qrBox. Image paths are relative to the
   site root. Hidden until the images load; the returned promise resolves
   then.
   ------------------------------------------------------------------- */
const SITE_ROOT = new URL("../../../", import.meta.url);
const textureLoader = new THREE.TextureLoader();

// an SVG is drawn onto a canvas SVG_PX across (its long side): an SVG
// with only a viewBox has no intrinsic size of its own, and a bigger
// raster keeps the artwork sharp up close
const SVG_PX = 2048;

// each SVG is read once, however many textures use it
const svgCanvasLoads = new Map();
function loadSvgCanvas(href, px) {
  const key = `${px} ${href}`;
  if (!svgCanvasLoads.has(key)) svgCanvasLoads.set(key, readSvgCanvas(href, px));
  return svgCanvasLoads.get(key);
}

// the artwork's text fonts. An SVG drawn as an image can't reach the
// page's web fonts or any other file, only what it carries itself, so
// each face a SVG's text names is embedded in it as a data URI.
const SVG_FONTS = [
  { family: "DM Sans", weight: 500, file: "assets/fonts/DMSans-Medium.ttf" },
  { family: "DM Sans", weight: 700, file: "assets/fonts/DMSans-Bold.ttf" },
  { family: "NEL ROUNDED", weight: 400, file: "assets/fonts/NELROUNDED-Regular.otf" },
];

// each font file is read once, however many SVGs use it
const fontDataLoads = new Map();
function loadFontData(file) {
  if (!fontDataLoads.has(file)) {
    const href = new URL(file, SITE_ROOT).href;
    const load = fetch(href)
      .then((res) => {
        if (!res.ok) throw new Error(`could not load ${href}`);
        return res.blob();
      })
      .then(
        (blob) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          }),
      );
    fontDataLoads.set(file, load);
  }
  return fontDataLoads.get(file);
}

// an @font-face rule per SVG_FONTS face whose family the text names (a
// font that fails to load is skipped, and its text falls back). swap: the
// text shows in a fallback while its font loads, rather than not at all
async function svgFontFaces(text) {
  const used = SVG_FONTS.filter(({ family }) => text.includes(family));
  const rules = await Promise.all(
    used.map(({ family, weight, file }) =>
      loadFontData(file)
        .then(
          (data) =>
            `@font-face{font-family:"${family}";font-weight:${weight};font-display:swap;src:url(${data})}`,
        )
        .catch((err) => (console.error("obelisk: could not load font", err), "")),
    ),
  );
  return rules.join("");
}

// an SVG image only starts loading its embedded fonts when first drawn,
// and draws its text in them some frames later. Draw it small until the
// text has changed (the fonts arrived) and then held still, or until
// FONT_SETTLE_MS passes (they were already there, or never came).
const FONT_SETTLE_MS = 2000;
const FONT_PROBE_PX = 96; // the probe's width

async function fontsSettled(img, aspect) {
  const probe = document.createElement("canvas");
  probe.width = FONT_PROBE_PX;
  probe.height = Math.max(1, Math.round(FONT_PROBE_PX / aspect));
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  const snap = () => {
    ctx.clearRect(0, 0, probe.width, probe.height);
    ctx.drawImage(img, 0, 0, probe.width, probe.height);
    return ctx.getImageData(0, 0, probe.width, probe.height).data;
  };
  const same = (a, b) => a.every((v, i) => v === b[i]);

  const start = performance.now();
  let prev = snap();
  let changed = false;
  while (performance.now() - start < FONT_SETTLE_MS) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const next = snap();
    if (!same(prev, next)) changed = true;
    else if (changed) return;
    prev = next;
  }
}

async function readSvgCanvas(href, px) {
  const res = await fetch(href);
  if (!res.ok) throw new Error(`could not load ${href}`);
  const text = await res.text();

  // the viewBox's proportions (naturalWidth / naturalHeight are not
  // reliable for a viewBox-only SVG)
  const svg = new DOMParser().parseFromString(text, "image/svg+xml").documentElement;
  const vb = (svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
  const aspect = vb.length === 4 && vb[2] > 0 && vb[3] > 0 ? vb[2] / vb[3] : 1;

  let source = text;
  let fonts = "";
  if (svg.querySelector("text")) fonts = await svgFontFaces(text);
  if (fonts) {
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = fonts;
    svg.prepend(style);
    source = new XMLSerializer().serializeToString(svg);
  }

  const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (fonts) await fontsSettled(img, aspect);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(aspect >= 1 ? px : px * aspect);
    canvas.height = Math.round(aspect >= 1 ? px / aspect : px);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadTexture(path, pixelated, svgPx = SVG_PX) {
  const href = new URL(path, SITE_ROOT).href;
  const load = /\.svg$/i.test(path)
    ? loadSvgCanvas(href, svgPx).then((canvas) => new THREE.CanvasTexture(canvas))
    : textureLoader.loadAsync(href);
  return load.then((tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    // keep the QR's modules crisp when seen up close
    if (pixelated) tex.magFilter = THREE.NearestFilter;
    return tex;
  });
}

// panels with no QR image of their own show this real QR instead of a
// generated one. STAND_IN_QR_FRAC: share of its width that is modules
// (926 of 1000px; the rest is its white margin).
const STAND_IN_QR = "anatomy/assets/qr-anatomy.png";
const STAND_IN_QR_FRAC = 926 / 1000;
let standInQrLoad;
function standInQr() {
  standInQrLoad ??= loadTexture(STAND_IN_QR, true).catch((err) => {
    console.error("obelisk: could not load stand-in QR", err);
    return null;
  });
  return standInQrLoad;
}

function makeArtPanel(qrId, w, h, art) {
  // unlit, like the QR chips and captions, so the artwork keeps its
  // colours (a lit white frame reads grey on the shaded face)
  const frameMat = new THREE.MeshBasicMaterial({ transparent: true });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), frameMat);

  let qrMat = null;
  if (art.qr) {
    const [qx, qy, qs] = art.qrBox.map((v) => v * MM);
    qrMat = new THREE.MeshBasicMaterial();
    const qr = new THREE.Mesh(new THREE.PlaneGeometry(qs, qs), qrMat);
    qr.position.set(-w / 2 + qx + qs / 2, h / 2 - qy - qs / 2, 0.001);
    panel.add(qr);
  }

  panel.visible = false;
  const ready = Promise.all([
    loadTexture(art.frame),
    art.qr ? loadTexture(art.qr, true) : null,
  ])
    .then(([frameTex, qrTex]) => {
      frameMat.map = frameTex;
      thickenArt(panel, frameTex);
      frameMat.needsUpdate = true;
      if (qrMat) {
        qrMat.map = qrTex;
        qrMat.needsUpdate = true;
      }
      panel.visible = true;
    })
    .catch((err) => console.error("obelisk: could not load panel art", err));

  panel.userData = { qrId };
  return { panel, ready };
}

/* ---- QROSSWORD panel --------------------------------------------------
   A w x w square drawing qrossword.js's QR on a canvas texture, with the
   boxes of the words found so far, redrawn whenever one is found (in the
   handdrawn modal). Unlit, like the artwork panels.
   ------------------------------------------------------------------- */
const QROSSWORD_PX = 2048; // the texture's side

function makeQrosswordPanel(qrId, w) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = QROSSWORD_PX;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  // transparent: the art's frame is hand-drawn, the square around it clear
  const material = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, w), material);
  panel.visible = false;
  panel.userData = { qrId };

  const ready = loadQrossword()
    .then((qrossword) => {
      const draw = (found) => {
        drawQrossword(ctx, qrossword, 0, 0, QROSSWORD_PX, found);
        tex.needsUpdate = true;
      };
      draw(getFound());
      thickenArt(panel, tex);
      onFoundChange(draw);
      panel.visible = true;
    })
    .catch((err) => console.error("obelisk: could not load QROSSWORD", err));
  return { panel, ready };
}

/* ---- white card panel (artboard frame + QR) --------------------------
   A w x h card (square or rounded corners; white, or card.color) with a
   QR at card.qrBox. The QR is the image at card.qr (loaded, like the artwork
   panels) or, with none, the stand-in QR (STAND_IN_QR) — sized so its
   modules, not its quiet zone, fill the box.
   ------------------------------------------------------------------- */
function makeCardPanel(qrId, w, h, card, seed) {
  const r = card.radius * MM;
  const panel = new THREE.Mesh(
    r > 0
      ? new THREE.ShapeGeometry(roundedRectShape(w, h, r))
      : new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ color: card.color ?? 0xffffff }),
  );
  thickenCard(panel, w, h, r, card.color ?? 0xffffff);

  const [qx, qy, qs] = card.qrBox.map((v) => v * MM);
  const qrMat = new THREE.MeshBasicMaterial({ transparent: true });
  const qr = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), qrMat);
  qr.position.set(-w / 2 + qx + qs / 2, h / 2 - qy - qs / 2, 0.001);
  panel.add(qr);

  let ready = Promise.resolve();
  if (card.lenticular) {
    qr.scale.setScalar(qs / (card.qrFrac || 1));
    ready = makeLenticular(panel, qr, qrMat, card.lenticular);
  } else if (card.qr) {
    qr.scale.setScalar(qs / (card.qrFrac || 1));
    qr.visible = false;
    ready = loadTexture(card.qr, true)
      .then((tex) => {
        qrMat.map = tex;
        qrMat.needsUpdate = true;
        qr.visible = true;
      })
      .catch((err) => console.error("obelisk: could not load panel QR", err));
  } else {
    qr.scale.setScalar(qs / STAND_IN_QR_FRAC);
    qr.visible = false;
    ready = standInQr().then((tex) => {
      qrMat.map = tex;
      qrMat.needsUpdate = true;
      qr.visible = true;
    });
  }

  panel.userData.qrId = qrId;
  return { panel, ready };
}

/* ---- lenticular QR -----------------------------------------------------
   After the lenticular simulator: one QR image per view. Which view shows
   depends on the camera's horizontal angle to the panel — the angles
   -spreadDeg..+spreadDeg split evenly between the views, left to right,
   and past either end the end view holds, like the flip of a real
   lenticular print. panel.userData.slug follows the view, so a click
   opens that view's page. Call panel.userData.lens.update(camera) each
   frame.
   ------------------------------------------------------------------- */
function makeLenticular(panel, qr, qrMat, lens) {
  const views = lens.views.map((v) => ({ ...v, qrTex: null }));
  const spread = THREE.MathUtils.degToRad(lens.spreadDeg);
  const local = new THREE.Vector3();
  let current = -1;

  const show = (i) => {
    if (i === current || !views[i].qrTex) return;
    current = i;
    qrMat.map = views[i].qrTex;
    qrMat.needsUpdate = true;
    panel.userData.slug = views[i].slug;
  };

  panel.userData.lens = {
    update(camera) {
      local.copy(camera.position);
      panel.worldToLocal(local);
      const azimuth = Math.atan2(local.x, local.z); // - = viewer to the left
      const t = (azimuth + spread) / (2 * spread);
      show(THREE.MathUtils.clamp(Math.floor(t * views.length), 0, views.length - 1));
    },
  };

  qr.visible = false;
  return Promise.all(
    views.map((v) =>
      loadTexture(v.qr, true).then((qrTex) => {
        v.qrTex = qrTex;
      }),
    ),
  )
    .then(() => {
      show(Math.floor(views.length / 2)); // centre view until the camera says otherwise
      qr.visible = true;
    })
    .catch((err) => console.error("obelisk: could not load lenticular views", err));
}

/* ---- face 2 ------------------------------------------------------------
   The face's artwork, with the tiles in the top-left corner, then
   handdrawn, angle, lens, color and scam zig-zagging right/left down
   the face. Sizes and positions are the F2_* constants above.
   ------------------------------------------------------------------- */
function layoutFace2(faceIndex, qrTargets, assetLoads, updaters) {
  const group = new THREE.Group();

  const panelColor = (n) => PALETTE[(faceIndex * 2 + n) % PALETTE.length];
  const panelSeed = (n) => (faceIndex + 1) * 1000 + n * 37 + 5;

  // each tile's rect on the artboard
  const tileRects = F2_TILES.map(([i, j]) => ({
    x: F2_TILES_AT[0] + i * (F2_TILE + F2_TILE_GAP),
    y: F2_TILES_AT[1] + j * (F2_TILE + F2_TILE_GAP),
    w: F2_TILE,
    h: F2_TILE,
  }));
  const faceArt = makeFaceArt(
    FACE_ART.face2,
    [...tileRects, ...faceArtRects([{ captions: F2_TILES_CAPTIONS }, ...F2_PANELS]).filter((r) => "x" in r)],
    assetLoads,
  );
  group.add(faceArt.mesh);

  // tiles (face2-1): one mesh made of every tile, so the whole cluster
  // hovers and links as a single panel. Its origin sits at the top-left
  // tile's centre.
  {
    const half = (F2_TILE / 2) * MM;
    const ox = toFaceX(F2_TILES_AT[0] + F2_TILE / 2);
    const oy = toFaceY(F2_TILES_AT[1] + F2_TILE / 2);
    // each tile's centre, local (y up)
    const centres = tileRects.map(
      (r) => new THREE.Vector2(toFaceX(r.x + r.w / 2) - ox, toFaceY(r.y + r.h / 2) - oy),
    );
    const shapes = centres.map(
      (c) =>
        new THREE.Shape([
          new THREE.Vector2(c.x - half, c.y - half),
          new THREE.Vector2(c.x + half, c.y - half),
          new THREE.Vector2(c.x + half, c.y + half),
          new THREE.Vector2(c.x - half, c.y + half),
        ]),
    );

    // each tile shows the whole art: map its corners to the art's. The
    // tiles don't touch, so a vertex belongs to its nearest centre.
    const geometry = new THREE.ShapeGeometry(shapes);
    const pos = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v);
      const y = pos.getY(v);
      let c = centres[0];
      for (const d of centres)
        if (Math.hypot(x - d.x, y - d.y) < Math.hypot(x - c.x, y - c.y)) c = d;
      uv.setXY(v, 0.5 + (x - c.x) / (2 * half), 0.5 + (y - c.y) / (2 * half));
    }

    // unlit, like the artwork panels, so the art keeps its colours
    const tileMat = new THREE.MeshBasicMaterial({ transparent: true });
    const panel = new THREE.Mesh(geometry, tileMat);
    panel.position.set(ox, oy, PANEL_Z);
    panel.visible = false;
    assetLoads.push(
      loadTexture(F2_TILE_ART)
        .then((tex) => {
          tileMat.map = tex;
          thickenArt(panel, tex);
          tileMat.needsUpdate = true;
          panel.visible = true;
        })
        .catch((err) => console.error("obelisk: could not load tile art", err)),
    );
    panel.userData = {
      qrId: `face${faceIndex + 1}-1`,
      color: new THREE.Color(panelColor(0)),
    };
    addCaptions(panel, F2_TILES_CAPTIONS, faceArt.full, assetLoads);
    group.add(panel);
    qrTargets.push(panel);
  }

  // the rectangular panels
  for (const { n, x, y, w, h, prism, art, card, qrossword, captions } of F2_PANELS) {
    const qrId = `face${faceIndex + 1}-${n + 1}`;
    let panel;
    if (card) {
      const built = makeCardPanel(qrId, w * MM, h * MM, card, panelSeed(n));
      panel = built.panel;
      assetLoads.push(built.ready);
      if (panel.userData.lens) {
        const lens = panel.userData.lens;
        updaters.push((camera) => {
          lens.update(camera);
          return false;
        });
      }
      panel.position.set(toFaceX(x + w / 2), toFaceY(y + h / 2), PANEL_Z);
    } else if (qrossword) {
      const built = makeQrosswordPanel(qrId, w * MM);
      panel = built.panel;
      assetLoads.push(built.ready);
      panel.position.set(toFaceX(x + w / 2), toFaceY(y + h / 2), PANEL_Z);
    } else if (art) {
      const built = makeArtPanel(qrId, w * MM, h * MM, art);
      panel = built.panel;
      assetLoads.push(built.ready);
      panel.position.set(toFaceX(x + w / 2), toFaceY(y + h / 2), PANEL_Z);
    } else if (prism) {
      panel = buildPerspectivePrism();
      panel.userData.qrId = qrId;
      panel.position.set(toFaceX(x + w / 2), toFaceY(y + h / 2), 0.001);
    } else {
      panel = makePanel(
        qrId,
        w * MM,
        h * MM,
        panelColor(n),
        0,
        panelSeed(n),
        n % 2 === 0,
      );
      panel.position.set(toFaceX(x + w / 2), toFaceY(y + h / 2), PANEL_Z);
    }
    addCaptions(panel, captions, faceArt.full, assetLoads);
    group.add(panel);
    qrTargets.push(panel);
  }

  return group;
}

/* ---- face 3's full-face artwork --------------------------------------
   F3_ART on a plane exactly the face's size (SIDE x SHAFT_H), its edges
   on the shaft's. Unlit, like the artwork panels, so it keeps its
   colours. Not a link; hidden until it loads.
   ------------------------------------------------------------------- */
function layoutFace3(assetLoads) {
  const material = new THREE.MeshBasicMaterial(); // opaque, as makeFaceArt's
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(SIDE, SHAFT_H), material);
  mesh.position.z = FACE_Z;
  mesh.visible = false;
  mesh.userData.ignoreRaycast = true;
  assetLoads.push(
    loadTexture(F3_ART, false, F3_ART_PX)
      .then((tex) => {
        material.map = tex;
        material.needsUpdate = true;
        mesh.visible = true;
      })
      .catch((err) => console.error("obelisk: could not load face 3 art", err)),
  );
  return mesh;
}

/* ---- one shaft face -------------------------------------------------- */
function makeFace(faceIndex, qrTargets, assetLoads, updaters) {
  const group = new THREE.Group();
  const angle = (faceIndex * 2 * Math.PI) / 3;
  group.rotation.y = angle;
  group.position.set(Math.sin(angle) * APOTHEM, 0, Math.cos(angle) * APOTHEM);

  const layout = FACE_LAYOUTS[faceIndex];
  if (layout.type === "face1") {
    group.add(layoutFace1(faceIndex, qrTargets, assetLoads));
  } else if (layout.type === "face2") {
    group.add(layoutFace2(faceIndex, qrTargets, assetLoads, updaters));
  } else if (layout.type === "face3") {
    group.add(layoutFace3(assetLoads));
  }
  // "blank" -> nothing added; the bare shaft colour shows

  return group;
}

/* ---- triangular prism (shaft) ------------------------------------- */
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

/* ---- floor grid -------------------------------------------------- */
// a PATTERN_SIZE x PATTERN_SIZE block of grid cells, to repeat across the
// floor: the tile art (F2_TILE_ART) in each cell the pattern fills, then
// lines of finder markers along every cell's edges over the lot (a
// marker sits on each corner, where the lines cross). Redrawn whenever
// the pattern changes. Returns the texture and a promise for the tile
// art, after which the floor needs a re-render.
function makeFloorTexture() {
  const cell = FLOOR_CELL_PX;
  const size = cell * PATTERN_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.setScalar(FLOOR_SIZE / (FLOOR_CELL * PATTERN_SIZE));
  tex.anisotropy = 8; // the floor is mostly seen at a glancing angle

  const pitch = cell / FLOOR_MARKERS;
  const m = pitch / 2 / 7; // module: the marker is 7 modules across
  const marker = (cx, cy) => {
    ctx.fillStyle = FLOOR_COLOR;
    ctx.fillRect(cx - 3.5 * m, cy - 3.5 * m, 7 * m, 7 * m);
    ctx.fillStyle = FLOOR_BG;
    ctx.fillRect(cx - 2.5 * m, cy - 2.5 * m, 5 * m, 5 * m);
    ctx.fillStyle = FLOOR_COLOR;
    ctx.fillRect(cx - 1.5 * m, cy - 1.5 * m, 3 * m, 3 * m);
  };

  let tileArt = null; // a canvas, once loaded
  function draw(pattern) {
    ctx.fillStyle = FLOOR_BG;
    ctx.fillRect(0, 0, size, size);
    if (tileArt) {
      pattern.forEach((filled, i) => {
        if (!filled) return;
        const col = i % PATTERN_SIZE;
        const row = Math.floor(i / PATTERN_SIZE);
        ctx.drawImage(tileArt, col * cell, row * cell, cell, cell);
      });
    }
    // markers on the block's edge are cut in half; the lines at 0 and
    // size both draw them, so the halves meet when the texture repeats
    for (let line = 0; line <= PATTERN_SIZE; line++) {
      for (let k = 0; k <= FLOOR_MARKERS * PATTERN_SIZE; k++) {
        marker(k * pitch, line * cell);
        marker(line * cell, k * pitch);
      }
    }
    tex.needsUpdate = true;
  }

  draw(getPattern());
  onPatternChange(draw);
  const tileArtReady = loadSvgCanvas(new URL(F2_TILE_ART, SITE_ROOT).href, SVG_PX)
    .then((art) => {
      tileArt = art;
      draw(getPattern());
    })
    .catch((err) => console.error("obelisk: could not load the floor's tile art", err));
  return { tex, tileArtReady };
}

// the grid, its alpha falling from 1 at FLOOR_FADE to 0 at the disc's
// edge, so the floor melts into the sky's horizon whatever its colours
function makeFloorMaterial(map) {
  const material = new THREE.MeshBasicMaterial({ map, transparent: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.floorFade = {
      value: new THREE.Vector2(FLOOR_FADE, FLOOR_SIZE / 2),
    };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vFloorDist;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvFloorDist = length(position.xy);",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec2 floorFade;\nvarying float vFloorDist;",
      )
      .replace(
        "#include <opaque_fragment>",
        "diffuseColor.a *= 1.0 - smoothstep(floorFade.x, floorFade.y, vFloorDist);\n#include <opaque_fragment>",
      );
  };
  return material;
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
    new THREE.CircleGeometry(SIDE * 2, 48),
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
  const assetLoads = [];
  // per-frame, camera-dependent updates (the lenticular panel's view);
  // each returns true while animating
  const updaters = [];

  // unlit, like the faces' artwork, so the shaft's top and edges are the
  // artwork's exact cyan and the art sits on it seamlessly
  const bodyMaterial = new THREE.MeshBasicMaterial({ color: BODY_COLOR });

  // triangular shaft, flat-topped
  const shaft = triPrism(R, R, SHAFT_H, bodyMaterial);
  shaft.position.y = Y_SHAFT;

  // floor disc ruled with the finder-marker grid (a line crossing sits
  // under the shaft), fading out toward the horizon; ignored by picking
  // and zoom so zooming at it never drags the orbit target down to it
  const floorTexture = makeFloorTexture();
  assetLoads.push(floorTexture.tileArtReady);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(FLOOR_SIZE / 2, 96),
    makeFloorMaterial(floorTexture.tex),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.renderOrder = -2; // before the contact shadow, which lies on it
  floor.userData.ignoreRaycast = true;

  group.add(floor, shaft);
  group.add(makeContactShadow(0));

  // faces live on the shaft; parent them to a group at the shaft centre
  const shaftFaces = new THREE.Group();
  shaftFaces.position.y = Y_SHAFT;
  for (let f = 0; f < 3; f++)
    shaftFaces.add(makeFace(f, qrTargets, assetLoads, updaters));
  group.add(shaftFaces);

  // centre the whole silhouette on the origin
  group.position.y = -(TOTAL_H / 2);

  return {
    group,
    qrTargets,
    height: TOTAL_H,
    floorRadius: FLOOR_SIZE / 2,
    assetsReady: Promise.all(assetLoads),
    update: (camera, dt) =>
      updaters.reduce((busy, u) => u(camera, dt) || busy, false),
  };
}

/* ---- hover feedback ------------------------------------------------- */
export function setPanelHover(panel, hovered) {
  if (!panel) return;
  // every lit part glows (a card's faces); the perspective prism glows
  // all the time, so it only enlarges
  if (!panel.userData.steadyGlow)
    panel.traverse((obj) => {
      if (obj.material && obj.material.emissive)
        obj.material.emissiveIntensity = hovered ? 0.4 : 0;
    });
  panel.scale.setScalar(hovered ? 1.03 : 1);
}

/* ---- enable/disable (dims any panel without a wired-up route) ------- */
export function setPanelEnabled(panel, enabled) {
  panel.userData.disabled = !enabled;
  panel.traverse((obj) => {
    if (!obj.material) return;
    // a thickness edge would stack its dimmed layers back to full colour
    if (obj.userData.edge) {
      obj.visible = enabled;
      return;
    }
    obj.material.transparent = true;
    obj.material.opacity = enabled ? 1 : 0.22;
  });
}
