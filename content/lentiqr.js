/* ==========================================================================
   lentiqr.js — the modal for /lens-l/, /lens-c/ and /lens-r/: its copy,
   layout and interaction, shared by the three. Each of content/lens-l.js,
   lens-c.js and lens-r.js calls lensModal(view) for its own view of the
   lenticular QR and exports what it returns.

   lensModal(view) -> { render, mount }, in the shape of content/color.js:
   render({ titleId }) returns the modal's HTML — the header row (no
   subtitle on an artwork's modal, just the close button's row), the
   interactive top 40%, the rule, then the title and copy — and
   mount(contentEl) runs the interaction; modal.js calls it once the HTML
   is in place, and calls the function it returns when the modal closes or
   changes. The close button stays outside, in each page's HTML.

   The top is plain HTML, not a canvas: the view's QR with its emoji over
   its centre, and under it a row of a previous button, the emoji, and a
   next button. The buttons step through the view's emoji — its own eyes,
   then ten objects the views share — wrapping round. The choice is kept by assets/js/obelisk/
   lens-emoji.js, which the lenticular panel on the obelisk follows, so
   the emoji chosen here shows there, seen from this view's side.
   ========================================================================== */

import {
  EMOJI_COUNT,
  EMOJI_SIZE,
  getChoice,
  setChoice,
  onChoiceChange,
  qrSrc,
  emojiSrc,
} from "../assets/js/obelisk/lens-emoji.js";

const SIDES = ["left", "centre", "right"];

const copy = {
  title: "Lentiqr",
  stageLabel: (side) => `The lenticular QR code as seen from the ${side}`,
  prev: "Previous emoji",
  next: "Next emoji",
  picked: (i) => `Emoji ${i + 1} of ${EMOJI_COUNT}`,
  body: (side) => [
    "Lentiqr prints three QR codes on one lenticular sheet, so the code you scan depends on where you stand: left, centre or right.",
    `Choose the emoji for the view from the ${side}, and the lenticular panel on the obelisk shows it from that side.`,
    "[Placeholder: how a lenticular print works — copy to come.]",
  ],
};

const arrow = (d) =>
  `<svg viewBox="0 0 10 10" aria-hidden="true"><path d="${d}" /></svg>`;

export function lensModal(view) {
  const side = SIDES[view];

  /* ---- HTML -------------------------------------------------------------
     titleId lets the <dialog>'s aria-labelledby point at the heading. The
     QR is decorative to a screen reader (the label says what it is); the
     emoji between the buttons is read as "Emoji n of N", and a live
     region says so again when it changes.
     ---------------------------------------------------------------------- */
  function render({ titleId }) {
    const i = getChoice()[view];
    return `
      <div class="modal__layout">
        <div class="modal__top">
          <header class="modal__header"></header>
          <div class="modal__stage lens" role="group" aria-label="${copy.stageLabel(side)}">
            <div class="lens__qr">
              <div class="lens__card">
                <div class="lens__code" style="--emoji-size: ${EMOJI_SIZE * 100}%">
                  <img src="${qrSrc(view)}" alt="" />
                  <img class="lens__emoji" src="${emojiSrc(view, i)}" alt="" data-emoji />
                </div>
              </div>
            </div>
            <div class="lens__controls">
              <button class="lens__step" type="button" data-step="-1" aria-label="${copy.prev}">${arrow("M6.5 1.5 3 5l3.5 3.5")}</button>
              <img class="lens__pick" src="${emojiSrc(view, i)}" alt="${copy.picked(i)}" data-emoji />
              <button class="lens__step" type="button" data-step="1" aria-label="${copy.next}">${arrow("M3.5 1.5 7 5 3.5 8.5")}</button>
              <span class="lens__status" aria-live="polite"></span>
            </div>
          </div>
        </div>
        <hr class="modal__rule" />
        <div class="modal__text">
          <h2 class="modal__title" id="${titleId}">${copy.title}</h2>
          <div class="modal__body">
            ${copy.body(side).map((p) => `<p>${p}</p>`).join("")}
          </div>
        </div>
      </div>
    `;
  }

  function mount(root) {
    const stage = root.querySelector(".lens");
    if (!stage) return null;
    const emojiImgs = [...stage.querySelectorAll("[data-emoji]")];
    const pick = stage.querySelector(".lens__pick");
    const status = stage.querySelector(".lens__status");

    const onClick = (e) => {
      const button = e.target.closest("[data-step]");
      if (!button) return;
      const n = EMOJI_COUNT;
      setChoice(view, (getChoice()[view] + Number(button.dataset.step) + n) % n);
    };
    const unsubscribe = onChoiceChange((choice) => {
      const i = choice[view];
      for (const img of emojiImgs) img.src = emojiSrc(view, i);
      pick.alt = status.textContent = copy.picked(i);
    });

    stage.addEventListener("click", onClick);
    return () => {
      stage.removeEventListener("click", onClick);
      unsubscribe();
    };
  }

  return { render, mount };
}
