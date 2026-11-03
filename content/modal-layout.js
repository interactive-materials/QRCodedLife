/* ==========================================================================
   modal-layout.js — the shared layout every modal is rendered with.

   Each content/<slug>.js file (plus content/about.js) default-exports
     { subtitle, title, body, image }
       subtitle — small label above the title
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

// a picture still to come, for a modal that renders its own HTML (as
// contrast.js and reliable.js do): a dashed box per panel, labelled with
// what goes there, and the caption, if any, under them
export const placeholder = ({ panels, caption }) => `
          <figure class="modal__figure">
            <div class="modal__placeholder">
              ${panels.map((label) => `<span>${label}</span>`).join("")}
            </div>
            ${caption ? `<figcaption>${caption}</figcaption>` : ""}
          </figure>`;

// titleId lets the <dialog>'s aria-labelledby point at the heading
export function renderModal(entry, { titleId, fallbackTitle = "" } = {}) {
  return `
    <p class="modal__subtitle">${entry.subtitle || "QR code"}</p>
    <h2 class="modal__title" id="${titleId}">${entry.title || fallbackTitle}</h2>
    <div class="modal__body">
      ${paragraphs(entry.body)}
      ${image(entry.image)}
    </div>
  `;
}
