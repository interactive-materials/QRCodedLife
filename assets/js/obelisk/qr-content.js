/* ==========================================================================
   qr-content.js — the 11 page entries for the obelisk.

   This is the file to edit when writing real copy.
   Keys map to the panels on the obelisk:
     face1-1  anatomy
     face1-2  contrast
     face1-3  reliable
     face2-1  tiles
     face2-2  handdrawn
     face2-3  lens-c   (lenticular panel's centre view)
     face2-4  angle
     face2-5  color
     face2-6  scam

   lens-l / lens-r are the lenticular panel's left / right views (see
   routes.js); their copy is keyed by their own slug rather than a faceN-M
   id.

   Each entry: { eyebrow, title, body, image }
     eyebrow — small label above the title
     title   — heading shown on the page
     body    — string, or array of paragraph strings; basic HTML allowed
     image   — optional { src, alt }; src is resolved relative to the page
   ========================================================================== */

export const qrContent = {
  // ---- Face 1 — 3 active QR codes --------------------------------------
  "face1-1": {
    eyebrow: "Anatomy",
    title: "Anatomy of a QR code",
    body: "Finder squares, timing patterns, quiet zone — every module has a job. Placeholder copy — replace with the exhibition text for this panel.",
    image: null,
  },
  "face1-2": {
    eyebrow: "Contrast",
    title: "Contrast & readability",
    body: "A scanner needs enough contrast between light and dark modules to read a code at all. Placeholder copy for this panel.",
    image: null,
  },
  "face1-3": {
    eyebrow: "Reliability",
    title: "Built to be reliable",
    body: "Error correction lets a code stay scannable even when part of it is damaged or obscured. Placeholder copy.",
    image: null,
  },

  // ---- Face 2 — 6 active QR codes (vertical column) ---------------------
  "face2-1": {
    eyebrow: "Tiles",
    title: "Tiled patterns",
    body: "Repeating a code as a tiled pattern turns a functional mark into a decorative surface. Placeholder copy.",
    image: null,
  },
  "face2-2": {
    eyebrow: "Handwritten",
    title: "Handwritten codes",
    body: "Drawn by hand, a QR code can still scan — as long as the geometry survives. Placeholder copy.",
    image: null,
  },
  "face2-3": {
    eyebrow: "Lenticular · center",
    title: "Lenticular illusion — center",
    body: "Viewed head-on, this lenticular panel shows its centre image. Placeholder copy.",
    image: null,
  },
  "face2-4": {
    eyebrow: "Perspective",
    title: "Perspective distortion",
    body: "A code stretched or skewed in perspective can still be decoded once it's straightened out. Placeholder copy.",
    image: null,
  },
  "face2-5": {
    eyebrow: "Color",
    title: "Color contrast",
    body: "Replacing black and white with colour still works, as long as the contrast a scanner relies on survives. Placeholder copy.",
    image: null,
  },
  "face2-6": {
    eyebrow: "Scam",
    title: "Spot the scam",
    body: "Not every code is trustworthy — a tampered or malicious QR code looks just like any other. Placeholder copy.",
    image: null,
  },

  // ---- Standalone, not yet wired to a panel -----------------------------
  "lens-l": {
    eyebrow: "Lenticular · left",
    title: "Lenticular illusion — left",
    body: "Viewed from the left, this lenticular panel reveals a different code than from the centre or right. Placeholder copy.",
    image: null,
  },
  "lens-r": {
    eyebrow: "Lenticular · right",
    title: "Lenticular illusion — right",
    body: "Viewed from the right, the panel shifts again to its third and final image. Placeholder copy.",
    image: null,
  },
};
