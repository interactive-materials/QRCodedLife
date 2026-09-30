/* ==========================================================================
   main.js — obelisk bootstrap. Tapping an active QR code is a plain
   navigation to its own page (.../page-N/).

   Controls: one-finger / left-drag orbits. The mouse wheel (or a
   trackpad two-finger swipe) and a two-finger touch drag scroll the view
   up and down the obelisk; pinch (touch) or ctrl+wheel (trackpad pinch)
   zooms, as do the +/- buttons.
   ========================================================================== */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildObelisk, setPanelHover, setPanelEnabled } from "./obelisk.js";
import { pageRoutes } from "./routes.js";

const canvas = document.getElementById("scene");
const statusEl = document.getElementById("status");
const hintEl = document.getElementById("hint");

const finePointer = window.matchMedia("(pointer: fine)").matches;

let renderer, scene, camera, controls, obelisk;
let renderRequested = false;

const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let hoveredPanel = null;
const down = { x: 0, y: 0, t: 0, valid: false };

// active touch pointers (id -> {x, y}), for two-finger scroll + pinch
const touches = new Map();
let twoFinger = null; // { midY, dist } at the last two-finger move

function basePath() {
  return location.pathname.replace(/index\.html$/, "");
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
  scene.background = new THREE.Color(0xf4efe3);

  camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0.9, 0.4, 1.5);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  // wheel + two-finger gestures are handled below (vertical scroll/pinch)
  controls.enableZoom = false;
  controls.touches.TWO = null;
  controls.rotateSpeed = 0.9;
  controls.zoomSpeed = 0.9;
  controls.minPolarAngle = Math.PI * 0.12;
  controls.maxPolarAngle = Math.PI * 0.88;
  controls.target.set(0, 0, 0);
  controls.addEventListener("change", requestRender);
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

  // text on the obelisk is redrawn once its web font arrives
  obelisk.fontsReady.then(requestRender);

  frameCamera();
  addEventListeners();

  statusEl.hidden = true;
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

  const fov = (camera.fov * Math.PI) / 180;
  const margin = camera.aspect < 0.8 ? 1.3 : 1.22;
  const fitHeightDist = (obelisk.height * margin) / (2 * Math.tan(fov / 2));
  const fitWidthDist = (0.95 * margin) / (2 * Math.tan(fov / 2) * camera.aspect);
  const dist = Math.max(fitHeightDist, fitWidthDist);

  const dir = keepDirection
    ? camera.position.clone().sub(controls.target).normalize()
    : new THREE.Vector3(0.92, 0.26, 0.55).normalize();

  camera.position.copy(dir.multiplyScalar(dist).add(controls.target));
  camera.near = dist / 50;
  camera.far = dist * 10;
  camera.updateProjectionMatrix();

  controls.minDistance = dist * 0.45;
  controls.maxDistance = dist * 1.7;
  controls.update();
  requestRender();
}

/* ---- render on demand ----------------------------------------------- */
function requestRender() {
  if (renderRequested) return;
  renderRequested = true;
  requestAnimationFrame(tick);
}

function tick() {
  renderRequested = false;
  const moving = controls.update();
  renderer.render(scene, camera);
  if (moving) requestRender();
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
      if (o.userData && o.userData.qrId && !o.userData.disabled) return o;
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
}

function onPointerUp(e) {
  if (!down.valid) return;
  down.valid = false;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const dt = performance.now() - down.t;
  if (moved > 6 || dt > 600) return;

  setNDC(e);
  const panel = pickPanel();
  if (panel) {
    const qrId = panel.userData.qrId;
    window.location.href = basePath() + pageRoutes[qrId] + "/";
  }
}

function onPointerMove(e) {
  if (!finePointer || down.valid) return;
  setNDC(e);
  const panel = pickPanel();
  if (panel === hoveredPanel) return;
  setPanelHover(hoveredPanel, false);
  setPanelHover(panel, true);
  hoveredPanel = panel;
  canvas.style.cursor = panel ? "pointer" : "";
  requestRender();
}

/* ---- vertical scroll ------------------------------------------------
   Slides the camera and its orbit target up/down together, keeping the
   target within the obelisk's height.
   ------------------------------------------------------------------- */
function worldPerPixel() {
  const dist = camera.position.distanceTo(controls.target);
  const fov = (camera.fov * Math.PI) / 180;
  return (2 * dist * Math.tan(fov / 2)) / (canvas.clientHeight || 1);
}

function scrollBy(dy) {
  const half = obelisk.height / 2;
  const y = THREE.MathUtils.clamp(controls.target.y + dy, -half, half);
  const applied = y - controls.target.y;
  if (!applied) return;
  controls.target.y += applied;
  camera.position.y += applied;
  controls.update();
  requestRender();
}

function onWheel(e) {
  e.preventDefault();
  onInteractStart();
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1;
  if (e.ctrlKey) {
    // trackpad pinch arrives as ctrl+wheel
    zoomBy(Math.exp(e.deltaY * unit * 0.01));
  } else {
    // scrolling down moves down the obelisk, like a page
    scrollBy(-e.deltaY * unit * worldPerPixel());
  }
}

function twoFingerState() {
  const [a, b] = [...touches.values()];
  return { midY: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) };
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
  scrollBy((next.midY - twoFinger.midY) * worldPerPixel());
  if (twoFinger.dist > 0 && next.dist > 0) zoomBy(twoFinger.dist / next.dist);
  twoFinger = next;
}

function onTouchPointerEnd(e) {
  if (!touches.delete(e.pointerId)) return;
  if (touches.size < 2) twoFinger = null;
}

/* ---- HUD + window events ----------------------------------------- */
function zoomBy(factor) {
  const offset = camera.position.clone().sub(controls.target);
  const len = THREE.MathUtils.clamp(
    offset.length() * factor,
    controls.minDistance,
    controls.maxDistance,
  );
  camera.position.copy(offset.setLength(len).add(controls.target));
  controls.update();
  requestRender();
}

function addEventListeners() {
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("pointerdown", onTouchPointerDown);
  canvas.addEventListener("pointermove", onTouchPointerMove);
  canvas.addEventListener("pointerup", onTouchPointerEnd);
  canvas.addEventListener("pointercancel", onTouchPointerEnd);
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
    if (e.key === "r") {
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
