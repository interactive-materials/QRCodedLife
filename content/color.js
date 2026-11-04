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

   The canvas draws the QOLORFUL QR code with a vertical slider to its
   right: at the top everything shows in colour, and dragging down fades
   the whole site — the obelisk, the HUD, this modal and its QR — to
   greys by halfway, with a CSS grayscale() filter (see
   assets/js/obelisk/greyscale.js); from there to the bottom only the QR
   goes on, each module from its grey to the black or white it stands for. The level stays where it's left: after
   the modal closes, on other pages and over a reload.

   The QR is drawn module by module from the grid in QOLORful.svg (see
   readColourQr() below, assets/js/obelisk/qolorful-qr.js and
   assets/js/obelisk/qr-code.js). The obelisk's QOLORFUL panel draws the
   same grid in the same colours, so it follows the slider too.
   ========================================================================== */

import { QrCode } from "../assets/js/obelisk/qr-code.js";
import { getGreyscale, setGreyscale, binarisation } from "../assets/js/obelisk/greyscale.js";
import {
  QR_SRC,
  DARK_COLOURS,
  readColourGrid,
  binarisedColour,
} from "../assets/js/obelisk/qolorful-qr.js";

const copy = {
  title: "Qolorful",
  stageLabel: "The QOLORFUL QR code, in colour",
  sliderLabel: "From colour to black and white",
  caption: "Can you see\nthe QR code?",
  body: [
    "QR code is scannable and processed by computer, different with how we process images with our eyes",
    "QOLORFUL showed this difference by turning QR code into a colourful patchwork that appear differently from usual two-color QR code",
    // "[Placeholder: camera image processing — copy to come.]",
  ],
};

/* ---- QR code ------------------------------------------------------------
   QOLORful.svg (see qolorful-qr.js): magenta and blue modules stand for
   black, pink and yellow for white. In black and white it is a negative
   QR — its position markers are white rings on black — framed by a black
   ring (the magenta / blue ring just inside the white margin). Each
   module is drawn in its own colour — set from the colour itself, not
   module.dark: QrCode counts the whole quiet zone light, but here part of
   it is the black ring.
   ------------------------------------------------------------------------ */
async function readColourQr(url) {
  const { colours, total } = await readColourGrid(url);
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
  for (const m of qr.modules) {
    const colour = colours[m.row + quiet][m.col + quiet];
    m.style = { dark: colour, light: colour };
    m.colour = colour;
  }
  return qr;
}

/* ---- black and white ----------------------------------------------------
   Binarised by b (0..1), each module as binarisedColour() has it. At 0
   the modules keep their own colours, for the site's filter to grey.
   ------------------------------------------------------------------------ */
function binarise(qr, b) {
  for (const m of qr.modules) {
    const colour = binarisedColour(m.colour, b);
    m.style = { dark: colour, light: colour };
  }
}

// read once, when this module loads; without it the canvas shows only
// the slider
const qrCode = await readColourQr(QR_SRC).catch((err) => {
  console.warn("color: could not read the QR code", err);
  return null;
});

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
            <p>${copy.caption}</p>
            <label>${copy.sliderLabel}
              <input type="range" min="0" max="100" value="${Math.round(getGreyscale() * 100)}" data-slider />
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

/* ---- canvas -------------------------------------------------------------
   Layout, in CSS px. The canvas splits into two sections: the QR's, the
   left QR_SECTION of its width, and the slider's, the rest. The QR is a
   square as big as fits in its section with QR_MARGIN all round, at its
   left — as in handdrawn.js, tiles-qr.js and angle.js, so every modal's
   QR is the same size in the same place. The panel is laid out as
   tiles-qr.js's: a stack of the caption (wrapped to the panel's width,
   in the bold small text of tiles-qr.js's heading) and, PANEL_GAP under
   it, the slider, centred across the stack; the stack is centred across
   the panel (the QR's section to QR_MARGIN short of the canvas's right)
   and down the canvas. The slider is a vertical track SLIDER_LENGTH
   of the QR's height (or less, to fit); its value runs down: colour at
   the top, black and white at the bottom.
   ------------------------------------------------------------------------ */
const QR_SECTION = 0.6; // the QR's section, as a share of the canvas's width
const QR_MARGIN = 0.75; // round the QR, inside its section (rem)
const SLIDER_LENGTH = 0.6; // the track's length, as a share of the QR's height
const THUMB_R = 0.5; // thumb radius (rem)
const TRACK_W = 4; // px
const THUMB_STROKE = 1.5; // px
const PANEL_GAP = 0.75; // the caption to the slider's thumb (rem)
const FONT_SIZE = 0.8125; // rem
const LINE_HEIGHT = 1.4; // a caption line, as a multiple of the font size

export function mount(root) {
  const canvas = root.querySelector(".modal__canvas");
  const input = canvas && canvas.querySelector("input[data-slider]");
  if (!canvas || !input) return null;
  const ctx = canvas.getContext("2d");
  // dragging the slider on a touch screen mustn't pan or zoom instead
  canvas.style.touchAction = "none";
  // the QR drawn once per size and binarisation (the filter greys it)
  const qrLayer = document.createElement("canvas");
  const qrCtx = qrLayer.getContext("2d");
  let qrLayerKey = "";

  let width = 0;
  let height = 0;
  let dpr = 1;
  let raf = 0;
  let hover = false; // pointer over the slider
  let focus = false; // the range input has keyboard focus
  let dragging = false;
  let track = null; // { x, y0, y1, w }, CSS px; y0 = value 0 (top)
  const value = () => Number(input.value) / 100;

  const css = (name) => getComputedStyle(canvas).getPropertyValue(name).trim();
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize);
  const font = (r) => `700 ${FONT_SIZE * r}px ${css("--font") || "sans-serif"}`;

  // text in lines no wider than maxW, broken at spaces, and always at a
  // line break ("\n") in the text
  function wrap(text, maxW) {
    const lines = [];
    for (const part of text.split("\n")) {
      let line = "";
      for (const word of part.split(" ")) {
        const next = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(next).width > maxW) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      lines.push(line);
    }
    return lines;
  }

  function layout() {
    const r = rem();
    const colW = 2 * THUMB_R * r;
    const section = width * QR_SECTION;
    const margin = QR_MARGIN * r;
    const size = Math.max(0, Math.min(height, section) - 2 * margin);
    const x = margin;
    const y = (height - size) / 2;
    const thumbR = THUMB_R * r;

    // the panel: from the QR's section to QR_MARGIN short of the right
    ctx.font = font(r);
    const room = Math.max(0, width - section - margin);
    const gap = PANEL_GAP * r;
    const lineH = FONT_SIZE * LINE_HEIGHT * r;
    const lines = room > 0 ? wrap(copy.caption, room) : [];
    const captionW = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
    const captionH = lines.length * lineH;
    // the slider's column: the thumb, its stroke straddling the radius
    const sliderW = 2 * thumbR + THUMB_STROKE;
    const stackW = Math.min(room, Math.max(captionW, sliderW));
    // the track, its thumb's reach past each end included, fits under the
    // caption
    const length = Math.max(
      0,
      Math.min(size * SLIDER_LENGTH, height - captionH - gap - 2 * thumbR - THUMB_STROKE),
    );
    const stackH = captionH + gap + 2 * thumbR + length;
    const top = (height - stackH) / 2;
    // centred across the panel, as tiles-qr.js's stack, which its heading
    // spreads across the whole panel
    const left = section + (room - stackW) / 2;

    // its lines centred across the stack, over the slider
    const caption = lines.map((text, i) => ({ text, x: left + stackW / 2, y: top + (i + 0.5) * lineH }));
    const y0 = top + captionH + gap + thumbR;
    track = {
      x: left + stackW / 2,
      y0,
      y1: y0 + length,
      w: colW,
    };
    return { qr: { x, y, size }, r, caption };
  }

  function draw() {
    const { qr, r, caption } = layout();

    const px = Math.round(qr.size * dpr);
    if (qrCode && px > 0) {
      const b = binarisation(value());
      const key = `${px} ${b}`;
      if (qrLayerKey !== key) {
        qrLayerKey = key;
        if (qrLayer.width !== px) qrLayer.width = qrLayer.height = px;
        else qrCtx.clearRect(0, 0, px, px);
        binarise(qrCode, b);
        qrCode.draw(qrCtx, 0, 0, px, 1);
      }
      const x = Math.round(qr.x * dpr) / dpr;
      const y = Math.round(qr.y * dpr) / dpr;
      ctx.drawImage(qrLayer, x, y, px / dpr, px / dpr);
    }

    const fg = css("--fg");

    ctx.fillStyle = fg;
    ctx.font = font(r);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const l of caption) ctx.fillText(l.text, l.x, l.y);

    const thumbY = track.y0 + (track.y1 - track.y0) * value();
    const thumbR = THUMB_R * r;

    // track: filled from the thumb down to the bottom, so all filled with
    // the thumb at the top (full colour)
    ctx.lineCap = "round";
    ctx.lineWidth = TRACK_W;
    ctx.beginPath();
    ctx.moveTo(track.x, track.y0);
    ctx.lineTo(track.x, track.y1);
    ctx.strokeStyle = css("--border");
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(track.x, thumbY);
    ctx.lineTo(track.x, track.y1);
    ctx.strokeStyle = fg;
    ctx.stroke();

    // thumb
    ctx.beginPath();
    ctx.arc(track.x, thumbY, (hover || dragging ? 1.15 : 1) * thumbR, 0, Math.PI * 2);
    ctx.fillStyle = css("--bg-elevated");
    ctx.fill();
    ctx.lineWidth = THUMB_STROKE;
    ctx.strokeStyle = fg;
    ctx.stroke();
    if (focus) {
      ctx.beginPath();
      ctx.arc(track.x, thumbY, thumbR + 4, 0, Math.PI * 2);
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
  // the web font may land after the first draw
  document.fonts?.ready.then(invalidate);

  // ---- the slider: the range input is the value; the drawn slider sets it
  const local = (e) => {
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };
  // the pointer is over the slider's column, from end to end of the track
  const onSlider = (e) => {
    if (!track) return false;
    const [x, y] = local(e);
    const reach = THUMB_R * rem();
    return (
      Math.abs(x - track.x) <= Math.max(track.w / 2, reach) &&
      y >= track.y0 - reach &&
      y <= track.y1 + reach
    );
  };
  const setFrom = (e) => {
    const [, y] = local(e);
    const v = Math.min(Math.max((y - track.y0) / (track.y1 - track.y0), 0), 1);
    input.value = String(Math.round(v * 100));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const onInput = () => {
    setGreyscale(value());
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
    hover = onSlider(e);
    canvas.style.cursor = hover ? "pointer" : "";
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
  // the slider runs downwards, so the down arrow moves the thumb down
  // (raises the value) — a range input's own arrows run the other way
  const onKeyDown = (e) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (!step || e.target !== input) return;
    e.preventDefault();
    input.value = String(Math.min(Math.max(Number(input.value) + step, 0), 100));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  input.addEventListener("input", onInput);
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
    input.removeEventListener("input", onInput);
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
