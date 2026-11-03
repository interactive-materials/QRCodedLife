/* ==========================================================================
   scam.js — the modal for /scam/: its copy, layout and interaction, all in
   this file, in the shape of content/lentiqr.js.

   Default-exports render({ titleId }), which returns the modal's HTML:
   the header row (no subtitle on an artwork's modal, just the close
   button's row), the interactive top 40%, the rule, then the title and
   copy. Then mount(contentEl) runs the interaction; modal.js calls it
   once the HTML is in place, and calls the function it returns when the
   modal closes or changes. The close button stays outside, in each page's
   HTML.

   The top is plain HTML, not a canvas: the question, and under it the
   shop scene (scam/assets/scam-scene.png, as big as fits) with a button
   over each of its three QR codes, placed as they are in scam-scene.svg.
   Tapping one lays a panel over the picture, saying whether that QR code
   is the scam and why; its × (or Escape) takes it away again.
   ========================================================================== */

const SCENE_SRC = new URL("../scam/assets/scam-scene.png", import.meta.url).href;
const SCENE_RATIO = 2722 / 2046; // the picture's width / height

const copy = {
  title: "Be Qareful",
  question: "Which one is the scam QR code?",
  sceneLabel: "A shop with three QR codes: on the counter, on the door and on the window",
  body: [
    "The ubiquitousness of the QR code often makes it easy for us to instinctively scan any QR code we see.",
    "However, there are QR codes that direct to harmful links or are made to mimic other QR code for malicious purposes.",
    "Always check the links before visiting the site and do not download any apps from any QR code.",
  ],
};

/* ---- the QR codes -------------------------------------------------------
   Each one's button, as a share (%) of the picture: left, top, width,
   height. Its answer: whether it's the scam, a title and the copy.
   ------------------------------------------------------------------------ */
const CODES = [
  {
    label: "The Scan to Pay QR code on the counter",
    box: [19.1, 58.5, 7.0, 17.6],
    scam: false,
    title: "Scan to Pay at the Counter",
    body: [
      "This QR code sits on the counter, right by the till, where the shop takes payment. It is printed on the shop's own stand, so it belongs there.",
      "Even so, check the name your payment app shows before you pay: it should be the shop's.",
    ],
  },
  {
    label: "The membership poster's QR code on the door",
    box: [76.25, 24.75, 8.75, 18.4],
    scam: false,
    title: "The Membership Poster",
    body: [
      "The poster is the shop's own, stuck on the door to face passers-by outside, which is why its text reads backwards from in here.",
      "It asks you to download the shop's app. If its link takes you to an app, get it from the official app store and check the developer is the shop before installing; never install an app file straight from a QR code.",
    ],
  },
  {
    label: "The Scan to Pay QR code on the window",
    box: [92.5, 31.5, 6.65, 12.1],
    scam: true,
    title: "Scan to Pay on the Window",
    body: [
      "A shop takes payment at its till, not on a window by the door. This sticker is away from the counter, doesn't match the shop's own Scan to Pay stand, and lists every payment app at once.",
      "Fake payment QR codes are stuck up, or stuck over real ones, to send your money to someone else. To pay, scan the code at the till and check the name your payment app shows before confirming.",
    ],
  },
];

const verdict = (code) => (code.scam ? "Scam" : "Not a scam");

const closeIcon = `<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M1 1 13 13M13 1 1 13" /></svg>`;

/* ---- HTML ---------------------------------------------------------------
   titleId lets the <dialog>'s aria-labelledby point at the heading.
   ------------------------------------------------------------------------ */
export default function render({ titleId }) {
  return `
    <div class="modal__layout">
      <div class="modal__top">
        <header class="modal__header"></header>
        <div class="modal__stage scam">
          <p class="scam__question">${copy.question}</p>
          <div class="scam__scene">
            <div class="scam__picture" role="group" aria-label="${copy.sceneLabel}" style="--ratio: ${SCENE_RATIO}">
              <img src="${SCENE_SRC}" alt="" />
              ${CODES.map(({ label, box: [left, top, width, height] }, i) => `
              <button class="scam__code" type="button" data-code="${i}" aria-label="${label}"
                style="left: ${left}%; top: ${top}%; width: ${width}%; height: ${height}%"></button>`).join("")}
            </div>
          </div>
        </div>
      </div>
      <hr class="modal__rule" />
      <div class="modal__text">
        <h2 class="modal__title" id="${titleId}">${copy.title}</h2>
        <div class="modal__body">
          ${copy.body.map((p) => `<p>${p}</p>`).join("")}
        </div>
      </div>
    </div>
  `;
}

/* ---- the answer ---------------------------------------------------------
   A panel over the picture, made on mount and removed on unmount; filled
   with the tapped code's answer each time it opens. While it's open,
   Escape closes it rather than the modal.
   ------------------------------------------------------------------------ */
const answerHtml = (code) => `
  <p class="scam__verdict${code.scam ? " scam__verdict--scam" : ""}">${verdict(code)}</p>
  <h3 class="scam__answer-title">${code.title}</h3>
  ${code.body.map((p) => `<p>${p}</p>`).join("")}
`;

export function mount(root) {
  const stage = root.querySelector(".scam");
  const picture = stage && stage.querySelector(".scam__picture");
  if (!picture) return null;
  const dialog = root.closest("dialog");

  const answer = document.createElement("div");
  answer.className = "scam__answer";
  answer.hidden = true;
  answer.innerHTML = `
    <button class="scam__answer-close" type="button" aria-label="Close">${closeIcon}</button>
    <div class="scam__answer-text" role="status" data-answer></div>
  `;
  picture.append(answer);
  const answerText = answer.querySelector("[data-answer]");
  const closeButton = answer.querySelector(".scam__answer-close");
  let opener = null; // the code button that opened it, refocused on close

  function show(button) {
    opener = button;
    answerText.innerHTML = answerHtml(CODES[Number(button.dataset.code)]);
    answerText.scrollTop = 0;
    answer.hidden = false;
    closeButton.focus();
  }

  function hide() {
    if (answer.hidden) return;
    answer.hidden = true;
    if (opener) opener.focus();
    opener = null;
  }

  const onClick = (e) => {
    if (e.target.closest(".scam__answer-close")) return hide();
    const button = e.target.closest("[data-code]");
    if (button) show(button);
  };
  // Escape closes the answer, not the modal: stopping the keydown stops
  // the dialog's cancel (cancelling that isn't always allowed)
  const onKeydown = (e) => {
    if (e.key !== "Escape" || answer.hidden) return;
    e.preventDefault();
    hide();
  };

  stage.addEventListener("click", onClick);
  if (dialog) dialog.addEventListener("keydown", onKeydown);
  return () => {
    stage.removeEventListener("click", onClick);
    if (dialog) dialog.removeEventListener("keydown", onKeydown);
    answer.remove();
  };
}
