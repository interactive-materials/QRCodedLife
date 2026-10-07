/* ==========================================================================
   tiles.js — the modal for /tiles/: its copy, layout and canvas, all in
   this file, in the same shape as content/color.js.

   Default-exports render({ titleId }), which returns the modal's HTML:
   the header row (no subtitle on an artwork's modal, just the close
   button's row), the interactive top 40% (a <canvas>), the rule, then the
   title and copy. Then mount(contentEl) runs the canvas; modal.js calls it
   once the HTML is in place, and calls the function it returns when the
   modal closes or changes. The close button stays outside, in each page's
   HTML.

   The canvas is a pattern maker: a 3 x 3 grid where the QR sits in the
   other artwork modals, and to its right a heading, the tile (tile.svg)
   and a Remove all button. Dragging the tile onto a square places a copy
   there; dragging a placed tile moves it, or, dropped off the grid,
   removes it. The floor under the obelisk repeats the grid — one floor
   cell per square — as it changes (see assets/js/obelisk/floor-pattern.js).
   ========================================================================== */

import {
  PATTERN_SIZE,
  getPattern,
  setPattern,
  onPatternChange,
} from "../assets/js/obelisk/floor-pattern.js";

const TILE_SRC = new URL("../tiles/assets/tile.svg", import.meta.url).href;

const copy = {
  title: "Tiled patterns",
  stageLabel: "A 3 by 3 grid to tile; the floor repeats its pattern",
  heading: "Make your own pattern:",
  removeAll: "Remove all",
  body: [
    "QR code is usually seen as a functional graphic with its trademark black and white squares placed prominently around cashiers and dining tables.",
    "Coded Nyonya recompose scannable QR code into colourful tiles which blend into the background.",
    "Talk about the design of a QR code. (The marking square)",
  ],
};

/* ---- tile ---------------------------------------------------------------
   tile.svg is detailed (about 1MB), so it's decoded once, when this
   module loads, and drawn through tileAt(), which keeps a bitmap per
   size. Without it the grid and the panel draw empty squares.
   ------------------------------------------------------------------------ */
async function loadImage(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

const tileImage = await loadImage(TILE_SRC).catch((err) => {
  console.warn("tiles: could not load the tile", err);
  return null;
});

const tileBitmaps = new Map(); // device px -> canvas
function tileAt(px) {
  if (!tileImage || px < 1) return null;
  if (!tileBitmaps.has(px)) {
    if (tileBitmaps.size > 4) tileBitmaps.clear(); // sizes from old layouts
    const bitmap = document.createElement("canvas");
    bitmap.width = bitmap.height = px;
    bitmap.getContext("2d").drawImage(tileImage, 0, 0, px, px);
    tileBitmaps.set(px, bitmap);
  }
  return tileBitmaps.get(px);
}

/* ---- HTML ---------------------------------------------------------------
   titleId lets the <dialog>'s aria-labelledby point at the heading. The
   buttons inside the <canvas> are its fallback content: never drawn, but
   focusable and read by screen readers. A square's button places or
   removes its tile (Enter / Space); the drawn Remove all clicks its
   button.
   ------------------------------------------------------------------------ */
const cellName = (i) =>
  `Row ${Math.floor(i / PATTERN_SIZE) + 1}, column ${(i % PATTERN_SIZE) + 1}`;

export default function render({ titleId }) {
  const pattern = getPattern();
  return `
    <div class="modal__layout">
      <div class="modal__top">
        <header class="modal__header"></header>
        <div class="modal__stage">
          <canvas class="modal__canvas">
            <p>${copy.stageLabel}</p>
            <p>${copy.heading}</p>
            ${pattern
              .map(
                (filled, i) => `
            <button type="button" data-cell="${i}" aria-pressed="${filled}">${cellName(i)}: tile</button>`,
              )
              .join("")}
            <button type="button" data-remove-all>${copy.removeAll}</button>
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
   Layout, in CSS px. The canvas splits into two sections, as in color.js
   and handdrawn.js: the grid's, the left QR_SECTION of its width, and the
   panel's, the rest. The grid is a square centred in its section, as big
   as fits with QR_MARGIN all round — the same size and place as the QR in
   the other two. In the panel: the heading (wrapped to the panel's
   width) where it would top a stack of it, the tile and the button,
   PANEL_GAP apart and centred in the panel; the Remove all button,
   centred across the panel, its bottom level with the grid's; and the
   tile (a grid square's size, or less to fit), centred across the panel
   and between the two, at least PANEL_GAP from each.
   ------------------------------------------------------------------------ */
const QR_SECTION = 0.6; // the grid's section, as a share of the canvas's width
const QR_MARGIN = 0.75; // round the grid, inside its section (rem)
const FONT_SIZE = 0.8125; // rem
const LINE_HEIGHT = 1.4; // a heading line, as a multiple of the font size
const PANEL_GAP = 0.75; // between the heading, the tile and the button (rem)
const BUTTON_H = 2; // rem
const BUTTON_PAD = 0.875; // the button's text to its sides (rem)
const DRAG_ALPHA = 0.85; // the tile following the pointer

export function mount(root) {
  const canvas = root.querySelector(".modal__canvas");
  const cellButtons = canvas ? [...canvas.querySelectorAll("button[data-cell]")] : [];
  const removeButton = canvas && canvas.querySelector("button[data-remove-all]");
  if (!canvas || cellButtons.length !== PATTERN_SIZE ** 2 || !removeButton) return null;
  const ctx = canvas.getContext("2d");
  // dragging a tile on a touch screen mustn't pan or zoom instead
  canvas.style.touchAction = "none";

  let width = 0;
  let height = 0;
  let dpr = 1;
  let raf = 0;
  let pattern = getPattern();
  let grid = { x: 0, y: 0, size: 0, cell: 0 };
  let source = { x: 0, y: 0, size: 0 }; // the tile to drag from
  let button = { x: 0, y: 0, w: 0, h: 0 };
  let headingLines = []; // [{ text, x, y }]
  let fontPx = 0;
  // the drag under way: { from: "source" | cell index, x, y } (pointer, CSS px)
  let drag = null;
  let hover = null; // what the pointer is over: "source", "button", a cell index
  let focus = null; // the focused fallback button: "button", a cell index

  const css = (name) => getComputedStyle(canvas).getPropertyValue(name).trim();
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize);
  const font = (weight = 400) => `${weight} ${fontPx}px ${css("--font") || "sans-serif"}`;

  // text in lines no wider than maxW, broken at spaces
  function wrap(text, maxW) {
    const lines = [];
    let line = "";
    for (const word of text.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxW) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }

  function layout() {
    const r = rem();
    fontPx = FONT_SIZE * r;

    const section = width * QR_SECTION;
    const size = Math.max(0, Math.min(height, section) - 2 * QR_MARGIN * r);
    grid = { x: (section - size) / 2, y: (height - size) / 2, size, cell: size / PATTERN_SIZE };

    // the panel: x centres a width in it
    const room = Math.max(0, width - section);
    const centred = (w) => section + (room - w) / 2;
    const gap = PANEL_GAP * r;
    const lineH = fontPx * LINE_HEIGHT;

    ctx.font = font(700);
    const lines = wrap(copy.heading, room);
    const headingW = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
    ctx.font = font();
    const buttonW = ctx.measureText(copy.removeAll).width + 2 * BUTTON_PAD * r;
    const buttonH = BUTTON_H * r;

    // the heading: atop a stack of it, the tile and the button, the stack
    // centred in the panel and the heading at its left
    const headingH = lines.length * lineH;
    const stackTile = Math.max(0, Math.min(grid.cell, room, height - headingH - buttonH - 2 * gap));
    const stackW = Math.min(room, Math.max(headingW, stackTile, buttonW));
    const stackH = headingH + gap + stackTile + gap + buttonH;
    const headingY = (height - stackH) / 2;
    headingLines = lines.map((text, i) => ({
      text,
      x: centred(stackW),
      y: headingY + (i + 0.5) * lineH,
    }));

    // the button, its bottom on the grid's
    button = { x: centred(buttonW), y: grid.y + grid.size - buttonH, w: buttonW, h: buttonH };

    // the tile, between them
    const top = headingY + headingH + gap;
    const bottom = button.y - gap;
    const tileSize = Math.max(0, Math.min(grid.cell, room, bottom - top));
    source = { x: centred(tileSize), y: (top + bottom - tileSize) / 2, size: tileSize };
  }

  const cellRect = (i) => ({
    x: grid.x + (i % PATTERN_SIZE) * grid.cell,
    y: grid.y + Math.floor(i / PATTERN_SIZE) * grid.cell,
    size: grid.cell,
  });

  // the tile at x, y, size across
  function drawTile(x, y, size, alpha = 1) {
    const bitmap = tileAt(Math.round(size * dpr));
    if (!bitmap) return;
    ctx.globalAlpha = alpha;
    ctx.drawImage(bitmap, x, y, size, size);
    ctx.globalAlpha = 1;
  }

  function strokeRect(x, y, w, h, colour, lineWidth = 1) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = colour;
    ctx.strokeRect(x + lineWidth / 2, y + lineWidth / 2, w - lineWidth, h - lineWidth);
  }

  function draw() {
    layout();
    const fg = css("--fg");
    const border = css("--border");
    const accent = css("--accent");

    // the grid: placed tiles, then the lines between the squares
    if (grid.size > 0) {
      ctx.fillStyle = css("--bg");
      ctx.fillRect(grid.x, grid.y, grid.size, grid.size);
      pattern.forEach((filled, i) => {
        // a tile being moved shows only where it's dragged
        if (filled && drag?.from !== i) {
          const c = cellRect(i);
          drawTile(c.x, c.y, c.size);
        }
      });
      ctx.lineWidth = 1;
      ctx.strokeStyle = border;
      ctx.beginPath();
      for (let k = 0; k <= PATTERN_SIZE; k++) {
        const at = Math.round(k * grid.cell) + 0.5;
        ctx.moveTo(grid.x + at, grid.y);
        ctx.lineTo(grid.x + at, grid.y + grid.size);
        ctx.moveTo(grid.x, grid.y + at);
        ctx.lineTo(grid.x + grid.size, grid.y + at);
      }
      ctx.stroke();
      // the square a dragged tile would land on, or the focused one
      for (const i of [drag && hover, focus]) {
        if (typeof i !== "number") continue;
        const c = cellRect(i);
        strokeRect(c.x, c.y, c.size, c.size, accent, 2);
      }
    }

    // the panel: heading, tile, button
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = fg;
    ctx.font = font(700);
    for (const l of headingLines) ctx.fillText(l.text, l.x, l.y);

    if (source.size > 0) {
      drawTile(source.x, source.y, source.size);
      strokeRect(source.x, source.y, source.size, source.size, hover === "source" ? fg : border);
    }

    const empty = !pattern.some(Boolean);
    ctx.beginPath();
    ctx.roundRect(button.x + 0.5, button.y + 0.5, button.w - 1, button.h - 1, button.h / 2);
    ctx.fillStyle = hover === "button" && !empty ? css("--bg") : css("--bg-elevated");
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = empty ? border : fg;
    ctx.stroke();
    ctx.font = font(500);
    ctx.fillStyle = empty ? css("--fg-muted") : fg;
    ctx.textAlign = "center";
    ctx.fillText(copy.removeAll, button.x + button.w / 2, button.y + button.h / 2);
    if (focus === "button") {
      ctx.beginPath();
      ctx.roundRect(button.x - 3, button.y - 3, button.w + 6, button.h + 6, button.h / 2 + 3);
      ctx.lineWidth = 2;
      ctx.strokeStyle = accent;
      ctx.stroke();
    }

    // the dragged tile, a grid square's size, centred on the pointer
    if (drag) {
      const size = grid.cell;
      drawTile(drag.x - size / 2, drag.y - size / 2, size, DRAG_ALPHA);
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

  // ---- the pattern: set here with setPattern(), kept by floor-pattern.js,
  // which the floor follows; the buttons mirror it
  const unsubscribe = onPatternChange((next) => {
    pattern = next;
    pattern.forEach((filled, i) => cellButtons[i].setAttribute("aria-pressed", String(filled)));
    invalidate();
  });

  // ---- dragging
  const local = (e) => {
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };
  const inside = (x, y, rx, ry, w, h) => x >= rx && x <= rx + w && y >= ry && y <= ry + h;
  // what's under the pointer: "source", "button", a cell index, or null
  function hitAt(e) {
    const [x, y] = local(e);
    if (source.size > 0 && inside(x, y, source.x, source.y, source.size, source.size))
      return "source";
    if (inside(x, y, button.x, button.y, button.w, button.h)) return "button";
    if (grid.size > 0 && inside(x, y, grid.x, grid.y, grid.size, grid.size)) {
      const col = Math.min(PATTERN_SIZE - 1, Math.floor((x - grid.x) / grid.cell));
      const row = Math.min(PATTERN_SIZE - 1, Math.floor((y - grid.y) / grid.cell));
      return row * PATTERN_SIZE + col;
    }
    return null;
  }
  const canDrag = (hit) => hit === "source" || (typeof hit === "number" && pattern[hit]);

  function setCursor() {
    if (drag) canvas.style.cursor = "grabbing";
    else if (canDrag(hover)) canvas.style.cursor = "grab";
    else if (hover === "button" && pattern.some(Boolean)) canvas.style.cursor = "pointer";
    else canvas.style.cursor = "";
  }

  const onPointerDown = (e) => {
    const hit = hitAt(e);
    hover = hit;
    if (!canDrag(hit)) return;
    const [x, y] = local(e);
    drag = { from: hit, x, y };
    canvas.setPointerCapture(e.pointerId);
    setCursor();
    invalidate();
  };
  const onPointerMove = (e) => {
    const hit = hitAt(e);
    if (drag) [drag.x, drag.y] = local(e);
    else if (hit === hover) return;
    hover = hit;
    setCursor();
    invalidate();
  };
  const onPointerUp = (e) => {
    const hit = hitAt(e);
    if (drag) {
      const next = [...pattern];
      // a placed tile leaves its square; dropped on a square, the tile
      // lands there; dropped elsewhere, a placed tile is gone
      if (typeof drag.from === "number") next[drag.from] = false;
      if (typeof hit === "number") next[hit] = true;
      drag = null;
      canvas.releasePointerCapture(e.pointerId);
      setPattern(next);
    } else if (hit === "button" && hover === "button") {
      removeButton.click();
    }
    hover = hit;
    setCursor();
    invalidate();
  };
  const onPointerCancel = () => {
    drag = null;
    hover = null;
    setCursor();
    invalidate();
  };
  const onPointerLeave = () => {
    if (drag || hover === null) return;
    hover = null;
    setCursor();
    invalidate();
  };

  const onClick = (e) => {
    if (e.target === removeButton) return setPattern(pattern.map(() => false));
    const i = cellButtons.indexOf(e.target);
    if (i < 0) return;
    const next = [...pattern];
    next[i] = !next[i];
    setPattern(next);
  };
  const onFocus = (e) => {
    const i = cellButtons.indexOf(e.target);
    focus =
      e.type !== "focusin" ? null : e.target === removeButton ? "button" : i >= 0 ? i : null;
    invalidate();
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("click", onClick);
  canvas.addEventListener("focusin", onFocus);
  canvas.addEventListener("focusout", onFocus);
  // colours come from CSS tokens
  const scheme = matchMedia("(prefers-color-scheme: dark)");
  scheme.addEventListener("change", invalidate);

  return () => {
    cancelAnimationFrame(raf);
    resizer.disconnect();
    unsubscribe();
    scheme.removeEventListener("change", invalidate);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerCancel);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    canvas.removeEventListener("click", onClick);
    canvas.removeEventListener("focusin", onFocus);
    canvas.removeEventListener("focusout", onFocus);
    width = height = 0;
  };
}
