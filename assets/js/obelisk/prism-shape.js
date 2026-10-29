/* ==========================================================================
   prism-shape.js — the angle prism's adjustable dimensions, which the
   angle modal (content/angle.js) lets people change and the prism on the
   obelisk (perspective-prism.js, via obelisk.js) follows.

   The base stays PRISM.W x PRISM.L (21cm x 16cm); the ridge length R, the
   height H and the scan distance above the ridge (viewDist) change, within
   LIMITS. It's kept in localStorage, so it holds after the modal closes,
   across the slug pages and over a reload.

   Exports:
     LIMITS                 { R, H, viewDist: { min, max, step } }, cm
     getShape()             a copy of the shape: { R, H, viewDist }, cm
     setShape(changes)      set some of them, remember and announce it
     onShapeChange(fn)      call fn(shape) on every change; returns a
                            function that stops it
   ========================================================================== */

import { PRISM } from "./perspective-prism.js";

export const LIMITS = {
  R: { min: 1, max: PRISM.L, step: 0.5 }, // the ridge can run the base's length
  H: { min: 1, max: 30, step: 0.5 },
  viewDist: { min: 5, max: 100, step: 0.5 },
};
const KEYS = Object.keys(LIMITS);
const STORAGE_KEY = "coded-life:prism-shape";

// into its limits, on a step
function fit(key, value) {
  const { min, max, step } = LIMITS[key];
  const v = Math.round(Number(value) / step) * step;
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : PRISM[key];
}

const defaults = () => Object.fromEntries(KEYS.map((k) => [k, PRISM[k]]));

let shape = read();
const listeners = new Set();

function read() {
  const out = defaults();
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    for (const k of KEYS) if (stored && k in stored) out[k] = fit(k, stored[k]);
  } catch {
    // nothing stored, or storage blocked
  }
  return out;
}

export function getShape() {
  return { ...shape };
}

export function setShape(changes) {
  const next = { ...shape };
  for (const k of KEYS) if (k in changes) next[k] = fit(k, changes[k]);
  if (KEYS.every((k) => next[k] === shape[k])) return;
  shape = next;
  try {
    if (KEYS.every((k) => shape[k] === PRISM[k])) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(shape));
  } catch {
    // storage blocked: the shape still holds until the page reloads
  }
  for (const fn of listeners) fn(getShape());
}

export function onShapeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
