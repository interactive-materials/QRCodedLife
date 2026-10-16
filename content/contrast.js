/* ==========================================================================
   contrast.js — the modal for /contrast/: its copy and layout, all in this
   file.

   Default-exports render({ titleId }), which returns the modal's HTML:
   the subtitle in the header row (beside the close button), then the
   title and copy. The close button stays outside, in each page's HTML.
   ========================================================================== */

const copy = {
  subtitle: "What makes a QR code scannable?",
  title: "Contrast & readability",
  body: [
    "A scanner needs enough contrast between light and dark modules to read a code at all. Placeholder copy for this panel.",
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
          ${copy.body.map((p) => `<p>${p}</p>`).join("")}
        </div>
      </div>
    </div>
  `;
}
