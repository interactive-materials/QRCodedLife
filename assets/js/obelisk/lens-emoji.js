/* ==========================================================================
   lens-emoji.js — the emoji on each view of LENTIQR, the lenticular QR,
   which the lens modals (content/lentiqr.js) let people choose and the
   lenticular panel on the obelisk (obelisk.js) follows.

   Each view (left, centre, right) is its own QR with an emoji over its
   centre. A view's emoji are its own eyes (looking its way), then its
   own row of VIEW_EMOJI; it starts on its eyes. The choice is
   kept in localStorage, so it holds after the modal closes, across the
   slug pages and over a reload.

   Exports:
     VIEWS                  [{ slug, qr, eyes }], left to right; qr is the
                            view's 400px QR and eyes its own emoji, both
                            site-root relative
     QR_FRAC                share of a QR image's width that is modules
     VIEW_EMOJI             per view, [src], the emoji it can have besides
                            its eyes, site-root relative
     EMOJI_COUNT            how many emoji a view can choose from
     EMOJI_SIZE             an emoji's side, as a share of the QR image's
     getChoice()            a copy of the choice: per view, an index into
                            its emoji (0 = its eyes)
     setChoice(view, i)     set a view's emoji, remember and announce it
     onChoiceChange(fn)     call fn(choice) on every change; returns a
                            function that stops it
     loadLensImages()       Promise<{ qrs, eyes, others }>, the images
                            decoded
     drawLensView(ctx, images, view, i, size)
                            draw a view's QR with its emoji i, size px
                            square, at the canvas's origin
     qrSrc(view), emojiSrc(view, i)
                            absolute URLs, for <img>s
   ========================================================================== */

export const VIEWS = [
  { slug: "lens-l", qr: "lens-l/assets/QR1.png", eyes: "lens-l/assets/frame1.png" },
  { slug: "lens-c", qr: "lens-c/assets/QR2.png", eyes: "lens-c/assets/frame2.png" },
  { slug: "lens-r", qr: "lens-r/assets/QR3.png", eyes: "lens-r/assets/frame3.png" },
];
export const QR_FRAC = 370 / 400; // modules 15..385px of 400

// Microsoft's Fluent Emoji, flat style (MIT: no credit shown, but keep
// assets/img/emoji/LICENSE with them)
// sets of three, one emoji per view: left, centre, right
const SETS = [
  ["right-facing-fist", "oncoming-fist", "left-facing-fist"],
  ["green-book", "blue-book", "orange-book"],
  ["chart-increasing", "bar-chart", "chart-decreasing"],
  ["tiger", "leopard", "cat"],
  ["hatching-chick", "front-facing-baby-chick", "baby-chick"],
  ["seedling", "rose", "wilted-flower"],
  ["globe-americas", "globe-europe-africa", "globe-asia-australia"],
  ["waning-crescent-moon", "full-moon", "waxing-crescent-moon"],
  ["speaker-low", "speaker-medium", "speaker-high"],
];
export const VIEW_EMOJI = VIEWS.map((_, v) =>
  SETS.map((set) => `assets/img/emoji/${set[v]}.svg`),
);
export const EMOJI_COUNT = 1 + SETS.length;
// as in the panel art (1_left.png etc.), centred
export const EMOJI_SIZE = 0.24;

// renamed whenever VIEW_EMOJI changes, so a choice saved against an
// older list starts again on the eyes
const STORAGE_KEY = "coded-life:lens-emoji-sets";
const SITE_ROOT = new URL("../../../", import.meta.url);

const fit = (i) => (Number.isInteger(i) && i >= 0 && i < EMOJI_COUNT ? i : 0);
const emojiPath = (view, i) => (i === 0 ? VIEWS[view].eyes : VIEW_EMOJI[view][i - 1]);

let choice = read();
const listeners = new Set();

function read() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(stored)) return VIEWS.map((_, v) => fit(stored[v]));
  } catch {
    // nothing stored, or storage blocked
  }
  return VIEWS.map(() => 0);
}

export function getChoice() {
  return [...choice];
}

export function setChoice(view, i) {
  const next = fit(i);
  if (!(view in choice) || choice[view] === next) return;
  choice = choice.map((c, v) => (v === view ? next : c));
  try {
    if (choice.every((c) => c === 0)) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // storage blocked: the choice still holds until the page reloads
  }
  for (const fn of listeners) fn(getChoice());
}

export function onChoiceChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ---- images ------------------------------------------------------------- */
async function loadImage(src) {
  const img = new Image();
  img.src = new URL(src, SITE_ROOT).href;
  await img.decode();
  return img;
}

let imagesLoad = null;
export function loadLensImages() {
  imagesLoad ??= Promise.all([
    Promise.all(VIEWS.map((v) => loadImage(v.qr))),
    Promise.all(VIEWS.map((v) => loadImage(v.eyes))),
    Promise.all(VIEW_EMOJI.map((list) => Promise.all(list.map(loadImage)))),
  ]).then(([qrs, eyes, others]) => ({ qrs, eyes, others }));
  return imagesLoad;
}

// the QR's modules stay sharp (no smoothing); the emoji is smoothed
export function drawLensView(ctx, images, view, i, size) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(images.qrs[view], 0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const e = size * EMOJI_SIZE;
  const emoji = i === 0 ? images.eyes[view] : images.others[view][i - 1];
  ctx.drawImage(emoji, (size - e) / 2, (size - e) / 2, e, e);
}

export const emojiSrc = (view, i) => new URL(emojiPath(view, i), SITE_ROOT).href;
export const qrSrc = (view) => new URL(VIEWS[view].qr, SITE_ROOT).href;
