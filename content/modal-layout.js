/* ==========================================================================
   modal-layout.js — the shared layout every modal is rendered with.

   Each content/<slug>.js file (plus content/about.js) default-exports
     { eyebrow, title, body, image }
       eyebrow — small label above the title
       title   — heading shown in the modal
       body    — string, or array of paragraph strings; basic HTML allowed
       image   — optional { src, alt }; src is relative to the site root

   renderModal() turns one of those into the modal's HTML. Edit this to
   change the format of every modal at once; edit a content file to change
   one modal's copy. The close button stays outside, in each page's HTML.
   ========================================================================== */

// image srcs are site-root relative, so they work from any slug folder
const SITE_ROOT = new URL("../", import.meta.url);

function paragraphs(body) {
  const list = Array.isArray(body) ? body : [body];
  return list
    .filter(Boolean)
    .map((p) => `<p>${p}</p>`)
    .join("");
}

function image(img) {
  if (!img || !img.src) return "";
  return `<img src="${new URL(img.src, SITE_ROOT).href}" alt="${img.alt || ""}" loading="lazy" />`;
}

// titleId lets the <dialog>'s aria-labelledby point at the heading
export function renderModal(entry, { titleId, fallbackTitle = "" } = {}) {
  return `
    <p class="modal__eyebrow">${entry.eyebrow || "QR code"}</p>
    <h2 class="modal__title" id="${titleId}">${entry.title || fallbackTitle}</h2>
    <div class="modal__body">
      ${paragraphs(entry.body)}
      ${image(entry.image)}
    </div>
  `;
}
