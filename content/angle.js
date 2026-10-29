/* ==========================================================================
   angle.js — the modal for /angle/: its copy, layout and canvas, all in
   this file, in the same shape as content/color.js.

   Default-exports render({ titleId }), which returns the modal's HTML:
   the header row (no subtitle on an artwork's modal, just the close
   button's row), the interactive top 40% (a <canvas>), the rule, then the
   title and copy. Then mount(contentEl) runs the canvas; modal.js calls it
   once the HTML is in place, and calls the function it returns when the
   modal closes or changes. The close button stays outside, in each page's
   HTML.

   The canvas is a model maker for DISTQRTED, the perspective QR prism
   (assets/js/obelisk/perspective-prism.js): a square viewport where the
   QR sits in the other artwork modals, showing the prism in 3D — drag it
   to turn the model any way round, and scroll or pinch to zoom — and to its right three sliders: the scan height
   (above the ridge), the ridge length and the prism's height, and a
   Reset button that returns the shape and the view to how they started.
   Its base stays 21cm x 16cm. The shape is kept by assets/js/obelisk/
   prism-shape.js, which the prism on the obelisk follows, so changing it
   here reshapes that one too.
   ========================================================================== */

import * as THREE from "three";
import {
  PRISM,
  buildPerspectivePrism,
  reshapePerspectivePrism,
  disposePerspectivePrism,
} from "../assets/js/obelisk/perspective-prism.js";
import { LIMITS, getShape, setShape, onShapeChange } from "../assets/js/obelisk/prism-shape.js";

const copy = {
  title: "Distqrted",
  stageLabel: "The DISTQRTED prism in 3D, with sliders to reshape it",
  reset: "Reset",
  body: [
    "QR codes are made to be robust, scannable from any angle. Distqrted challenged this by distorting the QR code to be only scannable from a certain angle and distance.",
  ],
};

// the sliders, top to bottom; label is drawn, name read by screen readers
const SLIDERS = [
  { key: "viewDist", label: "Scan height", name: "Scan height above the ridge, in cm" },
  { key: "R", label: "Ridge length", name: "Ridge length, in cm" },
  { key: "H", label: "Height", name: "Height of the prism, in cm" },
];

/* ---- HTML ---------------------------------------------------------------
   titleId lets the <dialog>'s aria-labelledby point at the heading. The
   range inputs and the button inside the <canvas> are its fallback
   content: never drawn, but focusable (arrow keys move the inputs) and
   read by screen readers; the canvas draws them as the sliders and the
   Reset button, dragging a drawn slider moves its input, and the drawn
   button clicks its button.
   ------------------------------------------------------------------------ */
export default function render({ titleId }) {
  const shape = getShape();
  return `
    <div class="modal__layout">
      <div class="modal__top">
        <header class="modal__header"></header>
        <div class="modal__stage">
          <canvas class="modal__canvas">
            <p>${copy.stageLabel}</p>
            ${SLIDERS.map(({ key, name }) => {
              const { min, max, step } = LIMITS[key];
              return `
            <label>${name}
              <input type="range" min="${min}" max="${max}" step="${step}" value="${shape[key]}" data-dim="${key}" />
            </label>`;
            }).join("")}
            <button type="button" data-reset>${copy.reset}</button>
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

/* ---- the 3D view ----------------------------------------------------------
   The prism as on the obelisk (base on the face, ridge running up), on a
   base plate so it's solid from behind, in its own scene on the modal's
   background (as the tiles modal's grid), drawn by a WebGL renderer off
   screen and copied onto the canvas. The camera turns freely round the
   prism, all the way round any way, as a trackball: dragging turns it
   about its own up and right axes, so there's no pole to stop at. It
   aims at the prism's middle, from as far as fits the tallest prism the
   sliders allow (times the zoom, within ZOOM_RANGE), so a change in size
   shows as one. It starts turned by VIEW_YAW and VIEW_PITCH.
   ------------------------------------------------------------------------ */
const VIEW_FOV = 30; // deg
const VIEW_YAW = 0.6; // rad, to start: turned to the right
const VIEW_PITCH = 0.35; // and looking down a little
const TURN_SPEED = 3; // rad per viewport side dragged
const ZOOM_RANGE = [0.3, 2.5]; // the camera's distance, as a share of the fit
const CM = 0.01;

function makeView() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (err) {
    console.warn("angle: could not start WebGL", err);
    return null;
  }

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0x8a8397, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(2.5, 4, 3);
  scene.add(key);
  const prism = buildPerspectivePrism(getShape());
  // the base, a hair behind the slopes' bottom edges so they don't flicker
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(PRISM.W * CM, PRISM.L * CM),
    new THREE.MeshStandardMaterial({ color: PRISM.prismColor, roughness: 0.6, side: THREE.DoubleSide }),
  );
  base.position.z = -0.0002;
  scene.add(prism, base);

  // aimed at the middle of the prism as it is, from as far as fits the
  // tallest one's bounding sphere, in metres
  const target = new THREE.Vector3();
  const radius = Math.hypot(PRISM.W / 2, PRISM.L / 2, LIMITS.H.max / 2) * CM;
  const distance = (radius / Math.sin((VIEW_FOV * Math.PI) / 360)) * 1.05;
  const camera = new THREE.PerspectiveCamera(VIEW_FOV, 1, distance / 20, distance * 4);

  // the camera's orientation; it sits zoom x distance back along its +z
  const look = new THREE.PerspectiveCamera();
  look.position.set(
    Math.sin(VIEW_YAW) * Math.cos(VIEW_PITCH),
    Math.sin(VIEW_PITCH),
    Math.cos(VIEW_YAW) * Math.cos(VIEW_PITCH),
  );
  look.lookAt(0, 0, 0);
  const start = look.quaternion.clone();
  const orient = start.clone();
  let zoom = 1;
  const axis = new THREE.Vector3();
  const spin = new THREE.Quaternion();
  const background = new THREE.Color();

  return {
    // turns by dx, dy (shares of the viewport's side)
    turn(dx, dy) {
      for (const [x, y, angle] of [[0, 1, -dx], [1, 0, -dy]]) {
        axis.set(x, y, 0).applyQuaternion(orient);
        orient.premultiply(spin.setFromAxisAngle(axis, angle * TURN_SPEED));
      }
      orient.normalize();
    },
    zoomBy(f) {
      zoom = THREE.MathUtils.clamp(zoom * f, ...ZOOM_RANGE);
    },
    moved: () => zoom !== 1 || !orient.equals(start),
    home() {
      orient.copy(start);
      zoom = 1;
    },
    reshape: (shape) => reshapePerspectivePrism(prism, shape),
    // renders at px x px device pixels on the colour bg; returns the image
    // to copy
    render(px, bg) {
      if (renderer.domElement.width !== px) renderer.setSize(px, px, false);
      renderer.setClearColor(background.set(bg));
      target.z = (prism.userData.shape.H / 2) * CM;
      camera.quaternion.copy(orient);
      camera.position.set(0, 0, distance * zoom).applyQuaternion(orient).add(target);
      renderer.render(scene, camera);
      return renderer.domElement;
    },
    dispose() {
      disposePerspectivePrism(prism);
      base.geometry.dispose();
      base.material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

/* ---- canvas -------------------------------------------------------------
   Layout, in CSS px. The canvas splits into two sections, as in color.js
   and handdrawn.js: the view's, the left QR_SECTION of its width, and the
   sliders', the rest. The view is a square as big as fits in its section
   with QR_MARGIN all round, at its left — the same size and place as the
   QR in the other two. The sliders are a stack, centred down the square's
   height, each a row of its label (left) and value (right) over its track,
   from PANEL_PAD into their section to QR_MARGIN short of the canvas's
   right, so the two sides' margins match; then the Reset button, centred
   across the sliders; where the stack is taller than the canvas
   (on a phone), it all shrinks to fit.
   ------------------------------------------------------------------------ */
const QR_SECTION = 0.6; // the view's section, as a share of the canvas's width
const QR_MARGIN = 0.75; // round the view, inside its section (rem)
const PANEL_PAD = 0.75; // the sliders to their section's sides (rem)
const FONT_SIZE = 0.8125; // rem
const LINE_HEIGHT = 1.4; // a label's line, as a multiple of the font size
const LABEL_GAP = 0.25; // a label to its track (rem)
const ROW_GAP = 1; // between sliders (rem)
const THUMB_R = 0.5; // thumb radius (rem)
const TRACK_W = 4; // px
const THUMB_STROKE = 1.5; // px
const BUTTON_H = 2; // rem
const BUTTON_PAD = 0.875; // the button's text to its sides (rem)

// 10 -> "10 cm", 7.5 -> "7.5 cm"
const cm = (v) => `${Number(v.toFixed(1))} cm`;

export function mount(root) {
  const canvas = root.querySelector(".modal__canvas");
  const inputs = canvas ? SLIDERS.map(({ key }) => canvas.querySelector(`input[data-dim="${key}"]`)) : [];
  const resetButton = canvas && canvas.querySelector("button[data-reset]");
  if (!canvas || inputs.some((input) => !input) || !resetButton) return null;
  const ctx = canvas.getContext("2d");
  // dragging the view or a slider on a touch screen mustn't pan or zoom
  canvas.style.touchAction = "none";
  const view = makeView();

  let width = 0;
  let height = 0;
  let dpr = 1;
  let raf = 0;
  let square = { x: 0, y: 0, size: 0 };
  let rows = []; // per slider: { labelY, x0, x1, y }, CSS px; track x0..x1 at y
  let button = { x: 0, y: 0, w: 0, h: 0 };
  let unit = 0; // rem, shrunk to fit
  let shape = getShape();
  // the drag under way: { kind: "view" } or { kind: "slider", i }
  let drag = null;
  // the pointers turning (one) or pinching (two) the view: id -> [x, y]
  const viewPointers = new Map();
  let hover = null; // what the pointer is over: "view", "button", a slider's index
  let focus = null; // the focused fallback: "button", a slider's index

  const css = (name) => getComputedStyle(canvas).getPropertyValue(name).trim();
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize);
  const font = (weight = 400) => `${weight} ${FONT_SIZE * unit}px ${css("--font") || "sans-serif"}`;

  function layout() {
    const r = rem();
    const section = width * QR_SECTION;
    const margin = QR_MARGIN * r;
    const size = Math.max(0, Math.min(height, section) - 2 * margin);
    square = { x: margin, y: (height - size) / 2, size };

    const rowH = (FONT_SIZE * LINE_HEIGHT + LABEL_GAP + 2 * THUMB_R) * r;
    const stackH = SLIDERS.length * rowH + SLIDERS.length * ROW_GAP * r + BUTTON_H * r;
    unit = r * Math.min(1, height / stackH);
    const lineH = FONT_SIZE * LINE_HEIGHT * unit;
    const thumbR = THUMB_R * unit;
    const step = rowH * (unit / r) + ROW_GAP * unit;
    const top = (height - stackH * (unit / r)) / 2;
    const left = section + PANEL_PAD * unit;
    const right = width - margin; // QR_MARGIN in, as the view is on the left
    rows = SLIDERS.map((_, i) => {
      const y0 = top + i * step;
      return {
        left,
        right,
        labelY: y0 + lineH / 2,
        x0: left + thumbR,
        x1: Math.max(left + thumbR, right - thumbR),
        y: y0 + lineH + LABEL_GAP * unit + thumbR,
      };
    });

    ctx.font = font(500);
    const w = ctx.measureText(copy.reset).width + 2 * BUTTON_PAD * unit;
    button = {
      x: (left + right - w) / 2,
      y: top + SLIDERS.length * step,
      w,
      h: BUTTON_H * unit,
    };
  }

  // as it started: the original shape, the starting view
  const original = () => SLIDERS.every(({ key }) => shape[key] === PRISM[key]) && !view?.moved();
  function reset() {
    setShape(Object.fromEntries(SLIDERS.map(({ key }) => [key, PRISM[key]])));
    view?.home();
    invalidate();
  }

  const share = (i) => {
    const { min, max } = LIMITS[SLIDERS[i].key];
    return (shape[SLIDERS[i].key] - min) / (max - min);
  };

  function draw() {
    layout();
    const fg = css("--fg");

    if (square.size > 0) {
      const x = Math.round(square.x * dpr) / dpr;
      const y = Math.round(square.y * dpr) / dpr;
      const px = Math.round(square.size * dpr);
      const bg = css("--bg");
      if (view) ctx.drawImage(view.render(px, bg), x, y, px / dpr, px / dpr);
      else {
        ctx.fillStyle = bg;
        ctx.fillRect(x, y, px / dpr, px / dpr);
      }
    }

    const thumbR = THUMB_R * unit;
    ctx.textBaseline = "middle";
    rows.forEach((row, i) => {
      const { key, label } = SLIDERS[i];
      ctx.fillStyle = fg;
      ctx.font = font(700);
      ctx.textAlign = "left";
      ctx.fillText(label, row.left, row.labelY);
      ctx.font = font();
      ctx.textAlign = "right";
      ctx.fillText(cm(shape[key]), row.right, row.labelY);

      // track: filled from its start up to the thumb
      const thumbX = row.x0 + (row.x1 - row.x0) * share(i);
      ctx.lineCap = "round";
      ctx.lineWidth = TRACK_W;
      ctx.beginPath();
      ctx.moveTo(row.x0, row.y);
      ctx.lineTo(row.x1, row.y);
      ctx.strokeStyle = css("--border");
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(row.x0, row.y);
      ctx.lineTo(thumbX, row.y);
      ctx.strokeStyle = fg;
      ctx.stroke();

      // thumb
      const active = hover === i || drag?.i === i;
      ctx.beginPath();
      ctx.arc(thumbX, row.y, (active ? 1.15 : 1) * thumbR, 0, Math.PI * 2);
      ctx.fillStyle = css("--bg-elevated");
      ctx.fill();
      ctx.lineWidth = THUMB_STROKE;
      ctx.strokeStyle = fg;
      ctx.stroke();
      if (focus === i) {
        ctx.beginPath();
        ctx.arc(thumbX, row.y, thumbR + 4, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = css("--accent");
        ctx.stroke();
      }
    });

    // the Reset button, greyed while there's nothing to reset
    const idle = original();
    ctx.beginPath();
    ctx.roundRect(button.x + 0.5, button.y + 0.5, button.w - 1, button.h - 1, button.h / 2);
    ctx.fillStyle = hover === "button" && !idle ? css("--bg") : css("--bg-elevated");
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = idle ? css("--border") : fg;
    ctx.stroke();
    ctx.font = font(500);
    ctx.fillStyle = idle ? css("--fg-muted") : fg;
    ctx.textAlign = "center";
    ctx.fillText(copy.reset, button.x + button.w / 2, button.y + button.h / 2);
    if (focus === "button") {
      ctx.beginPath();
      ctx.roundRect(button.x - 3, button.y - 3, button.w + 6, button.h + 6, button.h / 2 + 3);
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

  // ---- the shape: set here with setShape(), kept by prism-shape.js,
  // which the obelisk's prism follows; the inputs mirror it
  const unsubscribe = onShapeChange((next) => {
    shape = next;
    SLIDERS.forEach(({ key }, i) => {
      if (Number(inputs[i].value) !== shape[key]) inputs[i].value = String(shape[key]);
    });
    if (view) view.reshape(shape);
    invalidate();
  });

  // ---- pointer
  const local = (e) => {
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };
  // what's under the pointer: a slider's index, "button", "view", or null
  function hitAt(e) {
    const [x, y] = local(e);
    if (x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h)
      return "button";
    const reach = 1.6 * THUMB_R * unit;
    const i = rows.findIndex((row) => Math.abs(y - row.y) <= reach && x >= row.x0 - reach && x <= row.x1 + reach);
    if (i >= 0) return i;
    const { x: sx, y: sy, size } = square;
    return view && x >= sx && x <= sx + size && y >= sy && y <= sy + size ? "view" : null;
  }
  const setFrom = (e, i) => {
    const [x] = local(e);
    const row = rows[i];
    const { min, max } = LIMITS[SLIDERS[i].key];
    const v = min + Math.min(Math.max((x - row.x0) / (row.x1 - row.x0 || 1), 0), 1) * (max - min);
    inputs[i].value = String(v); // the input snaps it to its step
    inputs[i].dispatchEvent(new Event("input", { bubbles: true }));
  };

  function setCursor() {
    if (drag) canvas.style.cursor = drag.kind === "view" ? "grabbing" : "pointer";
    else if (hover === "view") canvas.style.cursor = "grab";
    else if (hover === "button") canvas.style.cursor = original() ? "" : "pointer";
    else canvas.style.cursor = typeof hover === "number" ? "pointer" : "";
  }

  const onInput = (e) => {
    const i = inputs.indexOf(e.target);
    if (i >= 0) setShape({ [SLIDERS[i].key]: Number(e.target.value) });
  };
  const onPointerDown = (e) => {
    const hit = hitAt(e);
    hover = hit;
    if (hit === null || hit === "button") return; // the button goes on pointerup
    if (hit === "view") {
      if (drag?.kind === "slider") return;
      viewPointers.set(e.pointerId, local(e));
      drag = { kind: "view" };
    } else if (drag) return;
    else drag = { kind: "slider", i: hit };
    canvas.setPointerCapture(e.pointerId);
    setCursor();
    if (drag.kind === "slider") setFrom(e, drag.i);
    invalidate();
  };
  const onPointerMove = (e) => {
    if (drag?.kind === "slider") return setFrom(e, drag.i);
    if (drag?.kind === "view") {
      const was = viewPointers.get(e.pointerId);
      if (!was) return;
      const now = local(e);
      if (viewPointers.size === 2) {
        // pinch: zoom by how much the fingers' spread changed
        const other = [...viewPointers].find(([id]) => id !== e.pointerId)[1];
        const before = Math.hypot(was[0] - other[0], was[1] - other[1]);
        const after = Math.hypot(now[0] - other[0], now[1] - other[1]);
        if (before > 0 && after > 0) view.zoomBy(before / after);
      } else {
        const side = square.size || 1;
        view.turn((now[0] - was[0]) / side, (now[1] - was[1]) / side);
      }
      viewPointers.set(e.pointerId, now);
      return invalidate();
    }
    const hit = hitAt(e);
    if (hit === hover) return;
    hover = hit;
    setCursor();
    invalidate();
  };
  const onPointerUp = (e) => {
    const hit = hitAt(e);
    if (drag?.kind === "view") {
      if (!viewPointers.delete(e.pointerId)) return;
      canvas.releasePointerCapture(e.pointerId);
      if (viewPointers.size) return;
      drag = null;
    } else if (drag) {
      drag = null;
      canvas.releasePointerCapture(e.pointerId);
    } else if (e.type === "pointerup" && hit === "button" && hover === "button") {
      resetButton.click();
    }
    hover = hit;
    setCursor();
    invalidate();
  };
  const onPointerLeave = () => {
    if (drag || hover === null) return;
    hover = null;
    setCursor();
    invalidate();
  };
  // the wheel (or a trackpad pinch, as ctrl + wheel) zooms the view
  const onWheel = (e) => {
    if (hitAt(e) !== "view") return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? square.size : 1;
    view.zoomBy(Math.exp(e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.002)));
    invalidate();
  };
  const onClick = (e) => {
    if (e.target === resetButton) reset();
  };
  const onFocus = (e) => {
    const i = inputs.indexOf(e.target);
    focus = e.type !== "focusin" ? null : e.target === resetButton ? "button" : i >= 0 ? i : null;
    invalidate();
  };

  canvas.addEventListener("input", onInput);
  canvas.addEventListener("click", onClick);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);
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
    canvas.removeEventListener("input", onInput);
    canvas.removeEventListener("click", onClick);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    canvas.removeEventListener("focusin", onFocus);
    canvas.removeEventListener("focusout", onFocus);
    if (view) view.dispose();
    width = height = 0;
  };
}
