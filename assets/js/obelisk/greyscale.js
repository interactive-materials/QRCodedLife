/* ==========================================================================
   greyscale.js — the site-wide black-and-white filter that the QOLORFUL
   modal's slider (content/color.js) sets.

   The level, 0 (colour) .. 1 (black and white), is kept in localStorage,
   so it holds when the modal closes, across the slug pages and over a
   reload; main.js applies it on load. It is drawn by the
   html.is-greyscale rule in assets/css/base.css.

   Exports:
     getGreyscale()      the level, 0..1
     setGreyscale(t)     set, apply and remember the level
     applyGreyscale()    apply the remembered level (on page load)
   ========================================================================== */

const STORAGE_KEY = "coded-life:greyscale";

let level = read();

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
  if (t > 0) root.style.setProperty("--greyscale", String(t));
  else root.style.removeProperty("--greyscale");
}

export function getGreyscale() {
  return level;
}

export function setGreyscale(t) {
  level = Math.min(Math.max(t, 0), 1);
  apply(level);
  try {
    if (level > 0) localStorage.setItem(STORAGE_KEY, String(level));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage blocked: the level still holds until the page reloads
  }
}

export function applyGreyscale() {
  apply(level);
}
