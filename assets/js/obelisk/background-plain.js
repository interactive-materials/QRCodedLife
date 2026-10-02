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

   buildSky(options?)      -> THREE.Mesh   (add to the scene)
   setSky(sky, options?)   sets the sky to SKY + options, easing colours
                           over `fade` seconds; no options restores the
                           default SKY
   skyForSlug              per-QR sky options, keyed by URL slug; applied
                           by main.js while that QR's modal is open
   animated                false: main.js only redraws while something
                           moves (a setSky fade counts)

   Pick this sky or background-digital.js in background.js.
   ========================================================================== */

import * as THREE from "three";

export const SKY = {
  zenith: "#a9c6e8", // straight up: soft daytime blue
  horizon: "#f4efe3", // the old flat background cream
  ground: "#e6e0d4", // below the horizon, beyond the floor
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
  const s = { ...SKY, ...options };
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
  const s = { ...SKY, ...options };
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
