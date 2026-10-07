/* ==========================================================================
   routes.js — QR id -> URL slug map.

   Each slug is also a folder (e.g. color/) holding a copy of the obelisk
   page, so a scanned QR lands on the obelisk with that slug's modal open.

   Face 1 has 3 active QR codes: anatomy, contrast, reliable. Face 2, to
   the right of face 1, has 6 active QR codes of varying size zig-zagging
   down the face: tiles, handdrawn, angle, lens, color, scam. Face 3 is
   blank and has none.

   The lens panel (face2-3) is a lenticular QR: seen from the left, centre
   or right it shows lens-l, lens-c or lens-r, and a click opens that
   view's modal (the panel's userData.slug overrides the lens-c entry
   here, which stays as its default / centre view).
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

// URL slug -> QR id. lens-l / lens-r have no panel id of
// their own, so they map to themselves.
export const contentForSlug = {
  ...invert(pageRoutes),
  "lens-l": "lens-l",
  "lens-r": "lens-r",
};
