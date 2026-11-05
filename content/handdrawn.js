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
   itself isn't tappable — the words have to be found in the QR. A
   Reset button under the list, as tiles-qr.js's Remove all, clears the
   finds.

   A round button in the QR's bottom right corner, as the angle modal's,
   expands it: the stage takes the whole modal (the rule and the copy
   go), the QR fills its width and the list runs under it. The button,
   Escape, or the modal's × (or backdrop) shrinks it back; only then does
   the × close the modal.

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
  resetFound,
  onFoundChange,
} from "../assets/js/obelisk/qrossword.js";

const copy = {
  title: "Qrossword",
  stageLabel: "QROSSWORD, a hand-drawn QR code that is also a word search",
  listHeading: "Find the MRT stations!",
  expand: "Expand the word search",
  collapse: "Shrink the word search",
  reset: "Reset",
  body: [
    "QR code is often computer-generated and unreadable to humans.",
    "Qrossword replaces the black squares of QR code with handwritten letters, infusing the irregularity of handwriting while allowing readable messages to be encoded inside the QR code",
    // "[Placeholder: why the QR code is able to be handwritten, and examples that do not work — copy to come.]",
  ],
};

// read once, when this module loads; without it the canvas shows only
// the list
const qrossword = await loadQrossword().catch((err) => {
  console.warn("handdrawn: could not read the QR code", err);
  return null;
});

// the expand button's hand-drawn icons, to expand and (once expanded) to
// minimise: each on a dark, translucent rounded square, ICON_RADIUS of
// its side round the corners
const asset = (name) => {
  const image = new Image();
  image.src = new URL(`../handdrawn/assets/${name}`, import.meta.url).href;
  return image;
};
const expandIcon = asset("expand-icon.svg");
const minimiseIcon = asset("minimise-icon.svg");
const ICON_RADIUS = 2.73 / 24.05;

/* ---- HTML ---------------------------------------------------------------
   titleId lets the <dialog>'s aria-labelledby point at the heading. The
   list inside the <canvas> is its fallback content: never drawn, but read
   by screen readers; a found word's item says so. The buttons are the
   expand and Reset buttons' fallbacks: focusable, and clicked by the
   drawn ones.
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
            <button type="button" data-reset>${copy.reset}</button>
            <button type="button" data-expand aria-pressed="false" aria-label="${copy.expand}"></button>
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
   square as big as fits in its section with QR_MARGIN all round, at its
   left; the list sits at the canvas's right, QR_MARGIN in, so the two
   sides' margins match — as in color.js, tiles-qr.js and angle.js, so
   every modal's QR is the same size in the same place. Any room to
   spare goes between them. The list's heading runs across the canvas's
   top, centred, as the scam modal's question over its picture, and all
   the rest lays out under it. The list is the words running down in as
   many columns as fit the canvas's height under it, each as wide as its
   longest word; where it's wider than the room beside the QR (on a
   phone), its text shrinks to fit.

   Expanded, the canvas is the whole modal's width and most of its
   height: the QR is a square as wide as the canvas less QR_MARGIN each
   side, the list under it, LIST_GAP down, in as many columns as fit
   across and centred across, and the two centred down the canvas
   together; where they're
   taller than it, the QR shrinks to leave the list room.

   The Reset button, in the list's text, sits under the list's columns,
   centred across the list, beside the QR or under it alike; beside it,
   the columns are shortened to leave the button room.

   The expand button (expandIcon, or minimiseIcon while expanded) sits in
   the QR's bottom right corner, ICON_INSET in, ICON_SIZE across; both
   are shares of the QR's side, so it scales with the QR.
   ------------------------------------------------------------------------ */
const QR_SECTION = 0.6; // the QR's section, as a share of the canvas's width
const QR_MARGIN = 0.75; // round the QR, inside its section (rem)
const FONT_SIZE = 0.8125; // the list's text, at most (rem)
const LINE_HEIGHT = 1.6; // a row, as a multiple of the font size
const COLUMN_GAP = 1.25; // between list columns (em)
const LIST_GAP = 1; // expanded: the QR to the list under it (rem)
// the heading to what's under it, as the scam modal's question to its
// picture (0.5rem margin + 0.25rem gap); the QR's margin counts towards it
const HEADING_GAP = 0.75; // rem
// the list to Reset under it, as tiles-qr.js's PANEL_GAP over its
// Remove all
const RESET_GAP = 0.75; // rem
// the expand button, as a share of the QR's side: larger to expand the
// small QR, smaller to minimise the expanded one
const ICON_SIZE = { expand: 0.125, minimise: 0.08 };
const ICON_INSET = 0.04; // from the QR's edges, as a share of its side
// the Reset button, as the scam modal's (.scam__reset), in em of the
// heading's text (FONT_SIZE, never shrunk)
const BUTTON_H = 2.5; // em
const BUTTON_PAD = 1.1; // the button's text to its sides (em)

export function mount(root) {
  const canvas = root.querySelector(".modal__canvas");
  const items = canvas ? [...canvas.querySelectorAll("li[data-word]")] : [];
  const expandButton = canvas && canvas.querySelector("button[data-expand]");
  const resetButton = canvas && canvas.querySelector("button[data-reset]");
  const layoutEl = root.querySelector(".modal__layout");
  if (!canvas || !items.length || !expandButton || !resetButton || !layoutEl) return null;
  const ctx = canvas.getContext("2d");
  const dialog = root.closest("dialog");

  let width = 0;
  let height = 0;
  let dpr = 1;
  let raf = 0;
  let qr = { x: 0, y: 0, size: 0 };
  let heading = { x: 0, y: 0, px: 0, lines: [], lineH: 0 }; // the list's heading, CSS px
  let rows = []; // [{ x, y, h }] per word: its row in the list, CSS px
  let icon = { x: 0, y: 0, size: 0 }; // the expand button, CSS px
  let button = { x: 0, y: 0, w: 0, h: 0 }; // the Reset button, CSS px
  let found = getFound();
  let expanded = false;
  let hover = null; // what the pointer is over: "icon", "button" or null
  let focus = null; // the focused fallback button: "icon", "button" or null

  const css = (name) => getComputedStyle(canvas).getPropertyValue(name).trim();
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize);
  const font = (px, weight = 400) => `${weight} ${px}px ${css("--font") || "sans-serif"}`;

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

  // the list at font size px: its columns and overall size. Beside the
  // QR, a column runs down `avail` (the height it has); under it (given
  // the room across), there are as many columns as fit across
  function measureList(px, avail, across = 0) {
    const lineH = px * LINE_HEIGHT;
    ctx.font = font(px);
    const colW = Math.max(...WORDS.map(({ word }) => ctx.measureText(word).width));
    const colGap = COLUMN_GAP * px;
    // the most words a column can take: down the canvas's height beside
    // the QR, or enough for as many columns as fit across under it
    const most = across
      ? Math.ceil(WORDS.length / Math.max(1, Math.floor((across + colGap) / (colW + colGap))))
      : Math.max(1, Math.floor(avail / lineH));
    // then the words shared out as evenly as those columns allow (10 in
    // two columns: 5 and 5, not 8 and 2)
    const columns = Math.ceil(WORDS.length / most);
    const perColumn = Math.ceil(WORDS.length / columns);
    // the last column only as wide as its own longest word, so the list
    // ends where its text does
    const lastW = Math.max(
      ...WORDS.slice((columns - 1) * perColumn).map(({ word }) => ctx.measureText(word).width),
    );
    return {
      px,
      lineH,
      perColumn,
      colStep: colW + colGap,
      w: (columns - 1) * (colW + colGap) + lastW,
      h: Math.min(WORDS.length, perColumn) * lineH,
    };
  }

  // lays out the QR, the list, the expand button and the Reset button;
  // returns the list's font size (px)
  function layout() {
    const r = rem();
    const margin = QR_MARGIN * r;

    // the heading across the top, centred, as the scam modal's question
    // over its picture; the rest lays out under it, the QR's own margin
    // HEADING_GAP below it
    const headingPx = FONT_SIZE * r;
    const headingLineH = headingPx * LINE_HEIGHT;
    ctx.font = font(headingPx, 700);
    const headingLines = wrap(copy.listHeading, width);
    heading = { x: width / 2, y: 0, px: headingPx, lines: headingLines, lineH: headingLineH };
    const areaTop = headingLines.length * headingLineH + Math.max(0, HEADING_GAP * r - margin);

    // the Reset button, RESET_GAP under the list and centred across it, as
    // tiles-qr.js's Remove all and angle.js's Reset under their panels;
    // at the headings' size, as the other modals' buttons
    ctx.font = font(headingPx, 500);
    const buttonW = ctx.measureText(copy.reset).width + 2 * BUTTON_PAD * headingPx;
    const buttonH = BUTTON_H * headingPx;
    const resetGap = RESET_GAP * r;
    const underList = resetGap + buttonH;
    const areaH = Math.max(0, height - areaTop);

    let list;
    let listX;
    let listY;
    let listW; // the list's width as laid out
    if (expanded) {
      const across = Math.max(0, width - 2 * margin);
      list = measureList(FONT_SIZE * r, areaH, across);
      for (let k = 0; k < 4 && list.w > across && across > 0; k++) {
        list = measureList(list.px * (across / list.w), areaH, across);
      }
      const gap = LIST_GAP * r;
      const size = Math.max(0, Math.min(across, areaH - 2 * margin - gap - list.h - underList));
      const top = areaTop + margin;
      qr = { x: (width - size) / 2, y: top, size };
      // the list centred across, its text still left-aligned within it
      listW = Math.min(across, Math.max(list.w, buttonW));
      listX = (width - listW) / 2;
      listY = top + size + gap;
    } else {
      const section = width * QR_SECTION;
      const size = Math.max(0, Math.min(areaH, section) - 2 * margin);
      const room = width - section - margin;
      // the columns, with Reset under them, no taller than the QR; the
      // largest text, up to FONT_SIZE, that fits the room: shrinking it
      // frees rows per column, and so maybe a column, so a scale to fit
      // overshoots; search instead
      const avail = Math.max(0, size - underList);
      list = measureList(FONT_SIZE * r, avail);
      if (list.w > room && room > 0) {
        let lo = 0;
        let hi = list.px;
        for (let k = 0; k < 12; k++) {
          const next = measureList((lo + hi) / 2, avail);
          if (next.w <= room) lo = next.px;
          else hi = next.px;
        }
        list = measureList(lo || hi, avail);
      }
      // the QR right under the heading, HEADING_GAP down; at the canvas's
      // right, QR_MARGIN in, Reset with its bottom level with the QR's (as
      // tiles-qr.js's Remove all with its grid's) and the list RESET_GAP
      // above it (tiles-qr.js's PANEL_GAP)
      qr = { x: margin, y: areaTop + margin, size };
      listW = Math.min(room, Math.max(list.w, buttonW));
      listX = width - margin - listW;
      listY = qr.y + size - underList - list.h;
    }
    rows = WORDS.map((_, i) => ({
      x: listX + Math.floor(i / list.perColumn) * list.colStep,
      y: listY + (i % list.perColumn) * list.lineH,
      h: list.lineH,
    }));

    button = {
      x: listX + (listW - buttonW) / 2,
      y: expanded ? listY + list.h + resetGap : qr.y + qr.size - buttonH,
      w: buttonW,
      h: buttonH,
      px: headingPx,
    };

    const iconSize = qr.size * ICON_SIZE[expanded ? "minimise" : "expand"];
    const inset = qr.size * ICON_INSET;
    icon = {
      x: qr.x + qr.size - inset - iconSize,
      y: qr.y + qr.size - inset - iconSize,
      size: iconSize,
    };

    // then the whole of it (the heading to the QR's foot or Reset's,
    // whichever is lower) centred down the canvas
    const bottom = Math.max(qr.y + qr.size, button.y + button.h);
    const dy = Math.max(0, (height - bottom) / 2);
    heading.y += dy;
    qr.y += dy;
    icon.y += dy;
    button.y += dy;
    for (const row of rows) row.y += dy;
    return list.px;
  }

  // the expand button: expandIcon, or minimiseIcon while expanded,
  // outlined in the accent while hovered and ringed while focused
  function drawIcon() {
    const image = expanded ? minimiseIcon : expandIcon;
    if (!image.complete || !image.naturalWidth) return;
    const { x, y, size } = icon;
    ctx.drawImage(image, x, y, size, size);
    const outline = (pad, lineWidth) => {
      ctx.beginPath();
      ctx.roundRect(x - pad, y - pad, size + 2 * pad, size + 2 * pad, size * ICON_RADIUS + pad);
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = css("--accent");
      ctx.stroke();
    };
    if (hover === "icon") outline(0.5, 1);
    if (focus === "icon") outline(3, 2);
  }

  // the Reset button, drawn as tiles-qr.js's Remove all: muted while
  // there's nothing to reset
  function drawButton() {
    const empty = !found.some(Boolean);
    const { x, y, w, h } = button;
    ctx.beginPath();
    ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, h / 2);
    ctx.fillStyle = hover === "button" && !empty ? css("--bg") : css("--bg-elevated");
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = empty ? css("--border") : css("--fg");
    ctx.stroke();
    ctx.font = font(button.px, 500);
    ctx.fillStyle = empty ? css("--fg-muted") : css("--fg");
    ctx.textAlign = "center";
    ctx.fillText(copy.reset, x + w / 2, y + h / 2);
    ctx.textAlign = "left";
    if (focus === "button") {
      ctx.beginPath();
      ctx.roundRect(x - 3, y - 3, w + 6, h + 6, h / 2 + 3);
      ctx.lineWidth = 2;
      ctx.strokeStyle = css("--accent");
      ctx.stroke();
    }
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
      drawIcon();
    }

    const fg = css("--fg");
    ctx.textBaseline = "middle";
    ctx.fillStyle = fg;
    ctx.font = font(heading.px, 700);
    ctx.textAlign = "center";
    heading.lines.forEach((l, i) => ctx.fillText(l, heading.x, heading.y + (i + 0.5) * heading.lineH));
    ctx.textAlign = "left";

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

    drawButton();
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

  // the web font and the icons may land after the first draw
  document.fonts?.ready.then(invalidate);
  for (const image of [expandIcon, minimiseIcon]) image.decode().then(invalidate, () => {});

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

  // the button under the pointer: "icon", "button" or null
  const buttonAt = (e) => {
    const [x, y] = local(e);
    if (qrossword && inside({ x: icon.x, y: icon.y, w: icon.size, h: icon.size }, x, y))
      return "icon";
    if (inside(button, x, y)) return "button";
    return null;
  };

  // expanding grows the stage over the whole modal (.is-expanded, in
  // base.css); the canvas's resize redraws it
  function setExpanded(next) {
    expanded = next;
    layoutEl.classList.toggle("is-expanded", expanded);
    expandButton.setAttribute("aria-pressed", String(expanded));
    expandButton.setAttribute("aria-label", expanded ? copy.collapse : copy.expand);
    invalidate();
  }

  const onPointerUp = (e) => {
    const over = buttonAt(e);
    if (over === "icon") return expandButton.click();
    if (over === "button") return resetButton.click();
    const i = wordAt(e);
    if (i < 0 || found[i]) return;
    canvas.style.cursor = "";
    findWord(i);
  };
  const onClick = (e) => {
    if (e.target === expandButton) setExpanded(!expanded);
    else if (e.target === resetButton) resetFound();
  };
  const onFocus = (e) => {
    focus =
      e.type !== "focusin"
        ? null
        : e.target === expandButton
          ? "icon"
          : e.target === resetButton
            ? "button"
            : null;
    invalidate();
  };
  // Escape shrinks an expanded word search before it closes the modal
  // (on the keydown: the dialog's cancel can't always be stopped)
  const onKeyDown = (e) => {
    if (e.key !== "Escape" || !expanded) return;
    e.preventDefault();
    setExpanded(false);
  };
  // so does the modal's × (or a click on the backdrop): caught on the way
  // down, before modal.js's own listeners close the modal
  const onCloseClick = (e) => {
    if (!expanded) return;
    if (e.target !== dialog && !e.target.closest("#qr-modal-close")) return;
    e.stopPropagation();
    setExpanded(false);
  };
  const unsubscribe = onFoundChange((next) => {
    found = next;
    found.forEach((isFound, i) => (items[i].textContent = itemText(i, isFound)));
    invalidate();
  });
  // the pointer cursor shows only over the expand button, the Reset
  // button while there's something to reset, or a box still to find
  const onPointerMove = (e) => {
    const over = buttonAt(e);
    if (over !== hover) {
      hover = over;
      invalidate();
    }
    const i = over ? -1 : wordAt(e);
    const live = over === "icon" || (over === "button" && found.some(Boolean));
    canvas.style.cursor = live || (i >= 0 && !found[i]) ? "pointer" : "";
  };
  const onPointerLeave = () => {
    canvas.style.cursor = "";
    if (hover) {
      hover = null;
      invalidate();
    }
  };

  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("click", onClick);
  canvas.addEventListener("focusin", onFocus);
  canvas.addEventListener("focusout", onFocus);
  dialog?.addEventListener("keydown", onKeyDown);
  dialog?.addEventListener("click", onCloseClick, true);
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
    canvas.removeEventListener("click", onClick);
    canvas.removeEventListener("focusin", onFocus);
    canvas.removeEventListener("focusout", onFocus);
    dialog?.removeEventListener("keydown", onKeyDown);
    dialog?.removeEventListener("click", onCloseClick, true);
    width = height = 0;
  };
}
