/* ==========================================================================
   modal.js — native <dialog> wrapper for the QR pop-ups.

   Exports:
     initModal()        wire up the dialog once on page load
     openModal(qrId)    fill + show the modal for a qr-content.js key
     closeModal()       close it if open
     isModalOpen()      boolean

   Dispatches on `document`:
     "modal:open"  { detail: { qrId } }
     "modal:close"
   ========================================================================== */

import { qrContent } from "./qr-content.js";

// image srcs are site-root relative, so they work from any slug folder
const SITE_ROOT = new URL("../../../", import.meta.url);

let dialog;
let eyebrowEl;
let titleEl;
let bodyEl;

function paragraphs(body) {
  const list = Array.isArray(body) ? body : [body];
  return list
    .filter(Boolean)
    .map((p) => `<p>${p}</p>`)
    .join("");
}

export function initModal() {
  dialog = document.getElementById("qr-modal");
  eyebrowEl = document.getElementById("qr-modal-eyebrow");
  titleEl = document.getElementById("qr-modal-title");
  bodyEl = document.getElementById("qr-modal-body");

  document
    .getElementById("qr-modal-close")
    .addEventListener("click", () => dialog.close());

  // click on the backdrop (outside .modal__inner) closes
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });

  dialog.addEventListener("close", () => {
    document.dispatchEvent(new CustomEvent("modal:close"));
  });
}

export function openModal(qrId) {
  const entry = qrContent[qrId];
  if (!entry) {
    console.warn(`No qr-content entry for "${qrId}"`);
    return;
  }

  eyebrowEl.textContent = entry.eyebrow || "QR code";
  titleEl.textContent = entry.title || qrId;

  let html = paragraphs(entry.body);
  if (entry.image && entry.image.src) {
    html += `<img src="${new URL(entry.image.src, SITE_ROOT).href}" alt="${entry.image.alt || ""}" loading="lazy" />`;
  }
  bodyEl.innerHTML = html;

  dialog.showModal();
  document.dispatchEvent(
    new CustomEvent("modal:open", { detail: { qrId } }),
  );
}

export function isModalOpen() {
  return Boolean(dialog && dialog.open);
}

export function closeModal() {
  if (dialog && dialog.open) dialog.close();
}
