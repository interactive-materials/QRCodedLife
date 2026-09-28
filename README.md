# QRCodedLife

Static site for the QRCodedLife exhibition: a navigable 3D obelisk where each
active QR code links to its own page. No build step.

## Structure

```
index.html                 the obelisk scene
anatomy-qr/, contrast-qr/, reliability-qr/
                            face 1's 3 pages
tiles-qr/, handwritten-qr/,
lenticular-qr-left/, lenticular-qr-center/, lenticular-qr-right/,
perspective-qr/, color-qr/, scam-qr/
                            face 2's 8 pages
assets/css/                base.css (shared) + obelisk.css (3D stage/HUD)
assets/js/obelisk/
  obelisk.js                  builds the 3D obelisk + its faces/panels
  routes.js                   QR id -> page slug map
  qr-content.js                <- edit this to write the page copy
  qr-page.js                   fills a page from its `data-qr-id`
  main.js                      scene bootstrap, camera, input, routing
assets/vendor/three/        pinned Three.js + OrbitControls (only dependency)
```

## The obelisk

Triangular prism, 0.60 m equilateral base, 2.00 m tall, colour `#112777`.

- **Face 1** — 3 active QR codes, stacked vertically: `anatomy-qr`,
  `contrast-qr`, `reliability-qr`.
- **Face 2** — to the right of face 1 — a 490mm x 1270mm vertical column,
  centred on the face, of 8 equal full-width rows stacked top to bottom:
  `tiles-qr`, `handwritten-qr`, `lenticular-qr-left`, `lenticular-qr-center`,
  `lenticular-qr-right`, `perspective-qr`, `color-qr`, `scam-qr`.

  The 3 lenticular pages share one physical panel — for now only
  `lenticular-qr-center` renders and links; `lenticular-qr-left` and
  `lenticular-qr-right` stay reserved as blank, unclickable space until the
  lenticular viewing-angle effect is implemented (see `F2_ROW_ACTIVE` in
  [`obelisk.js`](assets/js/obelisk/obelisk.js)).
- **Face 3** — blank, no QR codes.

Drag / one-finger to orbit, scroll / pinch or the on-screen buttons to zoom,
tap a QR code to open its page. Auto-rotates when idle (off under
`prefers-reduced-motion`).

All page copy lives in [`assets/js/obelisk/qr-content.js`](assets/js/obelisk/qr-content.js).

## Run locally

ES-module import maps need a real server (not `file://`). Pick one:

```bash
npx serve .
# or
python -m http.server 8000
```

Then open the printed URL. No `npm install`.

## Deploy (GitHub Pages)

**Settings ▸ Pages ▸ Build and deployment ▸ Deploy from a branch**, branch
`main`, folder `/ (root)`. The `.nojekyll` file makes Pages serve `assets/**`
untouched. `CNAME` points the custom domain (`qrcoded.life`) at this site.

## Updating Three.js

Replace the two files in `assets/vendor/three/` with a matching pair from the
same release:

```bash
V=0.172.0
curl -sSL -o assets/vendor/three/three.module.min.js \
  https://cdn.jsdelivr.net/npm/three@$V/build/three.module.min.js
curl -sSL -o assets/vendor/three/OrbitControls.js \
  https://cdn.jsdelivr.net/npm/three@$V/examples/jsm/controls/OrbitControls.js
```
