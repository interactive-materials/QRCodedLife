/* ==========================================================================
   reliable.js — the modal for /reliable/: its copy and layout, all in
   this file, in the same shape as content/contrast.js.

   Default-exports render({ titleId }), which returns the modal's HTML:
   the subtitle in the header row (beside the close button), then the
   title and copy, each paragraph with its picture (if any) below it. The
   close button stays outside, in each page's HTML.

   The first picture is one of seven versions of a QR code, each covered
   more than the last (reliable/assets/001.png to 007.png), chosen by the
   page's ?v= parameter: each version's QR code links to this page with
   its own number, so scanning one shows how much of it was covered. With
   no ?v= (or one that isn't a version), it's 007, the one too covered
   to scan.
   ========================================================================== */

import { placeholder } from "./modal-layout.js";

const img = (name) => new URL(`../reliable/assets/${name}`, import.meta.url).href;

/* ---- the covered QR code ------------------------------------------------
   Each version: how much of the QR code is covered, whether it still
   scans, and the image's width / height (the QR is the image's left
   square; the covering runs past it to the right in the later ones).
   ------------------------------------------------------------------------ */
const COVERED = {
  "001": { covered: "0%", scans: true, ratio: 564 / 561 },
  "002": { covered: "~7%", scans: true, ratio: 564 / 561 },
  "003": { covered: "~10%", scans: true, ratio: 564 / 561 },
  "004": { covered: "~22%", scans: true, ratio: 614 / 562 },
  "005": { covered: "~26%", scans: true, ratio: 621 / 561 },
  "006": { covered: "~29%", scans: true, ratio: 621 / 561 },
  "007": { covered: "~40%", scans: false, ratio: 646 / 561 },
};
const DEFAULT_VERSION = "007";

function coveredFigure() {
  const v = new URLSearchParams(location.search).get("v");
  const version = Object.hasOwn(COVERED, v) ? v : DEFAULT_VERSION;
  const { covered, scans, ratio } = COVERED[version];
  return {
    covered: { src: img(`${version}.png`), ratio },
    caption: `This QR code is ${covered} covered, hence it is ${scans ? "scannable" : "unscannable"}.`,
  };
}

const copy = {
  subtitle: "Reliability",
  title: "Reliable QR Codes",
  // a figure with src is a picture, one with covered the covered QR code;
  // one with panels is a placeholder still: a dashed box per panel,
  // labelled with what goes there, and the caption under them
  body: [
    {
      text: "A QR code contains not only data, but also information needed to correct it if it gets damaged. The error correction information enables QR codes to be decoded even when some parts are missing or covered, like when a logo is placed on top of it.",
      figure: coveredFigure(),
    },
    {
      text: "A QR code can be made with different levels of error correction, depending on where it is used. The lowest level is usually recommended for digital use, and the highest for print. A higher level of error correction also enables a bigger logo to be placed in the middle of the QR code.",
      figure: {
        src: img("matrix.png"),
        alt: "A grid of QR codes, a row per error correction level, with a bigger logo in each column and whether each QR code scans",
        caption: "",
      },
    },
  ],
};

/* ---- HTML ---------------------------------------------------------------
   titleId lets the <dialog>'s aria-labelledby point at the heading. A
   picture fills the text's width on its own transparent backing, as
   anatomy.js's wide pictures do.
   ------------------------------------------------------------------------ */
// the covered QR code: its QR square centred, with the covering free to run past it to the right; the
// caption doubles as its alt text
const coveredPicture = ({ covered: { src, ratio }, caption }) => `
          <figure class="modal__figure modal__figure--covered" style="--ratio: ${ratio}">
            <img src="${src}" alt="" />
            <figcaption>${caption}</figcaption>
          </figure>`;

const picture = ({ src, alt, caption }) => `
          <figure class="modal__figure modal__figure--wide">
            <img src="${src}" alt="${alt}" />
            ${caption ? `<figcaption>${caption}</figcaption>` : ""}
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
          ${figure ? (figure.covered ? coveredPicture(figure) : figure.src ? picture(figure) : placeholder(figure)) : ""}`)
            .join("")}
        </div>
      </div>
    </div>
  `;
}
