/* ==========================================================================
   qr-page.js — fills a standalone content page from `<body data-qr-id>`,
   reusing the same qr-content.js entries as Prototype 1's modal.
   ========================================================================== */

import { qrContent } from "./qr-content.js";

function paragraphs(body) {
  const list = Array.isArray(body) ? body : [body];
  return list
    .filter(Boolean)
    .map((p) => `<p>${p}</p>`)
    .join("");
}

const qrId = document.body.dataset.qrId;
const entry = qrContent[qrId];

if (entry) {
  document.getElementById("qr-eyebrow").textContent = entry.eyebrow || "QR code";
  document.getElementById("qr-title").textContent = entry.title || qrId;

  let html = paragraphs(entry.body);
  if (entry.image && entry.image.src) {
    html += `<img src="${entry.image.src}" alt="${entry.image.alt || ""}" loading="lazy" />`;
  }
  document.getElementById("qr-body").innerHTML = html;
} else {
  console.warn(`No qr-content entry for "${qrId}"`);
}
