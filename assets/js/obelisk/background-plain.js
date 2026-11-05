/* ==========================================================================
   background-plain.js — the sky behind the obelisk: a gradient dome,
   shaded by view direction alone, so it reads as infinitely far away.

   Above the horizon it fades from `horizon` up to `zenith` (`exponent`
   shapes the fade: > 1 keeps the pale band near the horizon wider);
   below it, past the floor's edge, it fades from `horizon` down to
   `ground` over `groundFade` (0..1 of the way to straight down).

   The dome is a unit sphere seen from inside, re-centred on the camera
   every frame and drawn first at the far plane (depth = w) without
   writing depth, so it is never clipped by camera.far, never hides the
   scene, and never moves as the camera orbits or pans.

   The colours follow the viewer's local clock: TIME_OF_DAY lists
   keyframes (night, dawn, day, dusk) and the sky blends between the two
   either side of the current hour. main.js calls setSky again every
   minute so it drifts with the time. Add ?hour=19.5 to the URL to
   preview a given time.

   buildSky(options?)      -> THREE.Mesh   (add to the scene)
   setSky(sky, options?)   sets the sky to SKY + the colours for the
                           current time + options, easing colours over
                           `fade` seconds; no options restores the
                           time-of-day sky
   skyForSlug              per-QR sky options, keyed by URL slug; applied
                           by main.js while that QR's modal is open
   animated                false: main.js only redraws while something
                           moves (a setSky fade counts)

   Pick this sky or background-digital.js in background.js.
   ========================================================================== */

import * as THREE from "three";

export const SKY = {
  // zenith (straight up), horizon and ground (below the horizon, beyond
  // the floor) come from TIME_OF_DAY; set them here to pin one sky
  exponent: 0.6,
  groundFade: 0.08,

  fade: 0.8, // seconds setSky takes to ease to new colours
};

// Change the sky while a QR's modal is open: anything left out falls back
// to SKY. Slugs are those in routes.js (lens-l / lens-c / lens-r too).
export const skyForSlug = {
  // color: { zenith: "#e8a9c6" },
};

export const animated = false;

// Sky colours by local hour (0..24), in order. Between two keyframes the
// colours blend; the list wraps from the last back to the first.
const DAY = { zenith: "#a9c6e8", horizon: "#f4efe3", ground: "#e6e0d4" };
const NIGHT = { zenith: "#1f2747", horizon: "#4a4f6e", ground: "#3a3d52" };
export const TIME_OF_DAY = [
  { hour: 4.5, ...NIGHT },
  { hour: 6, zenith: "#7d8db5", horizon: "#f2c6aa", ground: "#d8c4b6" }, // dawn
  { hour: 8, ...DAY },
  { hour: 17, ...DAY },
  { hour: 19, zenith: "#6a7aa8", horizon: "#f0b08a", ground: "#d2b3a0" }, // dusk
  { hour: 20.5, ...NIGHT },
];

// ?hour=19.5 in the URL fixes the clock, for previewing
const HOUR_OVERRIDE = (() => {
  try {
    const h = parseFloat(new URLSearchParams(location.search).get("hour"));
    return Number.isFinite(h) ? ((h % 24) + 24) % 24 : null;
  } catch {
    return null;
  }
})();

function currentHour() {
  if (HOUR_OVERRIDE !== null) return HOUR_OVERRIDE;
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

// the sky colours for a local hour, as hex strings
export function skyAt(hour = currentHour()) {
  const keys = TIME_OF_DAY;
  // the last keyframe at or before `hour`, wrapping round midnight
  let i = keys.findIndex((k) => k.hour > hour) - 1;
  if (i < 0) i = keys.length - 1;
  const a = keys[i];
  const b = keys[(i + 1) % keys.length];
  const span = (b.hour - a.hour + 24) % 24 || 24;
  const t = ((hour - a.hour + 24) % 24) / span;
  const out = {};
  const c = new THREE.Color();
  for (const key of ["zenith", "horizon", "ground"]) {
    out[key] = "#" + c.lerpColors(new THREE.Color(a[key]), new THREE.Color(b[key]), t).getHexString();
  }
  return out;
}

const COLORS = ["zenith", "horizon", "ground"];

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = clip.xyww; // pin to the far plane
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform vec3 ground;
  uniform float exponent;
  uniform float groundFade;
  varying vec3 vDir;
  void main() {
    float h = normalize(vDir).y; // -1 straight down .. 1 straight up
    vec3 color = h >= 0.0
      ? mix(horizon, zenith, pow(h, exponent))
      : mix(horizon, ground, smoothstep(0.0, groundFade, -h));
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function buildSky(options = {}) {
  const s = { ...skyAt(), ...SKY, ...options };
  const uniforms = {};
  for (const [key, value] of Object.entries(s)) {
    if (key === "fade") continue;
    uniforms[key] = { value: COLORS.includes(key) ? new THREE.Color(value) : value };
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
  });

  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
  sky.name = "sky";
  sky.frustumCulled = false;
  sky.renderOrder = -1000; // draw before everything else
  // easing toward the colours set by setSky: { from, to, start, fade }
  sky.userData.easing = null;

  sky.onBeforeRender = (renderer, scene, camera) => {
    sky.position.copy(camera.position);
    sky.updateMatrixWorld();
    stepEasing(sky, performance.now() / 1000);
  };
  return sky;
}

export function setSky(sky, options = {}) {
  const s = { ...skyAt(), ...SKY, ...options };
  const u = sky.material.uniforms;
  const from = {};
  const to = {};
  for (const key of Object.keys(s)) {
    if (key === "fade") continue;
    if (COLORS.includes(key)) {
      from[key] = u[key].value.clone();
      to[key] = new THREE.Color(s[key]);
    } else {
      u[key].value = s[key];
    }
  }
  sky.userData.easing = { from, to, start: performance.now() / 1000, fade: s.fade };
}

// true while a setSky fade is still under way
export function isEasing(sky) {
  return sky.userData.easing !== null;
}

function stepEasing(sky, now) {
  const e = sky.userData.easing;
  if (!e) return;
  const u = sky.material.uniforms;
  const k = e.fade > 0 ? Math.min(1, (now - e.start) / e.fade) : 1;
  const t = k * k * (3 - 2 * k); // smoothstep
  for (const key of Object.keys(e.to)) u[key].value.lerpColors(e.from[key], e.to[key], t);
  if (k >= 1) sky.userData.easing = null;
}
