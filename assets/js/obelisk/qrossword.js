/* ==========================================================================
   qrossword.js — QROSSWORD, the hand-drawn QR code that is also a word
   search: its art, its words, and which of them have been found. Shared
   by the handdrawn modal (content/handdrawn.js), where words are found,
   and its panel on the obelisk (obelisk.js), which shows the same finds.

   Which words are found is kept in localStorage, so it holds after the
   modal closes, across the slug pages and over a reload.

   Exports:
     WORDS                 [{ word, region }], in list order
     loadQrossword()       Promise<{ image, width, height, regions }>,
                           read once however many ask
     drawQrossword(ctx, qrossword, x, y, size, found)
                           the QR in a size-square at x, y, with the boxes
                           of the found words
     getFound()            a copy of found: a boolean per word
     findWord(i)           mark word i found and announce it
     onFoundChange(fn)     call fn(found) on every change; returns a
                           function that stops it
   ========================================================================== */

const QR_SRC = new URL("../../../handdrawn/assets/qrossword.svg", import.meta.url).href;
const STORAGE_KEY = "coded-life:qrossword-found";

/* ---- words --------------------------------------------------------------
   The stations hidden in the QR, in list order. `region` is the index of
   the word's red box in qrossword.svg, counted in document order. Box 10
   (marked as Punggol Coast) is left out, so it's never shown or found.
   ------------------------------------------------------------------------ */
export const WORDS = [
  { word: "Harbourfront", region: 4 },
  { word: "Outram Park", region: 15 },
  { word: "Chinatown", region: 3 },
  { word: "Clarke Quay", region: 1 },
  { word: "Dhoby Ghaut", region: 11 },
  { word: "Little India", region: 16 },
  { word: "Farrer Park", region: 5 },
  { word: "Boon Keng", region: 12 },
  { word: "Potong Pasir", region: 2 },
  { word: "Woodleigh", region: 7 },
  { word: "Serangoon", region: 6 },
  { word: "Kovan", region: 8 },
  { word: "Hougang", region: 13 },
  { word: "Buangkok", region: 14 },
  { word: "Sengkang", region: 0 },
  { word: "Punggol", region: 9 },
];

/* ---- art ----------------------------------------------------------------
   qrossword.svg is the QR drawn in black letters on white, with every
   word boxed in red (stroke BOX_STROKE): a <rect>, maybe rotated, or a
   <path> of M / H / V / L. readQrossword() takes the boxes out — each
   one's axis-aligned bounds, in the SVG's units — and returns the rest as
   an image, so the QR starts with none of them showing; drawQrossword()
   draws back the found ones, BOX_LINE of the SVG's units wide, as in the
   SVG.
   ------------------------------------------------------------------------ */
export const BOX_STROKE = "#ff5555";
const BOX_LINE = 3; // SVG units

let qrosswordLoad = null;
export function loadQrossword() {
  qrosswordLoad ??= readQrossword(QR_SRC);
  return qrosswordLoad;
}

async function readQrossword(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const svg = new DOMParser().parseFromString(await res.text(), "image/svg+xml").documentElement;
  const view = svg.viewBox.baseVal;

  const boxes = [...svg.querySelectorAll("[stroke]")].filter(
    (el) => el.getAttribute("stroke").toLowerCase() === BOX_STROKE,
  );
  const regions = boxes.map((el) => bounds(el.localName === "rect" ? rectCorners(el) : pathPoints(el)));
  boxes.forEach((el) => el.remove());

  const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
  const src = URL.createObjectURL(blob);
  const image = new Image();
  image.src = src;
  try {
    await image.decode();
  } finally {
    URL.revokeObjectURL(src);
  }
  return { image, width: view.width, height: view.height, regions };
}

// a <rect>'s four corners, through its rotate(a cx cy), if any
function rectCorners(el) {
  const n = (name) => parseFloat(el.getAttribute(name)) || 0;
  const [x, y, w, h] = [n("x"), n("y"), n("width"), n("height")];
  const corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const m = /rotate\(\s*([-\d.]+)(?:[\s,]+([-\d.]+)[\s,]+([-\d.]+))?\s*\)/.exec(
    el.getAttribute("transform") || "",
  );
  if (!m) return corners;
  const a = (parseFloat(m[1]) * Math.PI) / 180;
  const [cx, cy] = [parseFloat(m[2]) || 0, parseFloat(m[3]) || 0];
  const [cos, sin] = [Math.cos(a), Math.sin(a)];
  return corners.map(([px, py]) => [
    cx + (px - cx) * cos - (py - cy) * sin,
    cy + (px - cx) * sin + (py - cy) * cos,
  ]);
}

// the points of a path made of absolute M / L / H / V moves
function pathPoints(el) {
  const points = [];
  let x = 0;
  let y = 0;
  for (const [, cmd, args] of el.getAttribute("d").matchAll(/([MLHVZ])([^MLHVZ]*)/gi)) {
    const v = (args.match(/-?[\d.]+(?:e-?\d+)?/gi) || []).map(Number);
    if (cmd === "H") v.forEach((n) => points.push([(x = n), y]));
    else if (cmd === "V") v.forEach((n) => points.push([x, (y = n)]));
    else if (cmd === "M" || cmd === "L")
      for (let i = 0; i + 1 < v.length; i += 2) points.push([(x = v[i]), (y = v[i + 1])]);
  }
  return points;
}

function bounds(points) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function drawQrossword(ctx, qrossword, x, y, size, found) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, size, size);
  ctx.drawImage(qrossword.image, x, y, size, size);

  const s = size / qrossword.width;
  ctx.lineWidth = Math.max(1, BOX_LINE * s);
  ctx.strokeStyle = BOX_STROKE;
  WORDS.forEach(({ region }, i) => {
    const b = found[i] && qrossword.regions[region];
    if (b) ctx.strokeRect(x + b.x * s, y + b.y * s, b.w * s, b.h * s);
  });
}

/* ---- found --------------------------------------------------------------
   A boolean per word in WORDS. Stored as the found words' names, so a
   change to WORDS keeps the finds that still match.
   ------------------------------------------------------------------------ */
let found = read();
const listeners = new Set();

function read() {
  try {
    const names = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(names)) return WORDS.map(({ word }) => names.includes(word));
  } catch {
    // nothing stored, or storage blocked
  }
  return WORDS.map(() => false);
}

export function getFound() {
  return [...found];
}

export function findWord(i) {
  if (!(i in found) || found[i]) return;
  found = found.map((f, j) => f || j === i);
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(WORDS.filter((_, j) => found[j]).map(({ word }) => word)),
    );
  } catch {
    // storage blocked: the finds still hold until the page reloads
  }
  for (const fn of listeners) fn(getFound());
}

export function onFoundChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
