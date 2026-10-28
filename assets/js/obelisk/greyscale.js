/* ==========================================================================
   greyscale.js — the site-wide black-and-white filter that the QOLORFUL
   modal's slider (content/color.js) sets.

   The level, 0..1, is the slider's position. It is kept in localStorage,
   so it holds when the modal closes, across the slug pages and over a
   reload; main.js applies it on load. Up to GREY_END the site fades from
   colour to greys, drawn by the html.is-greyscale rule in
   assets/css/base.css; past it the site stays grey, and only the modal's
   QR goes on, from greys to pure black and white (binarisation()).

   A slider drag sets the level many times a frame, so setGreyscale()
   applies it once per animation frame and stores it SAVE_DELAY ms after
   the last change (or as the page is hidden).

   Exports:
     getGreyscale()      the level, 0..1
     binarisation(t)     how far level t has taken the modal's QR from
                         greys to black and white, 0..1
     setGreyscale(t)     set, apply and remember the level
     applyGreyscale()    apply the remembered level (on page load)
   ========================================================================== */

const STORAGE_KEY = "coded-life:greyscale";
const SAVE_DELAY = 300; // ms
const GREY_END = 0.5; // the level at which the colour is all gone

let level = read();
let applyFrame = 0;
let saveTimer = 0;

function read() {
  try {
    const t = parseFloat(localStorage.getItem(STORAGE_KEY));
    return t >= 0 && t <= 1 ? t : 0;
  } catch {
    return 0;
  }
}

// .is-greyscale only while above 0: any filter, even grayscale(0),
// changes how fixed children are placed
function apply(t) {
  const root = document.documentElement;
  root.classList.toggle("is-greyscale", t > 0);
  if (t > 0) root.style.setProperty("--greyscale", String(Math.min(t / GREY_END, 1)));
  else root.style.removeProperty("--greyscale");
}

export function getGreyscale() {
  return level;
}

export function binarisation(t) {
  return Math.max(0, (t - GREY_END) / (1 - GREY_END));
}

export function setGreyscale(t) {
  level = Math.min(Math.max(t, 0), 1);
  applyFrame ||= requestAnimationFrame(() => {
    applyFrame = 0;
    apply(level);
  });
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, SAVE_DELAY);
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  try {
    if (level > 0) localStorage.setItem(STORAGE_KEY, String(level));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage blocked: the level still holds until the page reloads
  }
}

// a change still waiting to be stored is stored before the page goes
addEventListener("pagehide", () => {
  if (saveTimer) save();
});

export function applyGreyscale() {
  apply(level);
}
