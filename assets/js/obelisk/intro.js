/* ==========================================================================
   intro.js — the opening animation: the QR panels pop out onto the faces,
   all together, each with its backing (thickness edge, card) and
   captions, which are its children. The rest of the obelisk shows as it
   loads; the panels stay hidden until every one of them has loaded
   (userData.ready, set in obelisk.js), then pop in.

   makeIntro(obelisk) -> {
     prepare(),   hide the panels (call right after building, so none
                  shows as it loads)
     play(),      start the clock (call straight after prepare())
     skip(),      jump straight to the end state
     running,     true from prepare() until the animation has finished
     revealed,    Promise, resolves when the panels start popping in (or
                  the intro is skipped / never prepared)
     done,        Promise, resolves when it has finished (or was skipped)
     update(dt),  call every frame; true while animating (false while
                  only waiting for files to load)
     wake,        set to a function to call when the panels have all
                  loaded (main.js: request a frame)
   }

   With prefers-reduced-motion, the panels just appear once loaded.
   ========================================================================== */

const START_DELAY = 0.35; // s after play() before the panels can pop in
const PANEL_POP = 0.5; // s the panels take to pop in
const HIDDEN_SCALE = 1e-4; // not 0: a singular matrix upsets raycasting

// overshoots a little past 1 before settling, like a sticker pressed on
const easeOutBack = (t) => {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function makeIntro({ qrTargets }) {
  const setAll = (k) =>
    qrTargets.forEach((panel) =>
      panel.scale.setScalar(k === 0 ? HIDDEN_SCALE : k === 1 ? 1 : easeOutBack(k)),
    );

  let t = -1; // s since play(); -1 before it
  let loaded = false;
  let start; // t the panels started popping in
  let finish, reveal;
  const intro = {
    running: false,
    revealed: new Promise((resolve) => (reveal = resolve)),
    done: new Promise((resolve) => (finish = resolve)),

    prepare() {
      intro.running = true;
      setAll(0);
      Promise.all(qrTargets.map((p) => Promise.resolve(p.userData.ready).catch(() => {}))).then(() => {
        loaded = true;
        if (intro.wake) intro.wake();
      });
    },

    play() {
      if (!intro.running) {
        // never prepared: nothing to play
        reveal();
        finish();
        return;
      }
      if (t < 0) t = 0;
    },

    skip() {
      if (!intro.running) return;
      setAll(1);
      intro.running = false;
      t = -1;
      reveal();
      finish();
    },

    update(dt) {
      if (!intro.running || t < 0) return false;
      t += dt;
      // still loading: wake() asks for the next frame when they arrive
      if (!loaded) return false;
      if (reduceMotion()) {
        intro.skip();
        return false;
      }
      if (start === undefined) {
        if (t < START_DELAY) return true;
        start = t;
        reveal();
      }
      const k = Math.min(1, (t - start) / PANEL_POP);
      if (k >= 1) {
        intro.skip(); // settles every value exactly and resolves done
        return false;
      }
      setAll(k);
      return true;
    },
  };
  return intro;
}
