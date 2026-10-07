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

   The canvas draws the QOLORFUL QR code with a slider below it: at the
   left end the QR shows its own colours, and towards the right end every
   module fades to the black or white it stands for.

   The QR is drawn module by module from the grid in QOLORful.svg (see
   readColourQr() below and assets/js/obelisk/qr-code.js).
   ========================================================================== */

import { QrCode } from "../assets/js/obelisk/qr-code.js";

const QR_SRC = new URL("../color/assets/QOLORful.svg", import.meta.url).href;

const copy = {
  title: "QOLORFUL",
  stageLabel: "The QOLORFUL QR code, in colour",
  sliderLabel: "From colour to black and white",
  body: [
    "QR code is scannable and processed by computer, different with how we process images with our eyes",
    "QOLORFUL showed this difference by turning QR code into a colourful patchwork that appear differently from usual two-color QR code",
    "[Placeholder: camera image processing — copy to come.]",
  ],
};

/* ---- HTML ---------------------------------------------------------------
   titleId lets the <dialog>'s aria-labelledby point at the heading. The
   range input inside the <canvas> is its fallback content: never drawn,
   but focusable (arrow keys move it) and read by screen readers; the
   canvas draws it as the slider, and dragging the drawn slider moves it.
   ------------------------------------------------------------------------ */
export default function render({ titleId }) {
  return `
    <div class="modal__layout">
      <div class="modal__top">
        <header class="modal__header"></header>
        <div class="modal__stage">
          <canvas class="modal__canvas">
            <p>${copy.stageLabel}</p>
            <label>${copy.sliderLabel}
              <input type="range" min="0" max="100" value="0" data-slider />
            </label>
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

/* ---- QR code ------------------------------------------------------------
   QOLORful.svg draws every module as its own <rect>, in one of four
   colours, inside a white margin: magenta and blue stand for black, pink
   and yellow for white (DARK_COLOURS). In black and white it is a negative
   QR — its position markers are white rings on black — framed by a black
   ring (the magenta / blue ring just inside the white margin). Each
   module keeps its colour in module.colour.
   ------------------------------------------------------------------------ */
const DARK_COLOURS = ["#ff00c8", "#0082ff"];

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
// the slider
const qrCode = await readColourQr(QR_SRC).catch((err) => {
  console.warn("color: could not read the QR code", err);
  return null;
});

// every module's colour at slider value t (0..1): its own colour at 0,
// the black or white it stands for at 1. Set from the colour itself, not
// module.dark: QrCode counts the whole quiet zone light, but here part of
// it is the black ring.
function colourAt(qr, t) {
  for (const m of qr.modules) {
    const bw = DARK_COLOURS.includes(m.colour) ? "#000000" : "#ffffff";
    const c = mix(m.colour, bw, t);
    m.style = { dark: c, light: c };
  }
}

// "#rrggbb" a -> b at t
function mix(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",")})`;
}

/* ---- canvas -------------------------------------------------------------
   Layout, in CSS px: the QR (a square, as big as fits) with the slider
   SLIDER_GAP below it, the pair centred in the canvas. The slider is a
   label at each end ("Colour", "B & W") with the track between them, as
   wide as the QR — or wider, up to the canvas's width, to keep the track
   at least TRACK_MIN long (on a phone the QR is narrow).
   ------------------------------------------------------------------------ */
const SLIDER_H = 1.75; // the slider row's height (rem)
const SLIDER_GAP = 0.75; // between the QR and the slider (rem)
const LABEL_GAP = 0.75; // between a label and the thumb at that end (rem)
const THUMB_R = 0.5; // thumb radius (rem)
const TRACK_H = 4; // px
const TRACK_MIN = 10; // the track's least length (rem)
const LABELS = ["Colour", "B & W"];

export function mount(root) {
  const canvas = root.querySelector(".modal__canvas");
  const input = canvas && canvas.querySelector("[data-slider]");
  if (!canvas || !input) return null;
  const ctx = canvas.getContext("2d");
  const qrLayer = document.createElement("canvas");
  const qrCtx = qrLayer.getContext("2d");

  let width = 0;
  let height = 0;
  let dpr = 1;
  let raf = 0;
  let hover = false; // pointer over the slider
  let focus = false; // the range input has keyboard focus
  let dragging = false;
  let track = null; // { x0, x1, y }, CSS px, from the last layout
  const value = () => Number(input.value) / 100;
  if (qrCode) colourAt(qrCode, value());

  const css = (name) => getComputedStyle(canvas).getPropertyValue(name).trim();

  function layout() {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const rowH = SLIDER_H * rem;
    const gap = SLIDER_GAP * rem;
    const size = Math.max(0, Math.min(width, height - gap - rowH));
    const top = (height - (size + gap + rowH)) / 2;
    const x = (width - size) / 2;

    ctx.font = `${0.75 * rem}px ${getComputedStyle(canvas).fontFamily}`;
    const labelW = LABELS.map((l) => ctx.measureText(l).width);
    // the track's ends sit a thumb's radius in, so the thumb never reaches
    // a label
    const inset = LABEL_GAP * rem + THUMB_R * rem;
    const ends = labelW[0] + labelW[1] + 2 * inset;
    const rowW = Math.min(width, Math.max(size, TRACK_MIN * rem + ends));
    const rowX = (width - rowW) / 2;
    track = {
      x0: rowX + labelW[0] + inset,
      x1: rowX + rowW - labelW[1] - inset,
      y: top + size + gap + rowH / 2,
      left: rowX, // the labels' outer edges
      right: rowX + rowW,
    };
    return { qr: { x, y: top, size }, rem };
  }

  function draw() {
    const { qr, rem } = layout();

    const px = Math.round(qr.size * dpr);
    if (qrCode && px > 0) {
      if (qrLayer.width !== px) qrLayer.width = qrLayer.height = px;
      qrCode.draw(qrCtx, 0, 0, px, 1);
      const x = Math.round(qr.x * dpr) / dpr;
      const y = Math.round(qr.y * dpr) / dpr;
      ctx.drawImage(qrLayer, x, y, px / dpr, px / dpr);
    }

    // labels
    const fg = css("--fg");
    ctx.fillStyle = css("--fg-muted");
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(LABELS[0], track.left, track.y);
    ctx.textAlign = "right";
    ctx.fillText(LABELS[1], track.right, track.y);

    // track: filled up to the thumb
    const thumbX = track.x0 + (track.x1 - track.x0) * value();
    ctx.lineCap = "round";
    ctx.lineWidth = TRACK_H;
    ctx.beginPath();
    ctx.moveTo(track.x0, track.y);
    ctx.lineTo(track.x1, track.y);
    ctx.strokeStyle = css("--border");
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(track.x0, track.y);
    ctx.lineTo(thumbX, track.y);
    ctx.strokeStyle = fg;
    ctx.stroke();

    // thumb
    const r = THUMB_R * rem;
    ctx.beginPath();
    ctx.arc(thumbX, track.y, hover || dragging ? r * 1.15 : r, 0, Math.PI * 2);
    ctx.fillStyle = fg;
    ctx.fill();
    if (focus) {
      ctx.beginPath();
      ctx.arc(thumbX, track.y, r + 4, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = css("--accent");
      ctx.stroke();
    }
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

  // ---- the slider: the range input is the value; the drawn slider sets it
  const local = (e) => {
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };
  const onSlider = (e) => {
    if (!track) return false;
    const [x, y] = local(e);
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const reach = Math.max(SLIDER_H * rem, THUMB_R * rem * 2) / 2;
    return x >= track.x0 - reach && x <= track.x1 + reach && Math.abs(y - track.y) <= reach;
  };
  const setFrom = (e) => {
    const [x] = local(e);
    const t = Math.min(Math.max((x - track.x0) / (track.x1 - track.x0), 0), 1);
    input.value = String(Math.round(t * 100));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const onInput = () => {
    if (qrCode) colourAt(qrCode, value());
    invalidate();
  };
  const onPointerDown = (e) => {
    if (!onSlider(e)) return;
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
    setFrom(e);
  };
  const onPointerMove = (e) => {
    if (dragging) return setFrom(e);
    const over = onSlider(e);
    if (over === hover) return;
    hover = over;
    canvas.style.cursor = over ? "pointer" : "";
    invalidate();
  };
  const onPointerUp = (e) => {
    if (!dragging) return;
    dragging = false;
    canvas.releasePointerCapture(e.pointerId);
    canvas.style.cursor = onSlider(e) ? "pointer" : "";
    invalidate();
  };
  const onPointerLeave = () => {
    if (dragging || !hover) return;
    hover = false;
    canvas.style.cursor = "";
    invalidate();
  };
  const onFocus = (e) => {
    focus = e.type === "focusin" && e.target === input;
    invalidate();
  };

  input.addEventListener("input", onInput);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("focusin", onFocus);
  canvas.addEventListener("focusout", onFocus);
  // colours come from CSS tokens, the labels from the web font
  const scheme = matchMedia("(prefers-color-scheme: dark)");
  scheme.addEventListener("change", invalidate);
  document.fonts?.ready.then(invalidate);

  return () => {
    cancelAnimationFrame(raf);
    resizer.disconnect();
    scheme.removeEventListener("change", invalidate);
    input.removeEventListener("input", onInput);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    canvas.removeEventListener("focusin", onFocus);
    canvas.removeEventListener("focusout", onFocus);
    width = height = 0; // a pending fonts.ready redraw does nothing
  };
}
