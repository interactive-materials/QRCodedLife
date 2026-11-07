/* ==========================================================================
   contrast.js — the modal for /contrast/: its copy and layout, all in this
   file.

   Default-exports render({ titleId }), which returns the modal's HTML:
   the subtitle in the header row (beside the close button), then the
   title and copy, each paragraph with its picture (if any) below it. The
   close button stays outside, in each page's HTML.
   ========================================================================== */

import { placeholder } from "./modal-layout.js";

const img = (name) => new URL(`../contrast/assets/${name}`, import.meta.url).href;

const copy = {
  subtitle: "What makes a QR&nbsp;code scannable?",
  title: "QR&nbsp;Codes and Contrast",
  body: [
    {
      text: "QR&nbsp;codes are commonly placed on a plain background. However, they can be scanned as long as they maintain sufficient contrast from their background.",
      figure: {
        src: img("color-qrs.png"),
        wide: true, // six QR codes in a grid: the full width, as reliable's matrix
        caption: "QR&nbsp;codes of different colors with different backgrounds",
      },
    },
    {
      text: "Dark colored QR&nbsp;codes are best placed on a light colored background, while light colored QR&nbsp;codes are best placed on a dark colored background.",
      figure: {
        srcs: [img("dark-bg.png"), img("light-bg.png")],
        caption: "The same mirror QR&nbsp;code with a dark background on the left and a light background on the right",
      },
    },
  ],
};

/* ---- HTML ---------------------------------------------------------------
   titleId lets the <dialog>'s aria-labelledby point at the heading. A
   figure with srcs shows its pictures side by side, the text's full width,
   as anatomy.js's wide pictures do; the caption doubles as their alt text,
   so alt is left empty. A figure with src is one picture on its own, at
   the reliable modal's gif's size (.modal__figure--single), or the
   figure's full width with wide: true. A figure with panels is a
   placeholder still.
   ------------------------------------------------------------------------ */
const picture = ({ src, caption, wide = false }) => `
          <figure class="modal__figure modal__figure--clear ${wide ? "modal__figure--wide" : "modal__figure--single"}">
            <img src="${src}" alt="" />
            <figcaption>${caption}</figcaption>
          </figure>`;

const pictures = ({ srcs, caption }) => `
          <figure class="modal__figure modal__figure--wide">
            <div class="modal__pair modal__pair--spaced">
              ${srcs.map((src) => `<img src="${src}" alt="" />`).join("")}
            </div>
            <figcaption>${caption}</figcaption>
          </figure>`;

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
          ${figure ? (figure.srcs ? pictures(figure) : figure.src ? picture(figure) : placeholder(figure)) : ""}`)
            .join("")}
        </div>
      </div>
    </div>
  `;
}
