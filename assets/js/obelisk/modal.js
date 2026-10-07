/* ==========================================================================
   modal.js — native <dialog> wrapper for the QR pop-ups.

   Each modal is its own file, content/<slug>.js, loaded on first open. A
   file that default-exports a function renders itself (render({ titleId })
   returns its HTML, as content/anatomy.js does); one that default-exports
   copy ({ eyebrow, title, body, image }) is laid out by
   content/modal-layout.js's renderModal(). A content file may also
   export mount(contentEl) — e.g. to start its own canvas — called once its
   HTML is in place; it returns a function that undoes it, called when the
   modal closes or shows something else.

   Exports:
     initModal()        wire up the dialog once on page load
     openModal(qrId)    load + fill + show the modal for a QR id (or a
                        lens-l / lens-r slug)
     closeModal()       close it if open
     isModalOpen()      boolean (either modal)
     initAbout()        wire up the About modal and its top-right icon

   Dispatches on `document`:
     "modal:open"  { detail: { qrId } }
     "modal:close"
   ========================================================================== */

import { renderModal } from "../../../content/modal-layout.js";
import { pageRoutes } from "./routes.js";

const CONTENT_DIR = new URL("../../../content/", import.meta.url);

let dialog;
let contentEl;
let aboutDialog;
let openToken = 0; // drops a slow load if another open/close happened since
let unmount = null; // undoes the open modal's mount(), if it has one

// cached per slug, so reopening a modal doesn't refetch it
const loaded = new Map();
function loadContent(slug) {
  if (!loaded.has(slug)) {
    loaded.set(
      slug,
      import(new URL(`${slug}.js`, CONTENT_DIR).href),
    );
  }
  return loaded.get(slug);
}

export function initModal() {
  dialog = document.getElementById("qr-modal");
  contentEl = document.getElementById("qr-modal-content");

  document
    .getElementById("qr-modal-close")
    .addEventListener("click", () => dialog.close());

  // a [data-scroll-to] button scrolls its modal's text section to the
  // element with that id
  contentEl.addEventListener("click", (e) => {
    const button = e.target.closest("[data-scroll-to]");
    if (button) scrollToPart(button.dataset.scrollTo);
  });

  // click on the backdrop (outside .modal__inner) closes
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });

  dialog.addEventListener("close", () => {
    unmountContent();
    document.dispatchEvent(new CustomEvent("modal:close"));
  });
}

function unmountContent() {
  if (unmount) unmount();
  unmount = null;
}

function scrollToPart(id) {
  const target = document.getElementById(id);
  const scroller = target && target.closest(".modal__text");
  if (!scroller) return;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  scroller.scrollTo({
    top: target.offsetTop, // .modal__text is the offsetParent
    behavior: reduceMotion ? "auto" : "smooth",
  });
}

export async function openModal(qrId) {
  const slug = pageRoutes[qrId] ?? qrId;
  const token = ++openToken;
  let mod;
  try {
    mod = await loadContent(slug);
  } catch (err) {
    loaded.delete(slug); // let a later open retry
    console.warn(`No content/${slug}.js for "${qrId}"`, err);
    return;
  }
  if (token !== openToken) return;

  unmountContent();
  contentEl.innerHTML =
    typeof mod.default === "function"
      ? mod.default({ titleId: "qr-modal-title" })
      : renderModal(mod.default, {
          titleId: "qr-modal-title",
          fallbackTitle: qrId,
        });
  if (mod.mount) unmount = mod.mount(contentEl) || null;

  if (!dialog.open) dialog.showModal();
  document.dispatchEvent(
    new CustomEvent("modal:open", { detail: { qrId } }),
  );
}

export function isModalOpen() {
  return Boolean((dialog && dialog.open) || (aboutDialog && aboutDialog.open));
}

export function closeModal() {
  openToken++;
  if (dialog && dialog.open) dialog.close();
}

// The About modal shares the QR modal's look but none of its routing: it
// doesn't change the URL or the sky, so it fires no modal:* events.
export function initAbout() {
  aboutDialog = document.getElementById("about-modal");
  loadContent("about").then((mod) => {
    document.getElementById("about-modal-content").innerHTML = renderModal(
      mod.default,
      { titleId: "about-modal-title" },
    );
  });

  document
    .getElementById("about-open")
    .addEventListener("click", () => aboutDialog.showModal());
  document
    .getElementById("about-modal-close")
    .addEventListener("click", () => aboutDialog.close());
  aboutDialog.addEventListener("click", (e) => {
    if (e.target === aboutDialog) aboutDialog.close();
  });
}
