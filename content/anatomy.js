/* ==========================================================================
   anatomy.js — the modal for /anatomy/: its copy and layout, all in this
   file.

   Default-exports render({ titleId }), which returns the modal's HTML:
   the subtitle in the header row (beside the close button), then the
   title, the intro and the whole QR code, then each part's heading and
   paragraph with its picture below it. The close button stays outside, in each page's
   HTML.
   ========================================================================== */

const img = (name) => new URL(`../anatomy/assets/${name}`, import.meta.url).href;

const copy = {
  subtitle: "What is in a QR code?",
  title: "Anatomy of a QR code",
  intro:
    "The QR (Quick Response) Code is a two-dimensional (2D) machine-readable codes which are made up of dark and light modules arranged into a square. Often scanned using a camera, the QR code is made up of multiple parts that makes it easy for us to scan a QR code from any angle and orientation.",
    // "The QR code we use everyday is made up of multiple parts that makes it easy for us to scan a QR code from any angle and any orientation.",
  figure: { src: img("qrcode.svg"), caption: "A QR code" },
  parts: [
    {
      name: "Position Markers",
      text: "The three squares at the corners of a QR code helps the decoder tell the orientation of the QR code and whether it is mirrored.",
      src: img("posititon_squares.svg"),
    },
    {
      name: "Timing Pattern",
      text: "The timing patterns are two lines of alternating dark and light modules that run between the three finder patterns. They help the decoder work out the module grid, how big one unit is and how many rows and columns there are, allowing the decoder to understand the QR code even if it is distorted.",
      src: img("timing_belt.svg"),
    },
    {
      name: "Quiet Zone",
      text: "The quiet zone is the light modules surrounding the QR code. It is needed for the QR code scanner to differentiate the QR code and the background, allowing the decoder to detect the QR code.",
      src: img("quiet_zone.svg"),
    },
  ],
};

/* ---- HTML ---------------------------------------------------------------
   titleId lets the <dialog>'s aria-labelledby point at the heading. Each
   picture's caption doubles as its alt text, so alt is left empty.
   ------------------------------------------------------------------------ */
const figure = (src, caption) => `
          <figure class="modal__figure">
            <img src="${src}" alt="" />
            <figcaption>${caption}</figcaption>
          </figure>`;

export default function render({ titleId }) {
  return `
    <div class="modal__layout">
      <header class="modal__header">
        <p class="modal__eyebrow">${copy.subtitle}</p>
      </header>
      <div class="modal__text">
        <h2 class="modal__title" id="${titleId}">${copy.title}</h2>
        <div class="modal__body">
          <p>${copy.intro}</p>
          ${figure(copy.figure.src, copy.figure.caption)}
          ${copy.parts
            .map(
              (part) => `
          <h3 class="modal__part">${part.name}</h3>
          <p>${part.text}</p>
          ${figure(part.src, part.name)}`,
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}
