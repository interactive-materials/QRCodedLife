/* ==========================================================================
   color.js — the modal for /color/: its copy, layout and canvas, all in
   this file.

   Default-exports render({ titleId }), which returns the modal's HTML:
   the header row (no subtitle on an artwork's modal, just the close
   button's row), the interactive top 40% (a <canvas>), the rule, then the
   title and copy. Then mount(contentEl) runs the canvas; modal.js calls it
   once the HTML is in place, and calls the function it returns when the
   modal closes or changes. The close button stays outside, in each page's
   HTML.

   The canvas draws the QOLORFUL QR code with four vertical sliders to its
   right, one per colour. Each slider's thumb is its colour; at the top
   that colour shows as it is, and dragging down fades it to the black or
   white it stands for.

   The QR is drawn module by module from the grid in QOLORful.svg (see
   readColourQr() below and assets/js/obelisk/qr-code.js).
   ========================================================================== */

import { QrCode } from "../assets/js/obelisk/qr-code.js";

const QR_SRC = new URL("../color/assets/QOLORful.svg", import.meta.url).href;

const copy = {
  title: "QOLORFUL",
  stageLabel: "The QOLORFUL QR code, in colour",
  body: [
    "QR code is scannable and processed by computer, different with how we process images with our eyes",
    "QOLORFUL showed this difference by turning QR code into a colourful patchwork that appear differently from usual two-color QR code",
    "[Placeholder: camera image processing — copy to come.]",
  ],
};

/* ---- QR code ------------------------------------------------------------
   QOLORful.svg draws every module as its own <rect>, in one of four
   colours, inside a white margin: magenta and blue stand for black, pink
   and yellow for white (DARK_COLOURS). In black and white it is a negative
   QR — its position markers are white rings on black — framed by a black
   ring (the magenta / blue ring just inside the white margin). Each
   module keeps its colour in module.colour.

   COLOURS are the four, in slider order (left to right), with their names
   for screen readers.
   ------------------------------------------------------------------------ */
const DARK_COLOURS = ["#ff00c8", "#0082ff"];
const COLOURS = [
  { colour: "#ff00c8", name: "Magenta" },
  { colour: "#0082ff", name: "Blue" },
  { colour: "#ffa0ff", name: "Pink" },
  { colour: "#ffff00", name: "Yellow" },
];
const bwOf = (colour) => (DARK_COLOURS.includes(colour) ? "#000000" : "#ffffff");

async function readColourQr(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const svg = new DOMParser().parseFromString(await res.text(), "image/svg+xml").documentElement;

  // the grid: every rect one module, the unit set by the first one; cells
  // with no rect are the white margin
  const rects = [...svg.querySelectorAll("rect[x][y]")];
  if (!rects.length) throw new Error(`no modules in ${url}`);
  const unit = parseFloat(rects[0].getAttribute("width"));
  const total = Math.round(svg.viewBox.baseVal.width / unit);
  const colours = Array.from({ length: total }, () => Array(total).fill("#ffffff"));
  for (const r of rects) {
    const col = Math.round(parseFloat(r.getAttribute("x")) / unit);
    const row = Math.round(parseFloat(r.getAttribute("y")) / unit);
    colours[row][col] = r.getAttribute("fill").toLowerCase();
  }
  const isDark = (row, col) => DARK_COLOURS.includes(colours[row][col]);

  // the symbol: the first offset down the diagonal where a 7 x 7 position
  // marker starts — ring, gap, centre, in either polarity (here it is a
  // negative one) — with as much quiet zone on the far sides
  const isMarkerAt = (q) => {
    if (q + 7 > total) return false;
    const ring = (r, c) => Math.max(Math.abs(r - 3), Math.abs(c - 3)) !== 2;
    const flip = isDark(q, q) !== ring(0, 0);
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 7; c++) if (isDark(q + r, q + c) !== (ring(r, c) !== flip)) return false;
    return true;
  };
  let quiet = 0;
  while (quiet < total / 2 && !isMarkerAt(quiet)) quiet++;
  const n = total - 2 * quiet;
  if (n < 21 || (n - 17) % 4) throw new Error(`can't read a QR grid in ${url} (${n} modules?)`);

  const dark = Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => isDark(r + quiet, c + quiet)),
  );
  const qr = new QrCode(dark, quiet);
  for (const m of qr.modules) m.colour = colours[m.row + quiet][m.col + quiet];
  return qr;
}

// read once, when this module loads; without it the canvas shows only
// the sliders
const qrCode = await readColourQr(QR_SRC).catch((err) => {
  console.warn("color: could not read the QR code", err);
  return null;
});

// a colour at slider value t (0..1): itself at 0, its black or white at 1
const colourAt = (colour, t) => mix(colour, bwOf(colour), t);

// every module's colour, from its colour's slider (values: colour -> t).
// Set from the colour itself, not module.dark: QrCode counts the whole
// quiet zone light, but here part of it is the black ring. The white
// margin has no slider and stays white.
function recolour(qr, values) {
  for (const m of qr.modules) {
    const c = colourAt(m.colour, values[m.colour] ?? 0);
    m.style = { dark: c, light: c };
  }
}

// "#rrggbb" a -> b at t
function mix(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",")})`;
}

/* ---- HTML ---------------------------------------------------------------
   titleId lets the <dialog>'s aria-labelledby point at the heading. The
   range inputs inside the <canvas> are its fallback content: never drawn,
   but focusable (arrow keys move them) and read by screen readers; the
   canvas draws them as the sliders, and dragging a drawn slider moves
   its input.
   ------------------------------------------------------------------------ */
export default function render({ titleId }) {
  return `
    <div class="modal__layout">
      <div class="modal__top">
        <header class="modal__header"></header>
        <div class="modal__stage">
          <canvas class="modal__canvas">
            <p>${copy.stageLabel}</p>
            ${COLOURS.map(
              ({ colour, name }) => `
            <label>${name} to ${bwOf(colour) === "#000000" ? "black" : "white"}
              <input type="range" min="0" max="100" value="0" data-colour="${colour}" />
            </label>`,
            ).join("")}
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
   Layout, in CSS px: the QR (a square, as big as fits) with the four
   sliders SLIDERS_GAP to its right, the group centred in the canvas. Each
   slider is a vertical track SLIDER_LENGTH of the QR's height, centred on
   it, in a column SLIDER_W wide. A thumb is drawn in its colour's current
   shade.
   ------------------------------------------------------------------------ */
const SLIDERS_GAP = 1; // between the QR and the sliders (rem)
const SLIDER_LENGTH = 0.6; // a track's length, as a share of the QR's height
const SLIDER_W = 1.25; // one slider's column (rem)
const SLIDER_SPACING = 0.5; // between slider columns (rem)
const THUMB_R = 0.5; // thumb radius (rem)
const TRACK_W = 4; // px
const THUMB_STROKE = 1.5; // px

export function mount(root) {
  const canvas = root.querySelector(".modal__canvas");
  const inputs = canvas ? [...canvas.querySelectorAll("input[data-colour]")] : [];
  if (!canvas || !inputs.length) return null;
  const ctx = canvas.getContext("2d");
  const qrLayer = document.createElement("canvas");
  const qrCtx = qrLayer.getContext("2d");

  let width = 0;
  let height = 0;
  let dpr = 1;
  let raf = 0;
  let hover = -1; // slider under the pointer
  let focus = -1; // slider whose input has keyboard focus
  let dragging = -1; // slider being dragged
  let tracks = []; // [{ x, y0, y1 }] per slider, CSS px; y0 = value 0 (top)
  const valueOf = (i) => Number(inputs[i].value) / 100;
  const values = () =>
    Object.fromEntries(inputs.map((input, i) => [input.dataset.colour, valueOf(i)]));
  if (qrCode) recolour(qrCode, values());

  const css = (name) => getComputedStyle(canvas).getPropertyValue(name).trim();
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize);

  function layout() {
    const r = rem();
    const colW = SLIDER_W * r;
    const spacing = SLIDER_SPACING * r;
    const slidersW = inputs.length * colW + (inputs.length - 1) * spacing;
    const gap = SLIDERS_GAP * r;
    const size = Math.max(0, Math.min(height, width - gap - slidersW));
    const x = (width - (size + gap + slidersW)) / 2;
    const y = (height - size) / 2;
    const length = size * SLIDER_LENGTH;
    tracks = inputs.map((_, i) => ({
      x: x + size + gap + i * (colW + spacing) + colW / 2,
      y0: y + (size - length) / 2,
      y1: y + (size + length) / 2,
    }));
    return { qr: { x, y, size }, r };
  }

  function draw() {
    const { qr, r } = layout();

    const px = Math.round(qr.size * dpr);
    if (qrCode && px > 0) {
      if (qrLayer.width !== px) qrLayer.width = qrLayer.height = px;
      qrCode.draw(qrCtx, 0, 0, px, 1);
      const x = Math.round(qr.x * dpr) / dpr;
      const y = Math.round(qr.y * dpr) / dpr;
      ctx.drawImage(qrLayer, x, y, px / dpr, px / dpr);
    }

    const fg = css("--fg");
    const border = css("--border");
    tracks.forEach((t, i) => {
      const v = valueOf(i);
      const thumbY = t.y0 + (t.y1 - t.y0) * v;

      // track: filled from the top down to the thumb
      ctx.lineCap = "round";
      ctx.lineWidth = TRACK_W;
      ctx.beginPath();
      ctx.moveTo(t.x, t.y0);
      ctx.lineTo(t.x, t.y1);
      ctx.strokeStyle = border;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(t.x, t.y0);
      ctx.lineTo(t.x, thumbY);
      ctx.strokeStyle = fg;
      ctx.stroke();

      // thumb, in its colour's current shade
      const big = hover === i || dragging === i;
      ctx.beginPath();
      ctx.arc(t.x, thumbY, (big ? 1.15 : 1) * THUMB_R * r, 0, Math.PI * 2);
      ctx.fillStyle = colourAt(inputs[i].dataset.colour, v);
      ctx.fill();
      ctx.lineWidth = THUMB_STROKE;
      ctx.strokeStyle = fg;
      ctx.stroke();
      if (focus === i) {
        ctx.beginPath();
        ctx.arc(t.x, thumbY, THUMB_R * r + 4, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = css("--accent");
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

  // ---- the sliders: each range input is the value; its drawn slider sets it
  const local = (e) => {
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };
  // the slider whose column is under the pointer, or -1
  const sliderAt = (e) => {
    const [x, y] = local(e);
    const r = rem();
    const reachX = Math.max(SLIDER_W * r, THUMB_R * r * 2) / 2 + (SLIDER_SPACING * r) / 2;
    const reachY = THUMB_R * r;
    return tracks.findIndex(
      (t) =>
        Math.abs(x - t.x) <= reachX &&
        y >= Math.min(t.y0, t.y1) - reachY &&
        y <= Math.max(t.y0, t.y1) + reachY,
    );
  };
  const setFrom = (i, e) => {
    const [, y] = local(e);
    const t = tracks[i];
    const v = Math.min(Math.max((y - t.y0) / (t.y1 - t.y0), 0), 1);
    inputs[i].value = String(Math.round(v * 100));
    inputs[i].dispatchEvent(new Event("input", { bubbles: true }));
  };

  const onInput = () => {
    if (qrCode) recolour(qrCode, values());
    invalidate();
  };
  const onPointerDown = (e) => {
    const i = sliderAt(e);
    if (i < 0) return;
    dragging = i;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
    setFrom(i, e);
  };
  const onPointerMove = (e) => {
    if (dragging >= 0) return setFrom(dragging, e);
    const i = sliderAt(e);
    if (i === hover) return;
    hover = i;
    canvas.style.cursor = i >= 0 ? "pointer" : "";
    invalidate();
  };
  const onPointerUp = (e) => {
    if (dragging < 0) return;
    dragging = -1;
    canvas.releasePointerCapture(e.pointerId);
    hover = sliderAt(e);
    canvas.style.cursor = hover >= 0 ? "pointer" : "";
    invalidate();
  };
  const onPointerLeave = () => {
    if (dragging >= 0 || hover < 0) return;
    hover = -1;
    canvas.style.cursor = "";
    invalidate();
  };
  const onFocus = (e) => {
    focus = e.type === "focusin" ? inputs.indexOf(e.target) : -1;
    invalidate();
  };
  // the sliders run downwards, so the down arrow moves the thumb down
  // (raises the value) — a range input's own arrows run the other way
  const onKeyDown = (e) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    const input = e.target;
    if (!step || !inputs.includes(input)) return;
    e.preventDefault();
    input.value = String(Math.min(Math.max(Number(input.value) + step, 0), 100));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  inputs.forEach((input) => input.addEventListener("input", onInput));
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("focusin", onFocus);
  canvas.addEventListener("focusout", onFocus);
  canvas.addEventListener("keydown", onKeyDown);
  // colours come from CSS tokens
  const scheme = matchMedia("(prefers-color-scheme: dark)");
  scheme.addEventListener("change", invalidate);

  return () => {
    cancelAnimationFrame(raf);
    resizer.disconnect();
    scheme.removeEventListener("change", invalidate);
    inputs.forEach((input) => input.removeEventListener("input", onInput));
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    canvas.removeEventListener("focusin", onFocus);
    canvas.removeEventListener("focusout", onFocus);
    canvas.removeEventListener("keydown", onKeyDown);
    width = height = 0;
  };
}
