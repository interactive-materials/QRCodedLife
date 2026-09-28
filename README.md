# QRCodedLife

Static site for the QRCodedLife exhibition: a navigable 3D obelisk where each
active QR code links to its own page. No build step.

## Structure

```
index.html                 the obelisk scene
anatomy/, contrast/, reliable/
                            face 1's 3 pages
tiles/, handdrawn/, lens-c/, lens-l/, lens-r/, angle/, color/, scam/
                            face 2's pages (lens-l/lens-r not yet linked)
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

- **Face 1** — a 490mm x 460mm rectangle, centred on the face: `anatomy`
  and `contrast` side by side across the top two-thirds, `reliable`
  stretched full width across the bottom third.
- **Face 2** — to the right of face 1 — a 490mm x 1270mm vertical column,
  centred on the face, of 6 equal full-width rows stacked top to bottom:
  `tiles`, `handdrawn`, `lens-c`, `angle`, `color`, `scam`.

  The 3 lenticular pages share one physical panel — for now only `lens-c`
  renders and links; `lens-l` and `lens-r` exist as standalone pages but
  have no obelisk panel until the lenticular viewing-angle effect is
  implemented (see `routes.js`).
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
