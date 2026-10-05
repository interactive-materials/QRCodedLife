/* ==========================================================================
   modal.js — native <dialog> wrapper for the QR pop-ups.

   Exports:
     initModal()        wire up the dialog once on page load
     openModal(qrId)    fill + show the modal for a qr-content.js key
     closeModal()       close it if open
     isModalOpen()      boolean (either modal)
     initAbout()        wire up the About modal and its top-right icon

   Dispatches on `document`:
     "modal:open"  { detail: { qrId } }
     "modal:close"
   ========================================================================== */

import { qrContent, aboutContent } from "./qr-content.js";

// image srcs are site-root relative, so they work from any slug folder
const SITE_ROOT = new URL("../../../", import.meta.url);

let dialog;
let eyebrowEl;
let titleEl;
let bodyEl;
let aboutDialog;

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

function bodyHtml(entry) {
  let html = paragraphs(entry.body);
  if (entry.image && entry.image.src) {
    html += `<img src="${new URL(entry.image.src, SITE_ROOT).href}" alt="${entry.image.alt || ""}" loading="lazy" />`;
  }
  return html;
}

export function openModal(qrId) {
  const entry = qrContent[qrId];
  if (!entry) {
    console.warn(`No qr-content entry for "${qrId}"`);
    return;
  }

  eyebrowEl.textContent = entry.eyebrow || "QR code";
  titleEl.textContent = entry.title || qrId;
  bodyEl.innerHTML = bodyHtml(entry);

  dialog.showModal();
  document.dispatchEvent(
    new CustomEvent("modal:open", { detail: { qrId } }),
  );
}

export function isModalOpen() {
  return Boolean((dialog && dialog.open) || (aboutDialog && aboutDialog.open));
}

export function closeModal() {
  if (dialog && dialog.open) dialog.close();
}

// The About modal shares the QR modal's look but none of its routing: it
// doesn't change the URL or the sky, so it fires no modal:* events.
export function initAbout() {
  aboutDialog = document.getElementById("about-modal");
  document.getElementById("about-modal-eyebrow").textContent =
    aboutContent.eyebrow || "About";
  document.getElementById("about-modal-title").textContent = aboutContent.title;
  document.getElementById("about-modal-body").innerHTML =
    bodyHtml(aboutContent);

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
