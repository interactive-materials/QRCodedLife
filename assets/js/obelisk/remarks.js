/* ==========================================================================
   remarks.js — the pop-up comments: a translucent navy card that says
   something when the visitor changes something in a modal. The wording
   and the on/off switches are in content/remarks.js; this file decides
   when each one shows.

   It listens to the shared stores the modals change (scam stamps, the
   QROSSWORD finds, the greyscale level, the floor pattern, the lens emoji,
   the prism's shape) and to modal:open / modal:close, so none of the
   modal files need to know about it.

   A visit to a modal compares each change with how things stood when it
   opened. As soon as a change calls for a comment, the card shows,
   centred on the screen behind the modal (dimmed by its backdrop); if the
   change is undone, it goes again. Its countdown (REMARK_SECONDS) starts
   only once the modal has closed, when the change can be seen on the
   obelisk. A click on it, or Escape once no modal is open, takes it away
   sooner. One card shows at a time.

   Exports:
     initRemarks({ ready })   wire it up once, after initModal(); ready is
                              a promise that settles when the obelisk has
                              loaded (the tutorial waits for it)
   ========================================================================== */

import { REMARKS_ON, REMARK_SECONDS, remarks } from "../../../content/remarks.js";
import { pageRoutes } from "./routes.js";
import { getStamped, onStampChange } from "./scam-stamps.js";
import { getFound, onFoundChange } from "./qrossword.js";
import { getGreyscale, onGreyscaleChange } from "./greyscale.js";
import { getPattern, onPatternChange } from "./floor-pattern.js";
import { getChoice, onChoiceChange } from "./lens-emoji.js";
import { getShape, onShapeChange, isDefaultShape } from "./prism-shape.js";

const SCAM_COUNT = 2; // the scam modal's scam codes (survey, sticker)
const CLOSE_DELAY = 450; // ms after a modal closes: its slide-out is 280ms
const SESSION_PREFIX = "coded-life:remark-shown:";
// every lens emoji the obelisk has shown, as "view:index", kept across
// visits and reloads (renamed with lens-emoji.js's STORAGE_KEY)
const LENS_SEEN_KEY = "coded-life:lens-emoji-seen-sets";
// shown at most once per browser tab
const ONCE = new Set(["tutorial", "scamOne"]);

let dialog;
let card = null; // the comment on screen, if any
let hideTimer = 0;

// the modal open now: its slug, how things stood when it opened, and the
// fewest stamps / finds since (a Reset during the visit)
let visit = null;

/* ---- once per browser tab ------------------------------------------------ */
function shownThisTab(key) {
  try {
    return sessionStorage.getItem(SESSION_PREFIX + key) === "1";
  } catch {
    return false;
  }
}

function unmarkShown(key) {
  try {
    sessionStorage.removeItem(SESSION_PREFIX + key);
  } catch {
    // storage blocked: nothing was kept
  }
}

function markShown(key) {
  try {
    sessionStorage.setItem(SESSION_PREFIX + key, "1");
  } catch {
    // storage blocked: it may show again after a reload
  }
}

/* ---- lens emoji already shown -------------------------------------------- */
const lensSeen = readLensSeen();

function readLensSeen() {
  try {
    const stored = JSON.parse(localStorage.getItem(LENS_SEEN_KEY));
    if (Array.isArray(stored)) return new Set(stored);
  } catch {
    // nothing stored, or storage blocked
  }
  return new Set();
}

// the index all three views show (0 = their eyes, 1.. a set), or -1 when
// they differ
function triplet(choice) {
  return choice.every((i) => i === choice[0]) ? choice[0] : -1;
}

// the eyes never count as new
const lensKeys = () =>
  getChoice().flatMap((i, v) => (i === 0 ? [] : [`${v}:${i}`]));
const lensNew = () => lensKeys().some((k) => !lensSeen.has(k));

// the emoji on the obelisk now count as shown
function markLensSeen() {
  if (!lensNew()) return;
  lensKeys().forEach((k) => lensSeen.add(k));
  try {
    localStorage.setItem(LENS_SEEN_KEY, JSON.stringify([...lensSeen]));
  } catch {
    // storage blocked: they count as shown until the page reloads
  }
}

const isOn = (key) => REMARKS_ON && remarks[key] && remarks[key].on;
const fresh = (key) => (ONCE.has(key) && shownThisTab(key) ? null : key);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const foundCount = () => getFound().filter(Boolean).length;

/* ---- the card ------------------------------------------------------------ */
// shows `key` (keeping the card up if it already says that); its countdown
// runs only while no modal is open
function show(key) {
  if (!isOn(key)) return;
  if (!(card && card.dataset.key === key)) {
    hide(true);
    card = document.createElement("div");
    card.className = "remark";
    card.dataset.key = key;
    card.setAttribute("role", "status");
    // a blank line in the text ("\n\n") starts a new paragraph
    for (const para of remarks[key].text.split(/\n\s*\n/)) {
      const p = document.createElement("p");
      p.className = "remark__text";
      p.textContent = para.trim();
      card.append(p);
    }
    card.addEventListener("click", () => hide());
    document.body.append(card);
    // next frame, so it fades in from its starting style
    const shown = card;
    requestAnimationFrame(() => shown.classList.add("is-shown"));
  }
  clearTimeout(hideTimer);
  if (!dialog.open && REMARK_SECONDS > 0) {
    hideTimer = setTimeout(() => hide(), REMARK_SECONDS * 1000);
  }
}

function hide(immediately = false) {
  clearTimeout(hideTimer);
  if (!card) return;
  const gone = card;
  card = null;
  if (immediately) {
    gone.remove();
    return;
  }
  gone.classList.remove("is-shown");
  gone.addEventListener("transitionend", () => gone.remove(), { once: true });
  setTimeout(() => gone.remove(), 400); // no transition (reduced motion)
}

/* ---- what the visit calls for -------------------------------------------- */
// the comment this visit's changes call for now, or null (nothing changed,
// or the change was undone)
function due() {
  const { slug, start } = visit;
  switch (slug) {
    case "scam": {
      const n = getStamped().length;
      if (n >= SCAM_COUNT && visit.lowStamps < SCAM_COUNT) return "scamBoth";
      if (n === 1 && visit.lowStamps === 0) return fresh("scamOne");
      return null;
    }
    case "color": {
      // only a change from how it stood when the modal opened, full colour
      // (level 0) or grey (anything else): moving the slider and coming
      // back, or moving it about within the grey, says nothing
      const colourful = getGreyscale() === 0;
      if (colourful === (start.grey === 0)) return null;
      return colourful ? "colorBack" : "colorGrey";
    }
    case "tiles-qr": {
      const cells = getPattern();
      if (same(cells, start.pattern)) return null;
      return cells.some(Boolean) ? "tilesChanged" : "tilesEmpty";
    }
    case "angle":
      // only a change from how it stood when the modal opened: back to the
      // original shape, or off it
      if (same(getShape(), start.shape)) return null;
      return isDefaultShape() ? "angleBack" : "angleChanged";
    case "lens-l":
    case "lens-c":
    case "lens-r": {
      // all three on one set, which they weren't when the modal opened
      // (a triplet broken and made again counts again): that set's own
      const set = triplet(getChoice());
      if (set >= 0 && set !== triplet(start.choice)) return `lensSet${set}`;
      // otherwise only an emoji the obelisk has never shown (never the
      // eyes; whatever it showed on load counts as shown)
      return lensNew() ? "lensChanged" : null;
    }
    case "handdrawn": {
      const found = getFound();
      if (found.every(Boolean)) {
        return visit.lowFound < found.length ? "handdrawnDone" : null;
      }
      // stations still to find, after the found list changed this visit
      return same(found, start.found) ? null : "handdrawnBreak";
    }
    default:
      return null;
  }
}

// on every change in a store: show, swap or take away the card
function update() {
  if (!visit) return;
  // a Reset of the stamps starts over: the one-scam comment may show again
  if (getStamped().length === 0) unmarkShown("scamOne");
  visit.lowStamps = Math.min(visit.lowStamps, getStamped().length);
  visit.lowFound = Math.min(visit.lowFound, foundCount());
  const key = due();
  if (key && isOn(key)) show(key);
  else if (card) hide();
}

function onModalOpen(e) {
  const { qrId } = e.detail;
  visit = {
    slug: pageRoutes[qrId] ?? qrId,
    start: {
      grey: getGreyscale(),
      pattern: getPattern(),
      shape: getShape(),
      choice: getChoice(),
      found: getFound(),
    },
    lowStamps: getStamped().length,
    lowFound: foundCount(),
  };
  hide(); // the tutorial, or the last visit's comment, goes
}

function onModalClose() {
  if (!visit) return;
  const key = due();
  visit = null;
  markLensSeen(); // the obelisk shows them from now on

  if (!key || !isOn(key)) {
    hide();
    return;
  }
  if (ONCE.has(key)) markShown(key);
  if (card && card.dataset.key === key) {
    show(key); // already up behind the modal: its countdown starts
  } else {
    setTimeout(() => {
      if (!dialog.open) show(key); // unless another modal opened meanwhile
    }, CLOSE_DELAY);
  }
}

/* ---- the tutorial -------------------------------------------------------- */
function tutorial(ready) {
  if (!isOn("tutorial") || shownThisTab("tutorial")) return;
  // it goes with its timer, as the others do, or at the first touch,
  // click, scroll or key anywhere on the screen
  const start = () => {
    markShown("tutorial");
    show("tutorial");
    const events = ["pointerdown", "wheel", "keydown"];
    const dismiss = () => {
      events.forEach((type) => removeEventListener(type, dismiss, true));
      if (card && card.dataset.key === "tutorial") hide();
    };
    events.forEach((type) => addEventListener(type, dismiss, { capture: true, passive: true }));
  };
  Promise.resolve(ready).finally(() => {
    if (!dialog.open) start();
    // landed on a slug page (a scanned QR): after its modal closes,
    // unless that visit left a comment of its own
    else {
      document.addEventListener(
        "modal:close",
        // just after a comment that visit left would have shown
        () => setTimeout(() => {
          if (!card && !dialog.open) start();
        }, CLOSE_DELAY + 50),
        { once: true },
      );
    }
  });
}

/* ---- init ---------------------------------------------------------------- */
export function initRemarks({ ready } = {}) {
  if (!REMARKS_ON) return;
  dialog = document.getElementById("qr-modal");
  markLensSeen(); // the emoji the obelisk starts on

  document.addEventListener("modal:open", onModalOpen);
  document.addEventListener("modal:close", onModalClose);

  // Escape takes the comment away once no modal is open (with one open,
  // it closes the modal, and the comment's countdown starts)
  addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || !card || dialog.open) return;
      hide();
    },
    true,
  );

  [onStampChange, onFoundChange, onGreyscaleChange, onPatternChange, onChoiceChange, onShapeChange]
    .forEach((on) => on(update));
  tutorial(ready);
}
