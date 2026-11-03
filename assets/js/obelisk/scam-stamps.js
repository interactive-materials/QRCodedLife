/* ==========================================================================
   scam-stamps.js — which of the scam modal's QR codes have been stamped
   SCAM. Shared by the scam modal (content/scam.js), where tapping a scam
   QR code stamps it, and its panel on the obelisk (obelisk.js), which
   shows the stamp on its own QR once that code is stamped.

   Which codes are stamped is kept in localStorage, so it holds after the
   modal closes, across the slug pages and over a reload.

   Exports:
     STAMP_SRC              the stamp's art, site-root relative
     isStamped(key)         boolean
     getStamped()           a copy of the stamped keys
     stamp(key)             stamp code `key` and announce it
     resetStamps()          stamp nothing and announce it
     onStampChange(fn)      call fn() on every change; returns a function
                            that stops it
   ========================================================================== */

export const STAMP_SRC = "scam/assets/scam-stamp.svg";
const STORAGE_KEY = "coded-life:scam-stamped";

let stamped = read();
const listeners = new Set();

function read() {
  try {
    const keys = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(keys)) return new Set(keys.filter((k) => typeof k === "string"));
  } catch {
  }
  return new Set();
}

export function isStamped(key) {
  return stamped.has(key);
}

export function getStamped() {
  return [...stamped];
}

export function stamp(key) {
  if (stamped.has(key)) return;
  setStamped(new Set([...stamped, key]));
}

export function resetStamps() {
  if (!stamped.size) return;
  setStamped(new Set());
}

function setStamped(next) {
  stamped = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...stamped]));
  } catch {
  }
  for (const fn of listeners) fn();
}

export function onStampChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
