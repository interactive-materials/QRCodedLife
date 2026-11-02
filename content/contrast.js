/* ==========================================================================
   contrast.js — the modal for /contrast/: its copy and layout, all in this
   file.

   Default-exports render({ titleId }), which returns the modal's HTML:
   the subtitle in the header row (beside the close button), then the
   title and copy, each paragraph with its picture (if any) below it. The
   close button stays outside, in each page's HTML.
   ========================================================================== */

import { placeholder } from "./modal-layout.js";

const copy = {
  subtitle: "What makes a QR code scannable?",
  title: "QR Codes and Contrast",
  // each paragraph's figure is a placeholder for now: a dashed box per
  // panel, labelled with what goes there, and the caption under them
  body: [
    {
      text: "QR codes are commonly placed on a plain background. However, they can be scanned as long as they maintain sufficient contrast from their background.",
      figure: {
        panels: ["Placeholder image"],
        caption: "QR code of different colors with different background",
      },
    },
    {
      text: "Dark colored QR codes are best placed on a light colored background, while light colored QR codes are best placed on a dark colored background.",
      figure: {
        panels: ["Mirror QR on a white background", "Mirror QR on a black background"],
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
        <p class="modal__eyebrow">${copy.subtitle}</p>
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
