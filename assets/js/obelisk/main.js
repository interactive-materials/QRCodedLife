/* ==========================================================================
   main.js — obelisk bootstrap. Tapping an active QR code opens its modal
   and pushes the URL to .../<slug>/ (no reload); closing it pops back to
   the base URL. Loading .../<slug>/ directly — a real folder holding a
   copy of this page, since GitHub Pages has no server-side rewrites —
   opens that modal on load, so a scanned QR lands here.

   Controls: one-finger / left-drag orbits round the obelisk's vertical
   axis only — the camera stays level, never tilting up or down.
   Right-drag (or shift-drag) and a two-finger touch drag pan the view
   up and down only, never side to side.
   The mouse wheel, pinch (touch) or trackpad pinch zooms in toward the
   point under the cursor / fingers; the +/- buttons zoom in toward the
   middle of the view. Zooming out heads back to the starting view.
   ========================================================================== */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildObelisk, setPanelHover, setPanelEnabled } from "./obelisk.js";
import { buildSky, setSky, isEasing, skyForSlug, animated as skyAnimated } from "./background.js";
import { initModal, initAbout, openModal, closeModal, isModalOpen } from "./modal.js";
import { pageRoutes, contentForSlug } from "./routes.js";

const canvas = document.getElementById("scene");
const statusEl = document.getElementById("status");
const hintEl = document.getElementById("hint");

const finePointer = window.matchMedia("(pointer: fine)").matches;

let renderer, scene, camera, controls, obelisk, sky;
let renderRequested = false;
let lastTick = 0;

// how close the camera may get to its orbit target (m) when zooming in on
// a point of the obelisk — close enough to reach the angle prism's 150mm
// scan point. Zooming at empty space stops at farMinDist instead.
const MIN_ZOOM_DIST = 0.06;
let farMinDist = 1;
// the starting view's distance from the obelisk's centre (m), set by
// frameCamera; zooming out heads back to it and stops there
let homeDist = 1;
const HOME_TARGET = new THREE.Vector3(0, 0, 0);
// the camera never gets closer than this to the obelisk's surface (m)
const SURFACE_MARGIN = 0.02;
// the closest keepCameraOutside may pull the camera to its target (m);
// also OrbitControls' own minDistance, so the two never fight over it
const MIN_ORBIT_DIST = MIN_ZOOM_DIST / 2;
// field of view widens from FAR_FOV to a phone-camera-like CLOSE_FOV as
// the camera closes in on its target (between FOV_RANGE, m), so the angle
// prism fits on screen from its 150mm scan point
const FAR_FOV = 35;
const CLOSE_FOV = 70;
const FOV_RANGE = [0.15, 0.8];
// the orbit target stays within this radius (m) of the obelisk's axis
const PAN_RADIUS = 0.6;

const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let hoveredPanel = null;
const down = { x: 0, y: 0, t: 0, valid: false, tap: false };

// the mouse/pen pointer doing a right- or shift-drag pan: { id, y }
let dragPan = null;

// active touch pointers (id -> {x, y}), for two-finger scroll + pinch
const touches = new Map();
let twoFinger = null; // { midX, midY, dist } at the last two-finger move

/* ---- URL <-> modal routing ------------------------------------------- */
function dirPath() {
  return location.pathname.replace(/index\.html$/, "");
}

function slugFromPath() {
  const m = dirPath().match(/([^/]+)\/?$/);
  return m && contentForSlug[m[1]] ? m[1] : null;
}

function basePath() {
  const slug = slugFromPath();
  return slug ? dirPath().replace(new RegExp(slug + "/?$"), "") : dirPath();
}

function syncFromUrl() {
  const slug = slugFromPath();
  if (slug) openModal(contentForSlug[slug]);
  else closeModal();
}

/* ---- init ------------------------------------------------------------- */
function init() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (err) {
    fail("This browser could not start WebGL.");
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000); // cleared first; the sky draws over it
  sky = buildSky();
  scene.add(sky);

  camera = new THREE.PerspectiveCamera(FAR_FOV, 1, 0.1, 100);
  camera.position.set(0.9, 0.4, 1.5);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  // OrbitControls only orbits: its pan moves sideways too, so right-drag /
  // shift-drag (vertical pan), the wheel and two-finger gestures (vertical
  // pan + zoom-to-point) are all handled below
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.touches.TWO = null;
  controls.rotateSpeed = 0.9;
  controls.zoomSpeed = 0.9;
  // level camera: orbit horizontally only
  controls.minPolarAngle = Math.PI / 2;
  controls.maxPolarAngle = Math.PI / 2;
  controls.target.set(0, 0, 0);
  controls.addEventListener("change", () => {
    clampTarget();
    keepCameraOutside();
    requestRender();
  });
  controls.addEventListener("start", onInteractStart);

  scene.add(new THREE.HemisphereLight(0xfff6e8, 0x8a8397, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(2.5, 4, 3);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe4ff, 0.5);
  fill.position.set(-3, 1, -2);
  scene.add(fill);

  obelisk = buildObelisk();
  scene.add(obelisk.group);
  obelisk.qrTargets.forEach((panel) =>
    setPanelEnabled(panel, Boolean(pageRoutes[panel.userData.qrId])),
  );

  // text is redrawn once its web font arrives, and image panels appear
  // once loaded
  obelisk.assetsReady.then(requestRender);

  initModal();
  initAbout();
  document.addEventListener("modal:open", (e) => {
    const { qrId } = e.detail;
    setSky(sky, skyForSlug[pageRoutes[qrId] ?? qrId]);
    setPanelHover(hoveredPanel, false);
    hoveredPanel = null;
    canvas.style.cursor = "";
    requestRender();
  });
  document.addEventListener("modal:close", () => {
    setSky(sky);
    if (slugFromPath()) history.pushState({}, "", basePath());
  });
  window.addEventListener("popstate", syncFromUrl);

  frameCamera();
  addEventListeners();

  statusEl.hidden = true;
  syncFromUrl(); // open the modal on load if the URL points at one
  requestRender();
}

function fail(msg) {
  statusEl.textContent = msg;
  statusEl.hidden = false;
}

/* ---- camera framing (responsive) ------------------------------------- */
function frameCamera(keepDirection = false) {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  camera.aspect = w / h;

  const fov = (FAR_FOV * Math.PI) / 180; // framing is always from afar
  const margin = camera.aspect < 0.8 ? 1.3 : 1.22;
  const fitHeightDist = (obelisk.height * margin) / (2 * Math.tan(fov / 2));
  const fitWidthDist = (0.95 * margin) / (2 * Math.tan(fov / 2) * camera.aspect);
  const dist = Math.max(fitHeightDist, fitWidthDist);

  const dir = keepDirection
    ? camera.position.clone().sub(controls.target).normalize()
    : new THREE.Vector3(0.92, 0, 0.55).normalize();

  camera.position.copy(dir.multiplyScalar(dist).add(controls.target));
  camera.near = 0.01; // near enough for close-up zoom
  camera.far = Math.max(dist * 10, obelisk.floorRadius * 1.5); // past the floor's edge
  camera.updateProjectionMatrix();

  controls.minDistance = MIN_ORBIT_DIST;
  farMinDist = dist * 0.45;
  homeDist = dist;
  controls.maxDistance = dist;
  controls.update();
  requestRender();
}

/* ---- render on demand ----------------------------------------------- */
function requestRender() {
  if (renderRequested) return;
  renderRequested = true;
  requestAnimationFrame(tick);
}

function tick(now) {
  renderRequested = false;
  const dt = Math.min(0.1, (now - lastTick) / 1000 || 0);
  lastTick = now;
  const moving = controls.update();
  updateFov();
  const animating = obelisk.update(camera, dt);
  renderer.render(scene, camera);
  // an animated sky (see background.js) redraws every frame; the browser
  // pauses this while the tab is hidden
  if (moving || animating || skyAnimated || isEasing(sky)) requestRender();
}

function updateFov() {
  const d = camera.position.distanceTo(controls.target);
  const t = THREE.MathUtils.smoothstep(d, FOV_RANGE[0], FOV_RANGE[1]);
  const fov = THREE.MathUtils.lerp(CLOSE_FOV, FAR_FOV, t);
  if (Math.abs(fov - camera.fov) < 0.01) return;
  camera.fov = fov;
  camera.updateProjectionMatrix();
}

/* ---- interaction ---------------------------------------------------- */
function onInteractStart() {
  dismissHint();
}

function dismissHint() {
  if (hintEl && !hintEl.hidden) hintEl.hidden = true;
}

/* ---- pointer picking ---------------------------------------------- */
function setNDC(e) {
  const r = canvas.getBoundingClientRect();
  pointerNDC.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointerNDC.y = -((e.clientY - r.top) / r.height) * 2 + 1;
}

function pickPanel() {
  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObject(obelisk.group, true);
  for (const hit of hits) {
    if (hit.object.userData && hit.object.userData.ignoreRaycast) continue;
    let o = hit.object;
    while (o) {
      if (o.userData && o.userData.qrId) {
        return o.userData.disabled ? null : o;
      }
      o = o.parent;
    }
    return null;
  }
  return null;
}

function onPointerDown(e) {
  down.x = e.clientX;
  down.y = e.clientY;
  down.t = performance.now();
  down.valid = true;
  down.tap = false;
}

// pointerup only decides whether the press was a tap; the modal opens on
// the click that follows. Opening it on pointerup instead breaks touch:
// the browser's click after a tap is aimed at whatever is under the finger
// by then — the just-opened modal's backdrop — which closes it again.
function onPointerUp(e) {
  if (!down.valid) return;
  down.valid = false;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const dt = performance.now() - down.t;
  down.tap = moved <= 6 && dt <= 600;
}

function onClick(e) {
  if (!down.tap) return;
  down.tap = false;

  setNDC(e);
  const panel = pickPanel();
  if (panel) {
    // a panel can override its slug (the lenticular QR's current view)
    const slug = panel.userData.slug || pageRoutes[panel.userData.qrId];
    openModal(contentForSlug[slug]);
    history.pushState({ slug }, "", basePath() + slug + "/");
  }
}

function onPointerMove(e) {
  if (!finePointer || down.valid || isModalOpen()) return;
  setNDC(e);
  const panel = pickPanel();
  if (panel === hoveredPanel) return;
  setPanelHover(hoveredPanel, false);
  setPanelHover(panel, true);
  hoveredPanel = panel;
  canvas.style.cursor = panel ? "pointer" : "";
  requestRender();
}

/* ---- pan ------------------------------------------------------------
   Slides the camera and its orbit target together, straight up or down
   only. clampTarget keeps the target within the obelisk's height (and,
   after a zoom-to-point, near its axis).
   ------------------------------------------------------------------- */
function worldPerPixel() {
  const dist = camera.position.distanceTo(controls.target);
  const fov = (camera.fov * Math.PI) / 180;
  return (2 * dist * Math.tan(fov / 2)) / (canvas.clientHeight || 1);
}

function moveBoth(delta) {
  controls.target.add(delta);
  camera.position.add(delta);
}

function clampTarget() {
  const t = controls.target;
  const half = obelisk.height / 2;
  const clamped = new THREE.Vector3(t.x, THREE.MathUtils.clamp(t.y, -half, half), t.z);
  const r = Math.hypot(clamped.x, clamped.z);
  if (r > PAN_RADIUS) {
    clamped.x *= PAN_RADIUS / r;
    clamped.z *= PAN_RADIUS / r;
  }
  if (!clamped.equals(t)) moveBoth(clamped.sub(t));
}

// Orbiting close around a point on the surface can swing the camera into
// the obelisk; pull it back along its line to the target, just in front of
// the first surface in the way.
function keepCameraOutside() {
  const dir = camera.position.clone().sub(controls.target);
  const len = dir.length();
  if (len < 1e-6) return;
  raycaster.set(controls.target, dir.divideScalar(len));
  raycaster.near = 0.005; // skip the surface the target itself sits on
  raycaster.far = len + SURFACE_MARGIN;
  const hit = raycaster
    .intersectObject(obelisk.group, true)
    .find((h) => !h.object.userData.ignoreRaycast && !h.object.userData.noCollide);
  raycaster.near = 0;
  raycaster.far = Infinity;
  if (hit) {
    const d = Math.max(MIN_ORBIT_DIST, hit.distance - SURFACE_MARGIN);
    camera.position.copy(controls.target).addScaledVector(dir, d);
  }
}

function panBy(dy) {
  moveBoth(new THREE.Vector3(0, dy, 0));
  clampTarget();
  controls.update();
  requestRender();
}

// right-drag or shift-drag (mouse / pen): the obelisk follows the pointer
// up and down
function onDragPanStart(e) {
  if (e.pointerType === "touch") return;
  if (e.button !== 2 && !(e.button === 0 && e.shiftKey)) return;
  dragPan = { id: e.pointerId, y: e.clientY };
  onInteractStart();
}

function onDragPanMove(e) {
  if (!dragPan || e.pointerId !== dragPan.id) return;
  panBy((e.clientY - dragPan.y) * worldPerPixel());
  dragPan.y = e.clientY;
}

function onDragPanEnd(e) {
  if (dragPan && e.pointerId === dragPan.id) dragPan = null;
}

function onWheel(e) {
  e.preventDefault();
  onInteractStart();
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1;
  // the wheel zooms toward the cursor; a trackpad pinch arrives as
  // ctrl+wheel with small deltas, so it gets a stronger rate
  const rate = e.ctrlKey ? 0.01 : 0.002;
  setNDC(e);
  zoomBy(Math.exp(e.deltaY * unit * rate), pointerNDC);
}

function twoFingerState() {
  const [a, b] = [...touches.values()];
  return {
    midX: (a.x + b.x) / 2,
    midY: (a.y + b.y) / 2,
    dist: Math.hypot(a.x - b.x, a.y - b.y),
  };
}

function onTouchPointerDown(e) {
  if (e.pointerType !== "touch") return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) {
    twoFinger = twoFingerState();
    down.valid = false; // a two-finger gesture is never a tap
    onInteractStart();
  }
}

function onTouchPointerMove(e) {
  if (!touches.has(e.pointerId)) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size !== 2 || !twoFinger) return;
  const next = twoFingerState();
  // the obelisk follows the fingers, like dragging a page
  const k = worldPerPixel();
  panBy((next.midY - twoFinger.midY) * k);
  if (twoFinger.dist > 0 && next.dist > 0) {
    setNDC({ clientX: next.midX, clientY: next.midY });
    zoomBy(twoFinger.dist / next.dist, pointerNDC);
  }
  twoFinger = next;
}

function onTouchPointerEnd(e) {
  if (!touches.delete(e.pointerId)) return;
  if (touches.size < 2) twoFinger = null;
}

/* ---- zoom ------------------------------------------------------------
   Zooming in scales the camera and orbit target about the point on the
   obelisk under `ndc` (screen centre by default), so that point stays
   put on screen and the orbit centre drifts onto it — zooming in on a
   panel ends up orbiting that panel. Zooming in at empty space scales
   about the current target.

   Zooming out retraces the way back to the starting view: as the camera
   backs off toward homeDist, the orbit target eases back to the
   obelisk's centre in step, arriving exactly as the camera reaches
   homeDist, where zooming out stops. The orbit angle is kept.
   ------------------------------------------------------------------- */
function zoomBy(factor, ndc = new THREE.Vector2(0, 0)) {
  if (factor === 1) return;
  if (factor > 1) {
    zoomOutBy(factor);
    return;
  }
  // zooming in heads for the point under the cursor
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster
    .intersectObject(obelisk.group, true)
    .find((h) => !(h.object.userData && h.object.userData.ignoreRaycast));
  const pivot = hit ? hit.point : controls.target.clone();

  // only zoom right in when zooming at the obelisk itself; never let a
  // zoom-in push the camera back out
  const dist = camera.position.distanceTo(controls.target);
  const minDist = Math.min(hit ? MIN_ZOOM_DIST : farMinDist, dist);
  const clampedDist = THREE.MathUtils.clamp(
    dist * factor,
    minDist,
    controls.maxDistance,
  );
  const f = clampedDist / dist;
  if (Math.abs(f - 1) < 1e-6) return;

  controls.target.sub(pivot).multiplyScalar(f).add(pivot);
  camera.position.sub(pivot).multiplyScalar(f).add(pivot);
  clampTarget();
  controls.update();
  requestRender();
}

function zoomOutBy(factor) {
  const offset = camera.position.clone().sub(controls.target);
  const dist = offset.length();
  if (dist >= homeDist - 1e-6 && controls.target.equals(HOME_TARGET)) return;
  const next = Math.min(dist * factor, homeDist);
  // share of the remaining way home covered by this step
  const s = dist < homeDist ? (next - dist) / (homeDist - dist) : 1;
  controls.target.lerp(HOME_TARGET, s);
  camera.position.copy(controls.target).addScaledVector(offset.normalize(), next);
  controls.update();
  requestRender();
}

function addEventListeners() {
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("click", onClick);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("pointerdown", onTouchPointerDown);
  canvas.addEventListener("pointermove", onTouchPointerMove);
  canvas.addEventListener("pointerup", onTouchPointerEnd);
  canvas.addEventListener("pointercancel", onTouchPointerEnd);
  canvas.addEventListener("pointerdown", onDragPanStart);
  canvas.addEventListener("pointermove", onDragPanMove);
  canvas.addEventListener("pointerup", onDragPanEnd);
  canvas.addEventListener("pointercancel", onDragPanEnd);
  canvas.addEventListener("pointerleave", () => {
    setPanelHover(hoveredPanel, false);
    hoveredPanel = null;
    canvas.style.cursor = "";
  });

  document.getElementById("zoom-in").addEventListener("click", () => zoomBy(0.8));
  document
    .getElementById("zoom-out")
    .addEventListener("click", () => zoomBy(1.25));
  document.getElementById("reset-view").addEventListener("click", () => {
    controls.target.set(0, 0, 0);
    frameCamera(false);
    dismissHint();
  });

  let resizeRAF = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeRAF);
    resizeRAF = requestAnimationFrame(() => {
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      frameCamera(true);
    });
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "r" && !isModalOpen()) {
      controls.target.set(0, 0, 0);
      frameCamera(false);
    }
  });
}

/* ---- go ---------------------------------------------------------- */
function start() {
  init();
  if (renderer) {
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    frameCamera(false);
  }
}

start();
