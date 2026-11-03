/* ==========================================================================
   reliable.js — the modal for /reliable/: its copy and layout, all in
   this file, in the same shape as content/contrast.js.

   Default-exports render({ titleId }), which returns the modal's HTML:
   the subtitle in the header row (beside the close button), then the
   title and copy, each paragraph with its picture (if any) below it. The
   close button stays outside, in each page's HTML.
   ========================================================================== */

import { placeholder } from "./modal-layout.js";

const copy = {
  subtitle: "Reliability",
  title: "Reliable QR Codes",
  // each paragraph's figure is a placeholder for now: a dashed box per
  // panel, labelled with what goes there, and the caption under them
  body: [
    {
      text: "A QR code contains not only data, but also information needed to correct it if it gets damaged. The error correction information enables QR codes to be decoded even when some parts are missing or covered, like when a logo is placed on top of it.",
      figure: {
        panels: ["Familiar QR codes with a logo in the middle"],
        caption: "",
      },
    },
    {
      text: "A QR code can be made with different levels of error correction, depending on where it is used. The lowest level is usually recommended for digital use, and the highest for print. A higher level of error correction also enables a bigger logo to be placed in the middle of the QR code.",
      figure: {
        panels: ["Matrix: error correction level × logo size, with whether each QR code scans"],
        caption: "",
      },
    },
  ],
};

/* ---- HTML ---------------------------------------------------------------
   titleId lets the <dialog>'s aria-labelledby point at the heading.
   ------------------------------------------------------------------------ */
export default function render({ titleId }) {
  return `
    <div class="modal__layout">
      <header class="modal__header">
        <p class="modal__subtitle">${copy.subtitle}</p>
      </header>
      <div class="modal__text">
        <h2 class="modal__title" id="${titleId}">${copy.title}</h2>
        <div class="modal__body">
          ${copy.body
            .map(({ text, figure }) => `
          <p>${text}</p>
          ${figure ? placeholder(figure) : ""}`)
            .join("")}
        </div>
      </div>
    </div>
  `;
}
