/* ==========================================================================
   main.js — obelisk bootstrap. Tapping an active QR code is a plain
   navigation to its own page (.../page-N/).
   ========================================================================== */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildObelisk, setPanelHover, setPanelEnabled } from "./obelisk.js";
import { pageRoutes } from "./routes.js";

const canvas = document.getElementById("scene");
const statusEl = document.getElementById("status");
const hintEl = document.getElementById("hint");

const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;
const finePointer = window.matchMedia("(pointer: fine)").matches;

let renderer, scene, camera, controls, obelisk;
let renderRequested = false;
let idleTimer = 0;
const IDLE_MS = 4000;

const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let hoveredPanel = null;
const down = { x: 0, y: 0, t: 0, valid: false };

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
  controls.rotateSpeed = 0.9;
  controls.zoomSpeed = 0.9;
  controls.minPolarAngle = Math.PI * 0.12;
  controls.maxPolarAngle = Math.PI * 0.88;
  controls.target.set(0, 0, 0);
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = 0.6;
  controls.addEventListener("change", requestRender);
  controls.addEventListener("start", onInteractStart);
  controls.addEventListener("end", scheduleIdle);

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

  frameCamera();
  addEventListeners();

  statusEl.hidden = true;
  scheduleIdle();
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
  if (moving || controls.autoRotate) requestRender();
}

/* ---- idle / auto-rotate -------------------------------------------- */
function onInteractStart() {
  controls.autoRotate = false;
  clearTimeout(idleTimer);
  dismissHint();
}

function scheduleIdle() {
  if (reducedMotion) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    controls.autoRotate = true;
    requestRender();
  }, IDLE_MS);
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
