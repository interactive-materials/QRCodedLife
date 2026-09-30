/* ==========================================================================
   routes.js — QR id -> URL slug map.

   Face 1 has 3 active QR codes: anatomy, contrast, reliable. Face 2, to
   the right of face 1, has 6 active QR codes of varying size zig-zagging
   down the face: tiles, handdrawn, angle, lens-c (centre view only, for
   now), color, scam. Face 3 is blank and has none.

   lens-l and lens-r exist as standalone pages but have no obelisk panel
   yet — they share one physical spot with lens-c and aren't wired up here
   until that's ready.
   ========================================================================== */

export const pageRoutes = {
  "face1-1": "anatomy",
  "face1-2": "contrast",
  "face1-3": "reliable",
  "face2-1": "tiles",
  "face2-2": "handdrawn",
  "face2-3": "lens-c",
  "face2-4": "angle",
  "face2-5": "color",
  "face2-6": "scam",
};

export function invert(routes) {
  return Object.fromEntries(
    Object.entries(routes).map(([qrId, slug]) => [slug, qrId]),
  );
}
