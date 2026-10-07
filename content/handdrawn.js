/* ==========================================================================
   handdrawn.js — the modal for /handdrawn/: its copy, layout and canvas,
   all in this file, in the same shape as content/color.js.

   Default-exports render({ titleId }), which returns the modal's HTML:
   the header row (no subtitle on an artwork's modal, just the close
   button's row), the interactive top 40% (a <canvas>), the rule, then the
   title and copy. Then mount(contentEl) runs the canvas; modal.js calls it
   once the HTML is in place, and calls the function it returns when the
   modal closes or changes. The close button stays outside, in each page's
   HTML.

   The canvas is a word search: QROSSWORD, the hand-drawn QR code whose
   modules are letters, with the words hidden in it listed to its right
   under a heading. Tapping the place a word is hidden in the QR finds it:
   its box is drawn on the QR and it's crossed out in the list. The list
   itself isn't tappable — the words have to be found in the QR.

   The QR, its words and the finds come from assets/js/obelisk/qrossword.js,
   which the obelisk's QROSSWORD panel shares, so a word found here shows
   there too.
   ========================================================================== */

import {
  WORDS,
  BOX_STROKE,
  loadQrossword,
  drawQrossword,
  getFound,
  findWord,
  onFoundChange,
} from "../assets/js/obelisk/qrossword.js";

const copy = {
  title: "QROSSWORD",
  stageLabel: "QROSSWORD, a hand-drawn QR code that is also a word search",
  listHeading: "Find the MRT stations:",
  body: [
    "QR code is often computer-generated and unreadable to humans.",
    "QROSSWORD replaces the black squares of QR code with handwritten letters, infusing the irregularity of handwriting while allowing readable messages to be encoded inside the QR code",
    "[Placeholder: why the QR code is able to be handwritten, and examples that do not work — copy to come.]",
  ],
};

// read once, when this module loads; without it the canvas shows only
// the list
const qrossword = await loadQrossword().catch((err) => {
  console.warn("handdrawn: could not read the QR code", err);
  return null;
});

/* ---- HTML ---------------------------------------------------------------
   titleId lets the <dialog>'s aria-labelledby point at the heading. The
   list inside the <canvas> is its fallback content: never drawn, but read
   by screen readers; a found word's item says so.
   ------------------------------------------------------------------------ */
const itemText = (i, isFound) => `${WORDS[i].word}${isFound ? " (found)" : ""}`;

export default function render({ titleId }) {
  return `
    <div class="modal__layout">
      <div class="modal__top">
        <header class="modal__header"></header>
        <div class="modal__stage">
          <canvas class="modal__canvas">
            <p>${copy.stageLabel}</p>
            <p>${copy.listHeading}</p>
            <ul>
              ${getFound().map((isFound, i) => `
              <li data-word="${i}">${itemText(i, isFound)}</li>`).join("")}
            </ul>
          </canvas>
        </div>
      </div>
      <hr class="modal__rule" />
      <div class="modal__text">
        <h2 class="modal__title" id="${titleId}">${copy.title}</h2>
        <div class="modal__body">
          ${copy.body.map((p) => `<p>${p}</p>`).join("")}
        </div>
      </div>
    </div>
  `;
}


/* ---- canvas -------------------------------------------------------------
   Layout, in CSS px. The canvas splits into two sections: the QR's, the
   left QR_SECTION of its width, and the list's, the rest. The QR is a
   square centred in its section, as big as fits with QR_MARGIN all
   round — as in color.js, so the two QRs are the same
   size in the same place; the list is centred in its section. The list is its heading, then the words running down in as
   many columns as fit the canvas's height under it, each as wide as its
   longest word; where it's wider than the room beside the QR (on a
   phone), its text shrinks to fit.
   ------------------------------------------------------------------------ */
const QR_SECTION = 0.6; // the QR's section, as a share of the canvas's width
const QR_MARGIN = 0.75; // round the QR, inside its section (rem)
const FONT_SIZE = 0.8125; // the list's text, at most (rem)
const LINE_HEIGHT = 1.6; // a row, as a multiple of the font size
const COLUMN_GAP = 1.25; // between list columns (em)

export function mount(root) {
  const canvas = root.querySelector(".modal__canvas");
  const items = canvas ? [...canvas.querySelectorAll("li[data-word]")] : [];
  if (!canvas || !items.length) return null;
  const ctx = canvas.getContext("2d");

  let width = 0;
  let height = 0;
  let dpr = 1;
  let raf = 0;
  let qr = { x: 0, y: 0, size: 0 };
  let heading = { x: 0, y: 0, h: 0 }; // the list's heading row, CSS px
  let rows = []; // [{ x, y, h }] per word: its row in the list, CSS px
  let found = getFound();

  const css = (name) => getComputedStyle(canvas).getPropertyValue(name).trim();
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize);
  const font = (px, weight = 400) => `${weight} ${px}px ${css("--font") || "sans-serif"}`;

  // the list at font size px: its columns and overall size
  function measureList(px) {
    const lineH = px * LINE_HEIGHT;
    ctx.font = font(px, 700);
    const headingW = ctx.measureText(copy.listHeading).width;
    ctx.font = font(px);
    const perColumn = Math.max(1, Math.floor(height / lineH) - 1);
    const columns = Math.ceil(WORDS.length / perColumn);
    const colW = Math.max(...WORDS.map(({ word }) => ctx.measureText(word).width));
    const colGap = COLUMN_GAP * px;
    return {
      px,
      lineH,
      perColumn,
      colStep: colW + colGap,
      w: Math.max(headingW, columns * colW + (columns - 1) * colGap),
      h: (Math.min(WORDS.length, perColumn) + 1) * lineH,
    };
  }

  // lays out the QR and the list; returns the list's font size (px)
  function layout() {
    const r = rem();
    const section = width * QR_SECTION;
    const size = Math.max(0, Math.min(height, section) - 2 * QR_MARGIN * r);
    const room = width - section;
    // shrinking the text can free a row per column, so close in on a fit
    let list = measureList(FONT_SIZE * r);
    for (let k = 0; k < 4 && list.w > room && room > 0; k++) {
      list = measureList(list.px * (room / list.w));
    }
    qr = { x: (section - size) / 2, y: (height - size) / 2, size };
    const listX = section + Math.max(0, room - list.w) / 2;
    const listY = (height - list.h) / 2;
    heading = { x: listX, y: listY, h: list.lineH };
    rows = WORDS.map((_, i) => ({
      x: listX + Math.floor(i / list.perColumn) * list.colStep,
      y: listY + (1 + (i % list.perColumn)) * list.lineH,
      h: list.lineH,
    }));
    return list.px;
  }

  // a word's box on the QR, in CSS px
  function boxOf(i) {
    const b = qrossword.regions[WORDS[i].region];
    const s = qr.size / qrossword.width;
    return b && { x: qr.x + b.x * s, y: qr.y + b.y * s, w: b.w * s, h: b.h * s };
  }

  function draw() {
    const px = layout();

    if (qrossword && qr.size > 0) {
      // snap to device pixels, as color.js does
      const x = Math.round(qr.x * dpr) / dpr;
      const y = Math.round(qr.y * dpr) / dpr;
      const size = Math.round(qr.size * dpr) / dpr;
      drawQrossword(ctx, qrossword, x, y, size, found);
    }

    const fg = css("--fg");
    ctx.textBaseline = "middle";
    ctx.fillStyle = fg;
    ctx.font = font(px, 700);
    ctx.fillText(copy.listHeading, heading.x, heading.y + heading.h / 2);

    ctx.font = font(px);
    rows.forEach((row, i) => {
      const { word } = WORDS[i];
      const midY = row.y + row.h / 2;
      ctx.fillStyle = found[i] ? css("--fg-muted") : fg;
      ctx.fillText(word, row.x, midY);
      if (found[i]) {
        ctx.beginPath();
        ctx.moveTo(row.x, midY);
        ctx.lineTo(row.x + ctx.measureText(word).width, midY);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = BOX_STROKE;
        ctx.stroke();
      }
    });
  }

  function frame() {
    raf = 0;
    if (!width || !height) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    draw();
  }

  function invalidate() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  // resizing clears the canvas, so redraw straight away rather than on
  // the next frame (which would show a blank one in between)
  const resizer = new ResizeObserver(() => {
    const rect = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    cancelAnimationFrame(raf);
    frame();
  });
  resizer.observe(canvas);

  // the web font may land after the first draw
  document.fonts?.ready.then(invalidate);

  // ---- finding: tapping a word's box on the QR finds it
  const local = (e) => {
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };
  const inside = (b, x, y) => b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  // the word whose box is under the pointer, or -1. Boxes cross, so where
  // they do, a word not yet found wins.
  const wordAt = (e) => {
    if (!qrossword) return -1;
    const [x, y] = local(e);
    const hits = WORDS.map((_, i) => i).filter((i) => inside(boxOf(i), x, y));
    return hits.find((i) => !found[i]) ?? hits[0] ?? -1;
  };

  const onPointerUp = (e) => {
    const i = wordAt(e);
    if (i < 0 || found[i]) return;
    canvas.style.cursor = "";
    findWord(i);
  };
  const unsubscribe = onFoundChange((next) => {
    found = next;
    found.forEach((isFound, i) => (items[i].textContent = itemText(i, isFound)));
    invalidate();
  });
  // the pointer cursor shows only over a box still to find
  const onPointerMove = (e) => {
    const i = wordAt(e);
    canvas.style.cursor = i >= 0 && !found[i] ? "pointer" : "";
  };
  const onPointerLeave = () => {
    canvas.style.cursor = "";
  };

  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  // colours come from CSS tokens
  const scheme = matchMedia("(prefers-color-scheme: dark)");
  scheme.addEventListener("change", invalidate);

  return () => {
    cancelAnimationFrame(raf);
    resizer.disconnect();
    unsubscribe();
    scheme.removeEventListener("change", invalidate);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    width = height = 0;
  };
}
