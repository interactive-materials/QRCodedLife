/* ==========================================================================
   floor-pattern.js — the 3 x 3 tile pattern the floor repeats, which the
   tiles modal (content/tiles.js) lets people make.

   The pattern is 9 booleans, row by row from the top left: true where a
   tile is placed. Each floor cell is one tile; the floor repeats the
   3 x 3 block across itself (see makeFloorGridTexture() in obelisk.js).
   It's kept in localStorage, so it holds after the modal closes, across
   the slug pages and over a reload.

   Exports:
     PATTERN_SIZE           3, the block's side (cells)
     getPattern()           a copy of the pattern
     setPattern(cells)      set, remember and announce it
     onPatternChange(fn)    call fn(pattern) on every change; returns a
                            function that stops it
   ========================================================================== */

export const PATTERN_SIZE = 3;
const CELLS = PATTERN_SIZE * PATTERN_SIZE;
const STORAGE_KEY = "coded-life:floor-pattern";

let pattern = read();
const listeners = new Set();

function read() {
  try {
    const cells = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(cells) && cells.length === CELLS) return cells.map(Boolean);
  } catch {
    // nothing stored, or storage blocked
  }
  return Array(CELLS).fill(false);
}

export function getPattern() {
  return [...pattern];
}

export function setPattern(cells) {
  pattern = Array.from({ length: CELLS }, (_, i) => Boolean(cells[i]));
  try {
    if (pattern.some(Boolean)) localStorage.setItem(STORAGE_KEY, JSON.stringify(pattern));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage blocked: the pattern still holds until the page reloads
  }
  for (const fn of listeners) fn(getPattern());
}

export function onPatternChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
