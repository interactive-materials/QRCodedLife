/* ==========================================================================
   background-digital.js — the sky behind the obelisk: a gradient dome, shaded by
   view direction alone, so it reads as infinitely far away, with columns
   of falling 0s and 1s drawn over it.

   Above the horizon it fades from `horizon` up to `zenith` (`exponent`
   shapes the fade: > 1 keeps the pale band near the horizon wider);
   below it, past the floor's edge, it fades from `horizon` down to
   `ground` over `groundFade` (0..1 of the way to straight down).

   The digits fall in `columns` columns round the camera, `rows` digits
   from the horizon to straight up, at `speed` rows per second (each
   column a little faster or slower). Each column is a series of trails
   `trail` digits long, brightest at the falling head; `flicker` is how
   many times a second a digit may flip (0 = never). `opacity` 0 turns
   the rain off.

   The dome is a unit sphere seen from inside, re-centred on the camera
   every frame and drawn first at the far plane (depth = w) without
   writing depth, so it is never clipped by camera.far, never hides the
   scene, and never moves as the camera orbits or pans.

   buildSky(options?)      -> THREE.Mesh   (add to the scene; the scene
                                            must be re-rendered every
                                            frame for the rain to move)
   setSky(sky, options?)   sets the sky to SKY + options, easing colours
                           and opacity over `fade` seconds; no options
                           restores the default SKY
   skyForSlug              per-QR sky options, keyed by URL slug; applied
                           by main.js while that QR's modal is open
   animated                true: main.js redraws every frame

   Pick this sky or background-plain.js in background.js.
   ========================================================================== */

import * as THREE from "three";

export const SKY = {
  zenith: "#000000", // straight up
  horizon: "#0a0f0c", // a hair lighter, so the floor's edge still reads
  ground: "#000000", // below the horizon, beyond the floor
  exponent: 0.6,
  groundFade: 0.08,

  digitColor: "#3cff7a",
  opacity: 0.6,
  columns: 96, // a whole number, so the seam behind the camera never shows
  rows: 40,
  speed: 3,
  trail: 24,
  flicker: 0,

  fade: 0.8, // seconds setSky takes to ease to new colours / opacity
};

// Change the sky while a QR's modal is open: anything left out falls back
// to SKY. Slugs are those in routes.js (lens-l / lens-c / lens-r too).
export const skyForSlug = {
  // color: { zenith: "#e8a9c6", digitColor: "#7d3a5c", speed: 6 },
};

export const animated = true;

const COLORS = ["zenith", "horizon", "ground", "digitColor"];
const EASED = ["opacity"];
const NUMBER_ARRAY = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,1,1,1,0,1,0,0,1,1,0,1,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,1,1,0,1,0,1,0,1,1,1,1,0,1,1,0,1,1,1,1,1,0,1],
  [1,0,1,0,0,0,1,0,1,1,1,1,1,0,1,0,0,0,1,0,1,0,0,0,1,0,1],
  [1,0,1,0,0,0,1,0,1,0,0,0,1,0,0,0,1,1,1,0,1,0,0,0,1,0,1],
  [1,0,1,0,0,0,1,0,1,1,0,1,1,1,1,1,1,0,1,0,1,0,0,0,1,0,1],
  [1,0,1,1,1,1,1,0,1,1,0,1,0,0,0,0,0,1,1,0,1,1,1,1,1,0,1],
  [1,0,0,0,0,0,0,0,1,0,1,0,1,0,1,0,1,0,1,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,0,0,0,1,1,1,1,0,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,1,1,0,1,1,0,1,0,1,0,0,1,1,0,1,0,1,0,1,0,1,1],
  [1,1,1,1,0,1,1,1,0,1,1,0,1,0,1,1,1,1,0,1,0,1,1,1,0,1,1],
  [1,0,1,1,1,1,1,0,1,1,1,0,1,1,1,0,0,1,1,0,0,1,0,1,0,0,1],
  [1,1,1,1,0,1,1,1,1,0,1,1,1,0,1,0,0,0,1,1,1,1,1,1,1,0,1],
  [1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,1,0,0,0,0,1,0,0,0,1],
  [1,0,0,0,0,1,0,1,0,1,1,1,1,1,0,1,1,0,1,1,0,1,0,1,0,1,1],
  [1,0,1,0,1,0,1,0,0,1,1,0,0,0,0,0,0,0,1,0,0,0,0,1,0,0,1],
  [1,0,1,1,1,1,1,1,0,0,0,0,0,1,1,0,0,0,0,1,0,0,1,1,1,0,1],
  [1,0,1,1,0,0,1,0,1,0,0,1,0,1,1,1,0,0,0,0,0,0,1,0,1,1,1],
  [1,1,1,1,1,1,1,1,1,0,0,1,1,0,0,1,0,0,1,1,1,0,0,1,1,1,1],
  [1,0,0,0,0,0,0,0,1,0,1,0,1,1,0,0,1,0,1,0,1,0,1,0,0,0,1],
  [1,0,1,1,1,1,1,0,1,1,0,1,1,0,0,1,1,0,1,1,1,0,0,1,0,0,1],
  [1,0,1,0,0,0,1,0,1,0,0,1,1,0,1,0,0,0,0,0,0,0,1,0,0,0,1],
  [1,0,1,0,0,0,1,0,1,0,0,1,1,1,1,1,0,1,0,0,1,0,0,0,0,0,1],
  [1,0,1,0,0,0,1,0,1,0,0,1,0,0,1,1,1,1,1,1,1,1,0,0,1,0,1],
  [1,0,1,1,1,1,1,0,1,0,1,0,0,1,1,0,0,0,0,1,0,0,0,1,1,0,1],
  [1,0,0,0,0,0,0,0,1,0,0,0,0,1,1,1,1,1,0,1,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
]

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

  uniform float time;
  uniform sampler2D digits; // "0" | "1" side by side
  uniform vec3 digitColor;
  uniform float opacity;
  uniform float columns;
  uniform float rows;
  uniform float speed;
  uniform float trail;
  uniform float flicker;

  varying vec3 vDir;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y; // -1 straight down .. 1 straight up
    vec3 color = h >= 0.0
      ? mix(horizon, zenith, pow(h, exponent))
      : mix(horizon, ground, smoothstep(0.0, groundFade, -h));

    // u: 0..1 round the camera, v: -1..1 straight down to straight up
    vec2 uv = vec2(atan(d.z, d.x) / 6.2831853 + 0.5, asin(h) / 1.5707963);

    float col = floor(uv.x * columns);
    float colSpeed = speed * (0.5 + hash(vec2(col, 1.0)));
    float y = uv.y * rows + time * colSpeed; // grows with time: digits fall
    float row = floor(y);
    vec2 cell = fract(vec2(uv.x * columns, y));

    float flip = floor(time * flicker + hash(vec2(col, row)) * 7.0);
    float bit = step(0.5, hash(vec2(col, row + flip * 0.137)));
    float glyph = texture2D(digits, vec2((bit + cell.x) * 0.5, cell.y)).r;

    // trails: brightest at the falling (lowest) digit, fading upward
    float t = 1.0 - fract(row / trail + hash(vec2(col, 3.0)));
    glyph *= t * t;
    // fade out where the columns pinch together, straight up and down
    glyph *= 1.0 - smoothstep(0.75, 0.95, abs(h));

    color = mix(color, digitColor, glyph * opacity);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// "0" and "1" in white on a 2:1 canvas, sampled as a mask
function buildDigitAtlas() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.font = "bold 52px monospace";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("0", 32, 34);
  g.fillText("1", 96, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  // no mipmaps: the cell lookup jumps at every cell edge, which would pick
  // the tiniest mip there and draw a faint grid of lines
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

export function buildSky(options = {}) {
  const s = { ...SKY, ...options };
  const uniforms = {
    time: { value: 0 },
    digits: { value: buildDigitAtlas() },
  };
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
  // easing toward the values set by setSky: { from, to, start, fade }
  sky.userData.easing = null;

  sky.onBeforeRender = (renderer, scene, camera) => {
    sky.position.copy(camera.position);
    sky.updateMatrixWorld();
    const now = performance.now() / 1000;
    uniforms.time.value = now;
    stepEasing(sky, now);
  };
  return sky;
}

export function setSky(sky, options = {}) {
  const s = { ...SKY, ...options };
  const u = sky.material.uniforms;
  const from = {};
  const to = {};
  for (const key of Object.keys(s)) {
    if (key === "fade") continue;
    if (COLORS.includes(key)) {
      from[key] = u[key].value.clone();
      to[key] = new THREE.Color(s[key]);
    } else if (EASED.includes(key)) {
      from[key] = u[key].value;
      to[key] = s[key];
    } else {
      u[key].value = s[key]; // density / speed changes snap at once
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
  for (const key of Object.keys(e.to)) {
    if (COLORS.includes(key)) u[key].value.lerpColors(e.from[key], e.to[key], t);
    else u[key].value = e.from[key] + (e.to[key] - e.from[key]) * t;
  }
  if (k >= 1) sky.userData.easing = null;
}
