/* ==========================================================================
   routes.js — QR id -> URL slug map.

   Face 1 has 3 active QR codes: anatomy, contrast, reliability. Face 2, to
   the right of face 1, has 6 active QR codes arranged as a vertical
   column: tiles, handwritten, lenticular (centre view only, for now),
   perspective, color, scam. Face 3 is blank and has none.

   lenticular-qr-left and lenticular-qr-right exist as standalone pages but
   have no obelisk panel yet — they share one physical spot with
   lenticular-qr-center and aren't wired up here until that's ready.
   ========================================================================== */

export const pageRoutes = {
  "face1-1": "anatomy-qr",
  "face1-2": "contrast-qr",
  "face1-3": "reliability-qr",
  "face2-1": "tiles-qr",
  "face2-2": "handwritten-qr",
  "face2-3": "lenticular-qr-center",
  "face2-4": "perspective-qr",
  "face2-5": "color-qr",
  "face2-6": "scam-qr",
};

export function invert(routes) {
  return Object.fromEntries(
    Object.entries(routes).map(([qrId, slug]) => [slug, qrId]),
  );
}
