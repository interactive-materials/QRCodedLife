/* ==========================================================================
   scam.js — the modal for /scam/: its copy, layout and interaction, all in
   this file, in the shape of content/lentiqr.js.

   Default-exports render({ titleId }), which returns the modal's HTML:
   the header row (no subtitle on an artwork's modal, just the close
   button's row), the interactive top 40%, the rule, then the title and
   copy. Then mount(contentEl) runs the interaction; modal.js calls it
   once the HTML is in place, and calls the function it returns when the
   modal closes or changes. The close button stays outside, in each page's
   HTML.

   The top is plain HTML, not a canvas: the question, and under it the
   shop scene (scam/assets/scam-scene.png, as big as fits) with a button
   over each of its three QR codes, placed as they are in scam-scene.svg.
   Tapping one lays a panel over the picture, saying whether that QR code
   is the scam and why; its × (or Escape) takes it away again.

   Closing a scam QR code's answer stamps that code SCAM: the stamp
   (scam-stamp.svg) is pressed onto the code's surface in the picture, in
   its perspective (see placeStamps()) — once; reopening the answer leaves
   it be. Which codes are stamped is kept by
   assets/js/obelisk/scam-stamps.js, which the scam panel on the obelisk
   follows, so the sticker's stamp shows there too. A Reset button under
   the picture lifts every stamp off, here and there.

   A button in the picture's bottom right corner, with the QROSSWORD
   modal's hand-drawn expand and minimise icons (content/handdrawn.js),
   expands it: the stage takes the whole modal (the rule and the copy go)
   and the picture grows to fill it. The button, Escape, or the modal's ×
   (or backdrop) shrinks it back; only then does the × close the modal.
   ========================================================================== */

import {
  STAMP_SRC,
  isStamped,
  getStamped,
  stamp,
  resetStamps,
  onStampChange,
} from "../assets/js/obelisk/scam-stamps.js";

const SCENE_SRC = new URL("../scam/assets/scam-scene.png", import.meta.url).href;
const SCENE_RATIO = 2532 / 1904; // the picture's width / height
const icon = (name) => new URL(`../handdrawn/assets/${name}`, import.meta.url).href;
const EXPAND_SRC = icon("expand-icon.svg");
const MINIMISE_SRC = icon("minimise-icon.svg");

const copy = {
  title: "Be careful of what you scan!",
  question: "Which one is the scam QR code?",
  reset: "Reset",
  expand: "Expand the picture",
  collapse: "Shrink the picture",
  sceneLabel: "A shop with three QR codes: on the counter, by the door and on the window",
  body: [
    "QR codes are everywhere, and many of us scan any code we see without a second thought.",
    "However, QR codes may contain harmful links or malware. Bad actors have disguised QR codes to mimic legitimate ones for malicious purposes.",
    "Always check the URL embedded in a QR code before clicking on it, and avoid downloading apps through a QR code.",
  ],
};

/* ---- the QR codes -------------------------------------------------------
   Each one's button, as a share (%) of the picture: left, top, width,
   height. Its answer: whether it's the scam, a title and the copy.

   A scam one also has its stamp: `key`, the name scam-stamps.js keeps it
   by (the obelisk's scam panel shows the stamp of "sticker", the code it
   is), and `surface`, the flat thing the stamp is pressed on — its
   corners in the picture (% of it: top left, top right, bottom right,
   bottom left), its own width and height (any unit; only their ratio
   counts), and the stamp's centre (`at`, shares of the surface) and
   width (share of the surface's width; well past the code's own, so the
   stamp reads in the small picture). The stamp is tilted STAMP_TILT.
   ------------------------------------------------------------------------ */
const STAMP_TILT = -12; // deg
const CODES = [
  {
    label: "The Scan to Pay QR code on the counter",
    box: [9.5, 59.8, 11.4, 19.3],
    scam: false,
    title: "QR code for payment",
    body: [
      "This QR code sits on the counter and has the official SGQR logo. While it is usually safe to scan this QR code using payment apps, it is best practice to check that the shop's name shown is correct!"
    ],
  },
  {
    label: "The membership poster's QR code on the window",
    box: [90.75, 30.7, 9.0, 19.8],
    scam: true,
    title: "Phishing QR code",
    // the phone frame round the poster's QR
    key: "survey",
    surface: {
      corners: [[93.52, 36.55], [96.94, 36.55], [96.88, 42.8], [93.58, 42.86]],
      size: [171, 238],
      at: [0.5, 0.5],
      width: 4.5,
    },
    body: [
      "Nothing in the world is free, so always be careful of monetary promises. This QR code may lead you to a phishing site or ask you to download malicious software. Only download apps from official sources, and check the link before visiting any site."
    ],
  },
  {
    label: "The Scan to Pay QR code on the posters by the door",
    box: [36.6, 36.6, 5.9, 11.2],
    scam: true,
    title: "Fake payment QR code",
    // the sticker, the same art as the obelisk's scam panel: the stamp
    // over its QR
    key: "sticker",
    surface: {
      corners: [[36.61, 36.74], [42.6, 36.61], [42.5, 47.69], [36.67, 47.82]],
      size: [476.78, 632.69],
      at: [0.5, 0.42],
      width: 2.6,
    },
    body: [
      "Although it is inside the shop, this QR code does not have the official logo and is stuck on top of an unrelated poster. It may have been placed there by people with malicious intent, hoping to trick customers into paying someone other than the shop."
    ],
  },
];

const verdict = (code) => (code.scam ? "Scam" : "Not a scam");

const closeIcon = `<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M1 1 13 13M13 1 1 13" /></svg>`;

/* ---- HTML ---------------------------------------------------------------
   titleId lets the <dialog>'s aria-labelledby point at the heading.
   ------------------------------------------------------------------------ */
export default function render({ titleId }) {
  return `
    <div class="modal__layout">
      <div class="modal__top">
        <header class="modal__header"></header>
        <div class="modal__stage scam" style="--ratio: ${SCENE_RATIO}">
          <p class="scam__question">${copy.question}</p>
          <div class="scam__scene">
            <div class="scam__picture" role="group" aria-label="${copy.sceneLabel}">
              <img src="${SCENE_SRC}" alt="" />
              <div class="scam__stamps">
                ${CODES.map(({ key, surface }) => surface ? `
                <div class="scam__surface" data-surface="${key}">
                  <div class="scam__stamp" data-stamp="${key}" ${isStamped(key) ? "" : "hidden"}
                    style="left: ${surface.at[0] * 100}%; top: ${surface.at[1] * 100}%; width: ${surface.width * 100}%; --tilt: ${STAMP_TILT}deg"></div>
                </div>` : "").join("")}
              </div>
              ${CODES.map(({ label, box: [left, top, width, height] }, i) => `
              <button class="scam__code" type="button" data-code="${i}" aria-label="${label}"
                style="left: ${left}%; top: ${top}%; width: ${width}%; height: ${height}%"></button>`).join("")}
              <button class="scam__expand" type="button" data-expand aria-pressed="false" aria-label="${copy.expand}">
                <img src="${EXPAND_SRC}" alt="" data-expand-icon />
              </button>
            </div>
          </div>
          <button class="scam__reset" type="button" data-reset ${getStamped().length ? "" : "disabled"}>${copy.reset}</button>
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

/* ---- the answer ---------------------------------------------------------
   A panel over the picture, made on mount and removed on unmount; filled
   with the tapped code's answer each time it opens. While it's open,
   Escape closes it rather than the modal.
   ------------------------------------------------------------------------ */
const answerHtml = (code) => `
  <p class="scam__verdict${code.scam ? " scam__verdict--scam" : ""}">${verdict(code)}</p>
  <h3 class="scam__answer-title">${code.title}</h3>
  ${code.body.map((p) => `<p>${p}</p>`).join("")}
`;

export function mount(root) {
  const stage = root.querySelector(".scam");
  const picture = stage && stage.querySelector(".scam__picture");
  if (!picture) return null;
  const dialog = root.closest("dialog");
  const layoutEl = root.querySelector(".modal__layout");
  const expandButton = picture.querySelector("[data-expand]");
  const expandIcon = expandButton.querySelector("[data-expand-icon]");
  let expanded = false;

  // expanding grows the stage over the whole modal (.is-expanded, in
  // base.css); the picture refits it
  function setExpanded(next) {
    expanded = next;
    layoutEl?.classList.toggle("is-expanded", expanded);
    expandButton.classList.toggle("is-expanded", expanded);
    expandButton.setAttribute("aria-pressed", String(expanded));
    expandButton.setAttribute("aria-label", expanded ? copy.collapse : copy.expand);
    expandIcon.src = expanded ? MINIMISE_SRC : EXPAND_SRC;
  }

  const answer = document.createElement("div");
  answer.className = "scam__answer";
  answer.hidden = true;
  answer.innerHTML = `
    <button class="scam__answer-close" type="button" aria-label="Close">${closeIcon}</button>
    <div class="scam__answer-text" role="status" data-answer></div>
  `;
  picture.append(answer);
  const answerText = answer.querySelector("[data-answer]");
  const resetButton = stage.querySelector("[data-reset]");
  const stamps = [...picture.querySelectorAll("[data-stamp]")];
  loadStampArt().then((svg) => {
    for (const el of stamps) el.innerHTML = svg;
  });
  let pending = null; // the open answer's stamp, pressed on when it closes
  const closeButton = answer.querySelector(".scam__answer-close");
  let opener = null; // the code button that opened it, refocused on close

  function show(button) {
    opener = button;
    const code = CODES[Number(button.dataset.code)];
    answerText.innerHTML = answerHtml(code);
    pending = code.key || null;
    answer.hidden = false;
    closeButton.focus();
  }

  function hide() {
    if (answer.hidden) return;
    answer.hidden = true;
    if (opener) opener.focus();
    opener = null;
    if (pending) stamp(pending); // nothing if it's already stamped
    pending = null;
  }

  // while the answer's open, a click anywhere off it (the picture, a QR
  // code, the question) closes it, as its × does
  const onClick = (e) => {
    if (e.target.closest("[data-reset]")) {
      pending = null;
      hide();
      resetStamps();
      return;
    }
    if (!answer.hidden) {
      if (e.target.closest(".scam__answer-close") || !answer.contains(e.target)) hide();
      return;
    }
    if (e.target.closest("[data-expand]")) return setExpanded(!expanded);
    const button = e.target.closest("[data-code]");
    if (button) show(button);
  };
  // Escape closes the answer, not the modal: stopping the keydown stops
  // the dialog's cancel (cancelling that isn't always allowed)
  // (then, with the answer gone, Escape shrinks an expanded picture)
  const onKeydown = (e) => {
    if (e.key !== "Escape") return;
    if (!answer.hidden) {
      e.preventDefault();
      hide();
    } else if (expanded) {
      e.preventDefault();
      setExpanded(false);
    }
  };
  // the modal's × (or a click on the backdrop) shrinks an expanded
  // picture before it closes the modal: caught on the way down, before
  // modal.js's own listeners
  const onCloseClick = (e) => {
    if (!expanded) return;
    if (e.target !== dialog && !e.target.closest("#qr-modal-close")) return;
    e.stopPropagation();
    setExpanded(false);
  };

  // a stamp newly stamped is pressed on; one reset is lifted off (the
  // pressing, played backwards) and then hidden
  const showStamps = () => {
    for (const el of stamps) {
      const on = isStamped(el.dataset.stamp);
      el.classList.remove("is-pressing", "is-lifting");
      void el.offsetWidth; // so a class added again restarts its animation
      if (on && el.hidden) {
        el.hidden = false;
        el.classList.add("is-pressing");
      } else if (!on && !el.hidden) {
        el.classList.add("is-lifting");
      }
    }
    resetButton.disabled = !getStamped().length;
  };
  const onAnimationEnd = (e) => {
    const el = e.target.closest("[data-stamp]");
    if (!el) return;
    if (el.classList.contains("is-lifting")) el.hidden = true;
    el.classList.remove("is-pressing", "is-lifting");
  };
  const stopStamps = onStampChange(showStamps);

  const place = () => placeStamps(picture);
  const resize = new ResizeObserver(place);
  resize.observe(picture);
  place();

  stage.addEventListener("click", onClick);
  picture.addEventListener("animationend", onAnimationEnd);
  if (dialog) dialog.addEventListener("keydown", onKeydown);
  if (dialog) dialog.addEventListener("click", onCloseClick, true);
  return () => {
    // the modal closing with an answer open: its stamp is still due
    if (pending) stamp(pending);
    stage.removeEventListener("click", onClick);
    picture.removeEventListener("animationend", onAnimationEnd);
    if (dialog) dialog.removeEventListener("keydown", onKeydown);
    if (dialog) dialog.removeEventListener("click", onCloseClick, true);
    setExpanded(false);
    stopStamps();
    resize.disconnect();
    answer.remove();
  };
}

/* ---- the stamps ---------------------------------------------------------
   The stamp's SVG, inlined so its text has the page's DM Sans (read once).
   Each surface is a box of its own proportions, as wide as the surface's
   top edge, mapped onto its corners in the picture with a matrix3d (the
   projective map of a rectangle onto a quadrilateral), so the stamp, laid
   flat in it, takes the surface's perspective. Placed again whenever the
   picture changes size.
   ------------------------------------------------------------------------ */
let stampArtLoad = null;
function loadStampArt() {
  stampArtLoad ??= fetch(new URL(`../${STAMP_SRC}`, import.meta.url))
    .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`${res.status} ${STAMP_SRC}`))))
    .catch((err) => {
      console.warn("scam: could not load the stamp", err);
      stampArtLoad = null;
      return "";
    });
  return stampArtLoad;
}

function placeStamps(picture) {
  const W = picture.clientWidth;
  const H = picture.clientHeight;
  if (!W || !H) return;
  for (const el of picture.querySelectorAll("[data-surface]")) {
    const { surface } = CODES.find(({ key }) => key === el.dataset.surface);
    const corners = surface.corners.map(([x, y]) => [(x / 100) * W, (y / 100) * H]);
    const [sw, sh] = surface.size;
    const w = Math.hypot(corners[1][0] - corners[0][0], corners[1][1] - corners[0][1]);
    const h = (w * sh) / sw;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.transform = rectToQuad(w, h, corners);
  }
}

// the CSS matrix3d taking a w x h box (origin top left) onto the corners
// [top left, top right, bottom right, bottom left]
function rectToQuad(w, h, [[x0, y0], [x1, y1], [x2, y2], [x3, y3]]) {
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const det = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / det;
  const k = (dx1 * dy3 - dx3 * dy1) / det;
  // the unit square onto the corners, after the box onto the unit square
  const a = (x1 - x0 + g * x1) / w, b = (x3 - x0 + k * x3) / h;
  const d = (y1 - y0 + g * y1) / w, e = (y3 - y0 + k * y3) / h;
  return `matrix3d(${[a, d, 0, g / w, b, e, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1].join(",")})`;
}
