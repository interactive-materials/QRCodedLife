/* ==========================================================================
   obelisk.js — builds the triangular obelisk in the style of the exhibition
   poster: a dark 3-sided shaft with a flat top, standing on a white floor.

   The 3 shaft faces are not identical:
     Face 1 — three fixed-size panels: anatomy (250mm x 190mm) and
               contrast (140mm x 220mm) side by side, above reliable
               (400mm x 140mm). See layoutFace1() for the exact
               geometry.
     Face 2 — to the right of face 1 — a bespoke 490mm x 1270mm column
               of 6 QR codes of varying size, zig-zagging top to bottom:
               tiles, handdrawn, angle (a 3D perspective QR prism — see
               perspective-prism.js), lens (a lenticular QR: lens-l /
               lens-c / lens-r by viewing angle), color, scam. Positions follow the Artboard 5
               artwork. See layoutFace2() for the exact geometry.
     Face 3 — blank. No panels, no QR codes; just the bare shaft colour.

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

/* ---- silhouette dimensions (metres) --------------------------------- */
const SIDE = 0.6; // shaft triangle edge
const SHAFT_H = 2.0; // shaft height
const FLOOR_SIZE = 10; // floor disc diameter (m)

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
//   "blank"  — no panels at all (face 3)
const FACE_LAYOUTS = [
  { type: "face1" }, // face 1 — anatomy, contrast, reliable
  { type: "face2" }, // face 2 — to the right: 6 QR codes, zig-zag column
  { type: "blank" }, // face 3 — blank, no QR codes
];

// ---- fixed physical envelopes, in metres (1mm = 0.001m) -----------------
const MM = 0.001;

// face 1: anatomy and contrast side by side (bottom-aligned), reliable
// centred beneath them; the whole group is centred on the face.
const F1_ANATOMY_W = 250 * MM;
const F1_ANATOMY_H = 190 * MM;
const F1_CONTRAST_W = 140 * MM;
const F1_CONTRAST_H = 220 * MM;
const F1_RELIABILITY_W = 400 * MM;
const F1_RELIABILITY_H = 140 * MM;
const F1_GAP = 10 * MM; // between anatomy/contrast, and above reliable
const F1_PAIR_W = F1_ANATOMY_W + F1_GAP + F1_CONTRAST_W;
const F1_PAIR_H = Math.max(F1_ANATOMY_H, F1_CONTRAST_H);
const F1_GROUP_H = F1_PAIR_H + F1_GAP + F1_RELIABILITY_H;

// face 2: a 490mm x 1270mm column centred on the face, laid out after
// the Artboard 5 artwork. All positions are in mm from the column's
// top-left corner (x right, y down), as measured on the artboard.
const F2_COLUMN_W = 490 * MM;
const F2_COLUMN_H = 1270 * MM;

// tiles: 125mm squares rotated 45deg, 10mm apart, clipped at the
// column's top and left edges. [i, j] steps are along the diagonal grid
// from the anchor diamond's centre.
const F2_TILE = 125 * MM;
const F2_TILE_GAP = 10 * MM;
const F2_TILE_PITCH = (F2_TILE + F2_TILE_GAP) / Math.SQRT2;
const F2_TILE_ANCHOR = [149, 53]; // centre of the big top diamond
const F2_TILE_CHIP = 90 * MM; // QR chip side, rotated to match the tiles
const F2_TILE_CHIP_MARGIN = 5 * MM;
const F2_TILES = [[-1, -1], [1, -1], [-2, 0], [0, 0], [-1, 1], [1, 1], [-2, 2]];

// the rectangular panels, by qrId index (face2-(n+1)). caption: a
// 100mm x 20mm white label at [x, y], attached to that panel. art: the
// panel is artwork images instead of a coloured card — a frame image
// filling the panel, optionally with a QR image at qrBox [x, y, size] (mm
// from the panel's top-left, measured on the artboard). card: the panel is
// a plain white card as on the artboard — corner radius in mm (0 = square),
// with a QR at qrBox [x, y, size] (mm, the modules' extent): the image at
// `qr` (qrFrac: share of its width that is modules, the rest being its
// white margin), or a placeholder QR when there is none yet — or, with
// `lenticular`, one QR per viewing angle (see makeLenticular). prism: the
// panel is the 3D perspective QR prism (perspective-prism.js) instead of a
// flat card — its footprint is PRISM.W x PRISM.L, i.e. 210mm x 160mm.
const F2_CAPTION_W = 100 * MM;
const F2_CAPTION_H = 20 * MM;
const F2_TILES_CAPTION = [100, 225];

// credits: "Q(art) codes by" + names, bottom-left of the column. [x, y]
// is the top-left of the text block; sizes are font sizes in mm.
const F2_CREDITS = {
  x: 6,
  y: 1077,
  w: 300, // canvas extent, generous enough for the longest line
  h: 240,
  color: "#00C7FF",
  font: '"DM Mono", ui-monospace, monospace',
  titleSize: 16,
  titleLeading: 24,
  nameSize: 12,
  nameLeading: 12,
  namesTop: 72, // first name's top, from the block's top
  title: ["Q(art) codes", 
    "by Interactive Materials Lab", "↓"],
  names: [
    "Clement Zheng",
    "Yong Zhen Zhou",
    "Vina Setiawaty",
    "Stephanie Beh",
    "Jan Juarez",
    "Tan Ler Shan",
    "Danikh Nizam",
    "Myron Teo",
  ],
};
const F2_PANELS = [
  {
    n: 1, x: 290, y: 250, w: 200, h: 220, // handdrawn
    card: { radius: 0, qrBox: [11.6, 10.3, 177], qr: null },
  },
  {
    n: 2, x: 280, y: 615, w: 180, h: 150, // lens (lenticular: l / c / r)
    card: {
      radius: 5,
      qrBox: [31.7, 12.7, 114],
      qrFrac: 1150 / 1218,
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
  { n: 3, x: 5, y: 430, w: PRISM.W * 10, h: PRISM.L * 10, caption: [5, 600], prism: true }, // angle
  {
    n: 4, x: 70, y: 781, w: 150, h: 195, // color
    art: {
      frame: "color/assets/frame_color.png",
      qr: "color/assets/qr-color.png",
      qrBox: [30.3, 51.2, 89.3],
    },
  },
  // scam: the poster image is the whole panel. Its proportions
  // (1955 x 2609px) don't match the artboard's 148 x 210mm slot, so it is
  // fitted to the slot's width, keeping its aspect, and centred in the slot
  // height: 148 x 197.5mm.
  {
    n: 5, x: 315, y: 996.25, w: 148, h: 197.5, // scam
    art: { frame: "scam/assets/DDQRV2.png" },
  },
];

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

/* ---- face 1's bespoke rectangle --------------------------------------
   Anatomy (250mm x 190mm) and contrast (140mm x 220mm) side by side,
   bottom-aligned, above reliable (400mm x 140mm). Each row is centred
   horizontally and the whole group is centred vertically on the face.
   ------------------------------------------------------------------- */
function layoutFace1(faceIndex, qrTargets) {
  const group = new THREE.Group();

  // n is the panel's fixed qrId index (0 = anatomy, 1 = contrast,
  // 2 = reliable) -> qrId face1-(n+1).
  const addPanel = (n, w, h, x, y) => {
    const qrId = `face${faceIndex + 1}-${n + 1}`;
    const color = PALETTE[(faceIndex * 2 + n) % PALETTE.length];
    const seed = (faceIndex + 1) * 1000 + n * 37 + 5;
    const panel = makePanel(qrId, w, h, color, 0, seed, n % 2 === 0);
    panel.position.set(x, y, 0.006);
    group.add(panel);
    qrTargets.push(panel);
  };

  const bottom = -F1_GROUP_H / 2; // bottom edge of the whole group
  const pairBottom = bottom + F1_RELIABILITY_H + F1_GAP;
  const left = -F1_PAIR_W / 2;
  const anatomyX = left + F1_ANATOMY_W / 2;
  const contrastX = left + F1_ANATOMY_W + F1_GAP + F1_CONTRAST_W / 2;

  addPanel(0, F1_ANATOMY_W, F1_ANATOMY_H, anatomyX, pairBottom + F1_ANATOMY_H / 2); // anatomy
  addPanel(1, F1_CONTRAST_W, F1_CONTRAST_H, contrastX, pairBottom + F1_CONTRAST_H / 2); // contrast
  addPanel(2, F1_RELIABILITY_W, F1_RELIABILITY_H, 0, bottom + F1_RELIABILITY_H / 2); // reliable

  return group;
}

/* ---- credits text (canvas texture on a plane) ------------------------
   Returns a centred plane c.w x c.h mm, plus a promise that resolves
   once the text has been redrawn in its web font.
   ------------------------------------------------------------------- */
function makeCredits(c) {
  const pxPerMm = 10;
  const canvas = document.createElement("canvas");
  canvas.width = c.w * pxPerMm;
  canvas.height = c.h * pxPerMm;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = c.color;
    ctx.textBaseline = "top";
    ctx.font = `${c.titleSize * pxPerMm}px ${c.font}`;
    c.title.forEach((line, i) =>
      ctx.fillText(line, 0, i * c.titleLeading * pxPerMm),
    );
    ctx.font = `${c.nameSize * pxPerMm}px ${c.font}`;
    c.names.forEach((line, i) =>
      ctx.fillText(line, 0, (c.namesTop + i * c.nameLeading) * pxPerMm),
    );
    tex.needsUpdate = true;
  };
  draw();

  const family = c.font.split(",")[0];
  const ready =
    document.fonts && document.fonts.load
      ? Promise.all([
          document.fonts.load(`${c.titleSize * pxPerMm}px ${family}`),
          document.fonts.load(`${c.nameSize * pxPerMm}px ${family}`),
        ])
          .then(draw)
          .catch(() => {})
      : Promise.resolve();

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(c.w * MM, c.h * MM),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      toneMapped: false,
    }),
  );
  mesh.userData.ignoreRaycast = true;
  return { mesh, ready };
}

/* ---- artwork panel (frame image + optional QR image) ----------------
   A w x h plane showing `art.frame` (transparency kept), with `art.qr`,
   if given, laid on top at art.qrBox. Image paths are relative to the
   site root. Hidden until the images load; the returned promise resolves
   then.
   ------------------------------------------------------------------- */
const SITE_ROOT = new URL("../../../", import.meta.url);
const textureLoader = new THREE.TextureLoader();

function loadTexture(path, pixelated) {
  return textureLoader.loadAsync(new URL(path, SITE_ROOT).href).then((tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    // keep the QR's modules crisp when seen up close
    if (pixelated) tex.magFilter = THREE.NearestFilter;
    return tex;
  });
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

/* ---- white card panel (artboard frame + QR) --------------------------
   A w x h white card (square or rounded corners) with a QR at
   card.qrBox. The QR is the image at card.qr (loaded, like the artwork
   panels) or, with none, a placeholder from makeQrTexture — sized so its
   modules, not its quiet zone, fill the box.
   ------------------------------------------------------------------- */
function makeCardPanel(qrId, w, h, card, seed) {
  const r = card.radius * MM;
  const panel = new THREE.Mesh(
    r > 0
      ? new THREE.ShapeGeometry(roundedRectShape(w, h, r))
      : new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );

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
    qrMat.map = makeQrTexture(seed, false);
    qr.scale.setScalar(qs / qrMat.map.userData.moduleFrac);
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

/* ---- convex polygon clip ---------------------------------------------
   Clips a convex polygon ([x, y] points) to the half-plane
   p[axis] >= min (Sutherland-Hodgman, one edge).
   ------------------------------------------------------------------- */
function clipPolygon(points, axis, min) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const aIn = a[axis] >= min;
    const bIn = b[axis] >= min;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = (min - a[axis]) / (b[axis] - a[axis]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/* ---- face 2's bespoke column -----------------------------------------
   A 490mm x 1270mm column centred on the face, laid out after the
   Artboard 5 artwork: the tiles diamonds bleed off the top-left corner,
   then handdrawn, angle, lens-c (centre view only, for now), color and
   scam zig-zag right/left down the column. Sizes and positions are the
   F2_* constants above.
   ------------------------------------------------------------------- */
function layoutFace2(faceIndex, qrTargets, assetLoads, updaters) {
  const group = new THREE.Group();

  // artboard mm (top-left origin, y down) -> face metres (centre, y up)
  const toX = (xMm) => xMm * MM - F2_COLUMN_W / 2;
  const toY = (yMm) => F2_COLUMN_H / 2 - yMm * MM;

  const panelColor = (n) => PALETTE[(faceIndex * 2 + n) % PALETTE.length];
  const panelSeed = (n) => (faceIndex + 1) * 1000 + n * 37 + 5;

  // a white caption label, parented to its panel so it hovers/dims with it
  const addCaption = (panel, [xMm, yMm]) => {
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(F2_CAPTION_W, F2_CAPTION_H),
      new THREE.MeshBasicMaterial({ color: 0xfdfbf5 }),
    );
    label.position.set(
      toX(xMm) + F2_CAPTION_W / 2 - panel.position.x,
      toY(yMm) - F2_CAPTION_H / 2 - panel.position.y,
      0.001,
    );
    panel.add(label);
  };

  // tiles (face2-1): one mesh made of every clipped diamond, so the whole
  // cluster hovers and links as a single panel. Its origin sits at the
  // anchor diamond's centre.
  {
    const [ax, ay] = F2_TILE_ANCHOR;
    const half = F2_TILE / Math.SQRT2; // centre -> vertex
    const toLocal = ([x, y]) => new THREE.Vector2(x - ax * MM, -(y - ay * MM));
    const shapes = [];
    const chipCentres = [];
    for (const [i, j] of F2_TILES) {
      // centre in artboard metres (y down)
      const cx = ax * MM + i * F2_TILE_PITCH;
      const cy = ay * MM + j * F2_TILE_PITCH;
      let pts = [
        [cx, cy - half],
        [cx + half, cy],
        [cx, cy + half],
        [cx - half, cy],
      ];
      pts = clipPolygon(clipPolygon(pts, 0, 0), 1, 0);
      if (pts.length < 3) continue;
      shapes.push(new THREE.Shape(pts.map(toLocal)));
      // chips are rotated 45deg to sit square in their diamond; on a
      // diamond cut by the column edge, nudge the chip away from the cut
      // so its corner stays F2_TILE_CHIP_MARGIN inside.
      if (cx >= 0 && cy >= 0) {
        const reach = F2_TILE_CHIP / Math.SQRT2 + F2_TILE_CHIP_MARGIN;
        chipCentres.push(
          toLocal([cx + Math.max(0, reach - cx), cy + Math.max(0, reach - cy)]),
        );
      }
    }

    const panel = new THREE.Mesh(
      new THREE.ShapeGeometry(shapes),
      cardMaterial(panelColor(0)),
    );
    panel.position.set(toX(ax), toY(ay), 0.006);
    chipCentres.forEach((c, k) => {
      const qrDim = F2_TILE_CHIP / 1.22; // makeQrChip's backing is 1.22x
      const { chipGroup } = makeQrChip(qrDim, panelSeed(0) + k, k % 2 === 0);
      chipGroup.position.set(c.x, c.y, 0.003);
      chipGroup.rotation.z = Math.PI / 4;
      panel.add(chipGroup);
    });
    addCaption(panel, F2_TILES_CAPTION);
    panel.userData = {
      qrId: `face${faceIndex + 1}-1`,
      color: new THREE.Color(panelColor(0)),
    };
    group.add(panel);
    qrTargets.push(panel);
  }

  // the rectangular panels
  for (const { n, x, y, w, h, caption, prism, art, card } of F2_PANELS) {
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
      panel.position.set(toX(x + w / 2), toY(y + h / 2), 0.006);
    } else if (art) {
      const built = makeArtPanel(qrId, w * MM, h * MM, art);
      panel = built.panel;
      assetLoads.push(built.ready);
      panel.position.set(toX(x + w / 2), toY(y + h / 2), 0.006);
    } else if (prism) {
      panel = buildPerspectivePrism();
      panel.userData.qrId = qrId;
      panel.position.set(toX(x + w / 2), toY(y + h / 2), 0.001);
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
      panel.position.set(toX(x + w / 2), toY(y + h / 2), 0.006);
    }
    if (caption) addCaption(panel, caption);
    group.add(panel);
    qrTargets.push(panel);
  }

  // credits text, printed straight onto the face (not a link)
  const credits = makeCredits(F2_CREDITS);
  credits.mesh.position.set(
    toX(F2_CREDITS.x + F2_CREDITS.w / 2),
    toY(F2_CREDITS.y + F2_CREDITS.h / 2),
    0.004,
  );
  group.add(credits.mesh);
  assetLoads.push(credits.ready);

  return group;
}

/* ---- one shaft face -------------------------------------------------- */
function makeFace(faceIndex, qrTargets, assetLoads, updaters) {
  const group = new THREE.Group();
  const angle = (faceIndex * 2 * Math.PI) / 3;
  group.rotation.y = angle;
  group.position.set(Math.sin(angle) * APOTHEM, 0, Math.cos(angle) * APOTHEM);

  const layout = FACE_LAYOUTS[faceIndex];
  if (layout.type === "face1") {
    group.add(layoutFace1(faceIndex, qrTargets));
  } else if (layout.type === "face2") {
    group.add(layoutFace2(faceIndex, qrTargets, assetLoads, updaters));
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

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: BODY_COLOR,
    roughness: 0.72,
    metalness: 0.04,
  });

  // triangular shaft, flat-topped
  const shaft = triPrism(R, R, SHAFT_H, bodyMaterial);
  shaft.position.y = Y_SHAFT;

  // plain white floor disc, 10m across; ignored by picking and
  // zoom so zooming at it never drags the orbit target down to it
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(FLOOR_SIZE / 2, 96),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  floor.rotation.x = -Math.PI / 2;
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
    assetsReady: Promise.all(assetLoads),
    update: (camera, dt) =>
      updaters.reduce((busy, u) => u(camera, dt) || busy, false),
  };
}

/* ---- hover feedback ------------------------------------------------- */
export function setPanelHover(panel, hovered) {
  if (!panel) return;
  // every lit part glows (a card, or each face of the perspective prism)
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
    obj.material.transparent = true;
    obj.material.opacity = enabled ? 1 : 0.22;
  });
}
