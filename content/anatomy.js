/* ==========================================================================
   anatomy.js — the modal for /anatomy/: its copy, layout and canvas, all
   in this file.

   Default-exports render({ titleId }), which returns the modal's HTML:
   the subtitle, the interactive top 40% (a <canvas>, with a numbered
   marker per part), the rule, then the title, intro and parts. Then
   mount(contentEl) runs the canvas; modal.js calls it once the HTML is in
   place, and calls the function it returns when the modal closes or
   changes. The close button stays outside, in each page's HTML.

   The canvas draws the QR code with the numbered markers below it.
   Pressing a marker scrolls the copy to its part (data-scroll-to, handled
   in modal.js); pressing 1 or 2 also plays that part's animation.

   The QR is drawn module by module from a grid read off qr-anatomy.svg
   (see assets/js/obelisk/qr-code.js), so any part of it can be coloured
   on its own.
   ========================================================================== */

import { readQrCode } from "../assets/js/obelisk/qr-code.js";

const QR_SRC = new URL("../anatomy/assets/qr-anatomy.svg", import.meta.url).href;

const copy = {
  subtitle: "What is in a QR code?",
  title: "Anatomy of a QR code",
  stageLabel: "A QR code", // what the canvas shows, for screen readers
  intro:
    "The QR code we use everyday is made up of multiple parts that makes it easy for us to scan a QR code from any angle and any orientation.",
  parts: [
    {
      name: "Position Markers",
      text: "The three squares at the corners of a QR code helps the decoder tell the orientation of the QR code and whether it is mirrored.",
    },
    {
      name: "Timing Pattern",
      text: "The timing patterns are two lines of alternating dark and light modules that run between the three finder patterns. They help the decoder work out the module grid, how big one unit is and how many rows and columns there are, allowing the decoder to understand the QR code even if it is distorted.",
    },
    {
      name: "Quiet Zone",
      text: "The quiet zone is the light modules surrounding the QR code. It is needed for the QR code scanner to differentiate the QR code and the background, allowing the decoder to detect the QR code.",
    },
  ],
};

/* ---- HTML ---------------------------------------------------------------
   titleId lets the <dialog>'s aria-labelledby point at the heading. The
   buttons inside the <canvas> are its fallback content: never drawn, but
   focusable and read by screen readers; the canvas draws them as the
   numbered markers, and a press on a drawn marker clicks its button.
   ------------------------------------------------------------------------ */
export default function render({ titleId }) {
  const partId = (i) => `anatomy-part-${i + 1}`;
  return `
    <div class="modal__layout">
      <div class="modal__top">
        <header class="modal__header">
          <p class="modal__eyebrow">${copy.subtitle}</p>
        </header>
        <div class="modal__stage">
          <canvas class="modal__canvas">
            <p>${copy.stageLabel}</p>
            ${copy.parts
              .map(
                (part, i) =>
                  `<button type="button" data-marker="${i + 1}" data-scroll-to="${partId(i)}">${i + 1}. ${part.name}</button>`,
              )
              .join("")}
          </canvas>
        </div>
      </div>
      <hr class="modal__rule" />
      <div class="modal__text">
        <h2 class="modal__title" id="${titleId}">${copy.title}</h2>
        <div class="modal__body">
          <p>${copy.intro}</p>
          ${copy.parts
            .map(
              (part, i) => `
          <h3 class="modal__part" id="${partId(i)}">${part.name}</h3>
          <p>${part.text}</p>`,
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}

// read once, when this module loads; without it the canvas shows only
// the markers
const qrCode = await readQrCode(QR_SRC).catch((err) => {
  console.warn("anatomy: could not read the QR code", err);
  return null;
});

/* ---- canvas -------------------------------------------------------------
   Layout, in CSS px: the QR (a square, as big as fits) with the row of
   markers MARKER_GAP below it, the pair centred in the canvas.
   ------------------------------------------------------------------------ */
const BLUE = "#112777"; // the position markers' highlight
const RED = "#d62828"; // the timing pattern's highlight
const MARKER_D = 1.75; // marker diameter (rem)
const MARKER_GAP = 0.75; // between markers, and between the QR and them (rem)
const MARKER_STROKE = 1.5; // px

// The animations: pressing 1 plays ANIMATIONS[POSITION_ANIMATION],
// pressing 2 ANIMATIONS.distort. Each colours one group of modules
// (group, color) and is a list of phases ([name, ms]) with a pose
// function: given the phase, how far through it (0..1) and the QR's box
// ({ cx, cy, size }, plus the canvas's width), it returns how far the
// group is coloured (highlight, 0..1) and the copies of the QR to draw,
// each { x, y, size, angle, alpha, warp, grid, gridAlpha } (centre, CSS
// px; radians, clockwise; alpha optional, default 1; warp optional, see
// warpTo(); grid optional, how far its module grid has drawn, 0..1, see
// drawGrid(), shown at gridAlpha).
const POSITION_ANIMATION = "split"; // "split" | "turn"
const COLOUR_MS = 600;
const SCALE_MS = 700; // zooming out, and back in
const TURN_MS = 900; // one 90deg turn
const PAUSE_MS = 250; // the hold after each turn
const QUARTER = Math.PI / 2;

// "turn": fade to BLUE, shrink, four 90deg turns (back where it started),
// grow back, fade back. Shrunk to 1/sqrt(2), the turning square fits its
// own box at any angle, so it never covers the markers.
const TURN_SCALE = Math.SQRT1_2;
const turn = {
  group: "finder",
  color: BLUE,
  phases: [
    ["colourIn", COLOUR_MS],
    ["shrink", SCALE_MS],
    ["turns", (TURN_MS + PAUSE_MS) * 4],
    ["grow", SCALE_MS],
    ["colourOut", COLOUR_MS],
  ],
  pose(phase, p, qr) {
    let scale = 1;
    let angle = 0;
    if (phase === "shrink") scale = 1 + (TURN_SCALE - 1) * easeInOut(p);
    if (phase === "grow") scale = TURN_SCALE + (1 - TURN_SCALE) * easeInOut(p);
    if (phase === "turns") {
      scale = TURN_SCALE;
      angle = turnsDone(p, 4) * QUARTER;
    }
    return {
      highlight: highlighted(phase, p),
      copies: [{ x: qr.cx, y: qr.cy, size: qr.size * scale, angle }],
    };
  },
};

// "split": fade to BLUE; zoom out into the first of a row of four copies
// while the other three fade in beside it, turned 90, 180 and 270deg
// clockwise, so they need 90, 180 and 270deg anticlockwise to be upright
// again; a pause to take them in; the turned copies turn anticlockwise
// one by one, left to right, 90deg at a time, each until it is upright
// (one, two and three turns); the others fade away as the first zooms
// back in; fade back.
// The copies are sized by the canvas's width: each gets a quarter of it
// and is 1/sqrt(2) of that, so its diagonal fits the quarter and it can
// turn at its own size without overlapping its neighbours.
const SPLIT_HOLD_MS = 1500;
const SPLIT_TURNS_NEEDED = [0, 1, 2, 3]; // per copy, left to right
const SPLIT_TURNS = SPLIT_TURNS_NEEDED.reduce((sum, n) => sum + n, 0);
const split = {
  group: "finder",
  color: BLUE,
  phases: [
    ["colourIn", COLOUR_MS],
    ["out", SCALE_MS],
    ["hold", SPLIT_HOLD_MS],
    ["turns", (TURN_MS + PAUSE_MS) * SPLIT_TURNS],
    ["in", SCALE_MS],
    ["colourOut", COLOUR_MS],
  ],
  pose(phase, p, qr) {
    const pitch = Math.min(qr.width / 4, qr.size);
    const small = pitch * Math.SQRT1_2;
    const slotX = (k) => qr.cx + (k - 1.5) * pitch;
    // turns made so far, across all the copies in turn
    const turned = turnsDone(
      phase === "turns" ? p : phase === "in" || phase === "colourOut" ? 1 : 0,
      SPLIT_TURNS,
    );
    const e = easeInOut(p);
    const lerp = (a, b, t) => a + (b - a) * t;

    const copies = SPLIT_TURNS_NEEDED.map((needed, k) => {
      if (k === 0) {
        // the original: out to the first slot, and back in at the end
        const t = phase === "out" ? e : phase === "in" ? 1 - e : phase === "colourIn" || phase === "colourOut" ? 0 : 1;
        return { x: lerp(qr.cx, slotX(0), t), y: qr.cy, size: lerp(qr.size, small, t), angle: 0 };
      }
      // turned `needed` quarters clockwise, turning back until upright,
      // once the copies before it are done
      const before = SPLIT_TURNS_NEEDED.slice(0, k).reduce((sum, n) => sum + n, 0);
      const own = Math.min(Math.max(turned - before, 0), needed);
      const angle = (needed - own) * QUARTER;
      const alpha =
        phase === "out" ? e : phase === "in" ? 1 - e : phase === "colourIn" || phase === "colourOut" ? 0 : 1;
      return { x: slotX(k), y: qr.cy, size: small, angle, alpha };
    });
    // the original last, so it stays on top while it passes over the others
    return { highlight: highlighted(phase, p), copies: copies.reverse() };
  },
};

// "distort" (pressing 2): fade the timing pattern to RED; zoom out into
// the first of a row of four copies while the other three fade in beside
// it, seen in perspective: tilted to the right, bent forward (top towards
// the viewer) and bent backward (top away); a pause to take them in; on
// every copy, the module grid draws itself out from the timing pattern
// (see drawGrid()); a pause to take that in; the others fade away, and
// the grid with them, as the first zooms back in; fade back. The copies
// hold still for now.
const DISTORT_PAUSE_MS = 1000; // before the grid
const GRID_MS = 1800; // drawing the grid
const DISTORT_HOLD_MS = 3000; // after it
const DISTORT_ANGLE = 0.6; // radians, about 35deg
const DISTORT_SIZE = 0.8; // a copy's size, as a share of its quarter
const DISTORT_WARPS = [
  null,
  { yaw: DISTORT_ANGLE }, // tilted right: the right edge turned away
  { pitch: DISTORT_ANGLE }, // bent forward
  { pitch: -DISTORT_ANGLE }, // bent backward
];
const distort = {
  group: "timing",
  color: RED,
  phases: [
    ["colourIn", COLOUR_MS],
    ["out", SCALE_MS],
    ["pause", DISTORT_PAUSE_MS],
    ["grid", GRID_MS],
    ["hold", DISTORT_HOLD_MS],
    ["in", SCALE_MS],
    ["colourOut", COLOUR_MS],
  ],
  pose(phase, p, qr) {
    const pitch = Math.min(qr.width / 4, qr.size);
    const small = pitch * DISTORT_SIZE;
    // how far the grid has drawn (0..1), and how strongly it shows
    const grid = phase === "grid" ? p : phase === "hold" || phase === "in" ? 1 : 0;
    const gridAlpha = phase === "in" ? 1 - easeInOut(p) : 1;
    const slotX = (k) => qr.cx + (k - 1.5) * pitch;
    const e = easeInOut(p);
    const lerp = (a, b, t) => a + (b - a) * t;
    // 0 = the one QR in the middle, 1 = the row
    const out =
      phase === "out" ? e : phase === "in" ? 1 - e : phase === "colourIn" || phase === "colourOut" ? 0 : 1;

    const copies = DISTORT_WARPS.map((warp, k) => ({
      ...(k === 0
        ? { x: lerp(qr.cx, slotX(0), out), y: qr.cy, size: lerp(qr.size, small, out), angle: 0 }
        : { x: slotX(k), y: qr.cy, size: small, angle: 0, alpha: out, warp }),
      grid,
      gridAlpha,
    }));
    // the original last, so it stays on top while it passes over the others
    return { highlight: highlighted(phase, p), copies: copies.reverse() };
  },
};

const ANIMATIONS = { turn, split, distort };
const PLAYS = { 1: ANIMATIONS[POSITION_ANIMATION], 2: distort }; // marker -> animation

// The module grid, as found from the timing pattern: a line along each
// edge of the timing modules — the column boundaries along the timing row
// (row 6, columns 8 to n - 9), the row boundaries along the timing column
// (column 6, rows 8 to n - 9) — drawn through project(u, v) as for
// drawWarped(). As `progress` goes 0 -> 1 the lines grow out from the
// timing pattern to the symbol's edges: column lines up and down, row
// lines left and right. The timing pattern runs only between the position
// markers, so no line crosses one.
const GRID_COLOR = "#f5c518";
const GRID_WIDTH = 0.12; // line width, as a share of a module
function drawGrid(ctx, qr, project, unit, progress) {
  const t = easeInOut(clamp01(progress));
  if (t <= 0) return;
  const q = qr.quiet;
  const start = q; // the symbol's edges
  const end = q + qr.n;
  const from = q + 6.5; // the timing row's / column's centre line
  const near = from - (from - start) * t;
  const far = from + (end - from) * t;

  const path = new Path2D();
  // the timing modules' edges: boundaries 8 .. n - 8
  for (let i = q + 8; i <= q + qr.n - 8; i++) {
    path.moveTo(...project(i, near)); // a column boundary
    path.lineTo(...project(i, far));
    path.moveTo(...project(near, i)); // a row boundary
    path.lineTo(...project(far, i));
  }
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = Math.max(0.5, unit * GRID_WIDTH);
  ctx.lineCap = "butt";
  ctx.stroke(path);
}

// A copy's warp, { yaw, pitch } (radians): the QR turned about its
// vertical axis (yaw > 0: right edge away) then its horizontal one
// (pitch > 0: top towards the viewer), seen in perspective from
// WARP_FOCAL x its size away. Returns project(u, v) for drawWarped().
const WARP_FOCAL = 2.5;
function warpTo(c, modules, { yaw = 0, pitch = 0 }) {
  const f = WARP_FOCAL * c.size;
  return (u, v) => {
    let x = (u / modules - 0.5) * c.size;
    let y = (v / modules - 0.5) * c.size;
    let z = x * Math.sin(yaw);
    x *= Math.cos(yaw);
    z += y * Math.sin(pitch);
    y *= Math.cos(pitch);
    const s = f / (f + z);
    return [c.x + x * s, c.y + y * s];
  };
}

// the phase at t ms into an animation, and how far through it (0..1)
function phaseAt(phases, t) {
  for (const [name, ms] of phases) {
    if (t < ms) return [name, t / ms];
    t -= ms;
  }
  return ["done", 1];
}

// turns completed (with the current one eased) p of the way through
// `count` turn-and-pause steps
function turnsDone(p, count) {
  const step = TURN_MS + PAUSE_MS;
  const ms = p * step * count;
  const n = Math.min(Math.floor(ms / step), count);
  return n + easeInOut(clamp01((ms - n * step) / TURN_MS));
}

function highlighted(phase, p) {
  return phase === "colourIn" ? p : phase === "colourOut" ? 1 - p : 1;
}

const easeInOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (t) => Math.min(Math.max(t, 0), 1);

// "#rrggbb" a -> b at t
function mix(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",")})`;
}

export function mount(root) {
  const canvas = root.querySelector(".modal__canvas");
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  const buttons = [...canvas.querySelectorAll("[data-marker]")];
  // the QR is drawn here first, upright and at device pixels, then placed
  // (and turned) as one image, so a turn shows no seams between modules
  const qrLayer = document.createElement("canvas");
  const qrCtx = qrLayer.getContext("2d");

  let width = 0;
  let height = 0;
  let dpr = 1;
  let raf = 0;
  let hover = null; // marker under the pointer
  let focus = null; // marker whose button has keyboard focus
  let playing = null; // { anim, start } while an animation plays
  let markers = []; // [{ id, x, y, r }], CSS px, from the last layout
  const clearHighlights = () =>
    Object.values(ANIMATIONS).forEach((anim) => qrCode?.clear(anim.group));
  clearHighlights();

  const css = (name) => getComputedStyle(canvas).getPropertyValue(name).trim();
  const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  function layout() {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const d = MARKER_D * rem;
    const gap = MARKER_GAP * rem;
    const size = Math.max(0, Math.min(width, height - gap - d));
    const top = (height - (size + gap + d)) / 2;
    const rowW = buttons.length * d + (buttons.length - 1) * gap;
    markers = buttons.map((b, i) => ({
      id: b.dataset.marker,
      x: (width - rowW) / 2 + d / 2 + i * (d + gap),
      y: top + size + gap + d / 2,
      r: d / 2,
    }));
    return { qr: { x: (width - size) / 2, y: top, size }, rem };
  }

  // returns true while animating
  function draw(now) {
    const { qr, rem } = layout();
    let busy = false;
    const box = { cx: qr.x + qr.size / 2, cy: qr.y + qr.size / 2, size: qr.size, width };
    let copies = null; // null: the QR at rest

    if (playing && qrCode) {
      const { anim, start } = playing;
      const [phase, p] = phaseAt(anim.phases, now - start);
      if (phase === "done") {
        playing = null;
        qrCode.clear(anim.group);
      } else {
        busy = true;
        const pose = anim.pose(phase, p, box);
        qrCode.paint(anim.group, { dark: mix(qrCode.colors.dark, anim.color, pose.highlight) });
        copies = pose.copies;
      }
    }

    const px = Math.round(qr.size * dpr);
    if (qrCode && px > 0) {
      if (qrLayer.width !== px) qrLayer.width = qrLayer.height = px;
      qrCode.draw(qrCtx, 0, 0, px, 1);

      if (!copies) {
        // at rest: on device pixels
        const x = Math.round(qr.x * dpr) / dpr;
        const y = Math.round(qr.y * dpr) / dpr;
        ctx.drawImage(qrLayer, x, y, px / dpr, px / dpr);
      } else {
        for (const c of copies) {
          if (c.alpha === 0) continue;
          ctx.save();
          ctx.globalAlpha = c.alpha ?? 1;
          if (c.warp) {
            qrCode.drawWarped(ctx, warpTo(c, qrCode.size, c.warp));
          } else {
            ctx.translate(c.x, c.y);
            ctx.rotate(c.angle);
            ctx.drawImage(qrLayer, -c.size / 2, -c.size / 2, c.size, c.size);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          }
          if (c.grid) {
            ctx.globalAlpha = (c.alpha ?? 1) * (c.gridAlpha ?? 1);
            drawGrid(ctx, qrCode, warpTo(c, qrCode.size, c.warp || {}), c.size / qrCode.size, c.grid);
          }
          ctx.restore();
        }
      }
    }

    const fg = css("--fg");
    ctx.font = `600 ${0.85 * rem}px ${getComputedStyle(canvas).fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const m of markers) {
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r - MARKER_STROKE / 2, 0, Math.PI * 2);
      if (m.id === hover) {
        ctx.fillStyle = css("--border");
        ctx.fill();
      }
      ctx.lineWidth = MARKER_STROKE;
      ctx.strokeStyle = fg;
      ctx.stroke();
      ctx.fillStyle = fg;
      ctx.fillText(m.id, m.x, m.y + 0.5);
      if (m.id === focus) {
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r + 3, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = css("--accent");
        ctx.stroke();
      }
    }
    return busy;
  }

  function frame(now) {
    raf = 0;
    if (!width || !height) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (draw(now)) invalidate();
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
    frame(performance.now());
  });
  resizer.observe(canvas);

  const markerAt = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const m = markers.find((m) => Math.hypot(x - m.x, y - m.y) <= m.r + 4);
    return m ? m.id : null;
  };

  const onPointerMove = (e) => {
    const id = markerAt(e);
    if (id === hover) return;
    hover = id;
    canvas.style.cursor = id ? "pointer" : "";
    invalidate();
  };
  const onPointerLeave = () => {
    if (!hover) return;
    hover = null;
    canvas.style.cursor = "";
    invalidate();
  };
  // a press on a drawn marker clicks its button, so pointer, keyboard and
  // assistive tech all land in the button branch (and data-scroll-to works)
  const onClick = (e) => {
    if (e.target === canvas) {
      const id = markerAt(e);
      buttons.find((b) => b.dataset.marker === id)?.click();
      return;
    }
    const button = e.target.closest("[data-marker]");
    const anim = button && PLAYS[button.dataset.marker];
    if (anim && qrCode && !reducedMotion()) {
      clearHighlights();
      playing = { anim, start: performance.now() };
      invalidate();
    }
  };
  const onFocus = (e) => {
    focus = e.type === "focusin" ? (e.target.dataset.marker ?? null) : null;
    invalidate();
  };

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("click", onClick);
  canvas.addEventListener("focusin", onFocus);
  canvas.addEventListener("focusout", onFocus);
  // colours come from CSS tokens, the numbers from the web font
  const scheme = matchMedia("(prefers-color-scheme: dark)");
  scheme.addEventListener("change", invalidate);
  document.fonts?.ready.then(invalidate);

  return () => {
    cancelAnimationFrame(raf);
    resizer.disconnect();
    scheme.removeEventListener("change", invalidate);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    canvas.removeEventListener("click", onClick);
    canvas.removeEventListener("focusin", onFocus);
    canvas.removeEventListener("focusout", onFocus);
    clearHighlights();
    width = height = 0; // a pending fonts.ready redraw does nothing
  };
}
