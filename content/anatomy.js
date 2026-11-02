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
  title: "The Anatomy of a QR Code",
  intro:
    "A QR code is made up of multiple parts. Each part serves a different function. Collectively, they make QR codes easy to scan from any angle and orientation.",
    // "The QR code we use everyday is made up of multiple parts that makes it easy for us to scan a QR code from any angle and any orientation.",
  // figure: { src: img("qrcode.svg"), caption: "A QR code" },
  parts: [
    {
      name: "Position Markers",
      text: "Each QR code comes with three position markers. These are patterns with a one cell-wide outline, a one cell gap, and a three by three cell square inside. This is the first thing a computer looks at. The three position markers indicate the presence and orientation of a QR code.",
      src: img("position_squares.png"),
      wide: true,
      caption: "The three position markers of a QR code. They always sit in the same places: the top left, top right and bottom left corners.",
    },
    {
      name: "Timing Pattern",
      text: "The timing patterns are two lines of alternating dark and light cells that run between the position markers. They help identify the size of the QR code even if the image is distorted.",
      src: img("timing-belt.png"),
      wide: true,
      caption: "Three QR codes of different sizes. Each is distorted to a different angle and is still scannable. The number of cells along each timing pattern shows the size of its QR code.",
    },
    {
      name: "Quiet Zone",
      text: "The quiet zone is the blank margin surrounding the QR code. Each QR code needs a quiet zone that is at least one cell wide. The quiet zone helps isolate the QR code from the background for scanning.",
      src: img("quiet-zone.png"),
      caption: "Example of real QR codes with quiet zones. The left one is a real QR code with no quiet zone, making it unscannable. The right one shows the same QR code, modified to have a quiet zone the same color as the light modules, making it scannable.",
    },
  ],
};

/* ---- HTML ---------------------------------------------------------------
   titleId lets the <dialog>'s aria-labelledby point at the heading. Each
   picture's caption doubles as its alt text, so alt is left empty. The
   whole QR code's figure shows only while copy.figure is set. A wide
   part's picture fills the text's width, on no white backing.
   ------------------------------------------------------------------------ */
const figure = (src, caption, wide = false) => `
          <figure class="modal__figure${wide ? " modal__figure--wide" : ""}">
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
          ${copy.figure ? figure(copy.figure.src, copy.figure.caption) : ""}
          ${copy.parts
            .map(
              (part) => `
          <h3 class="modal__part">${part.name}</h3>
          <p>${part.text}</p>
          ${figure(part.src, part.caption, part.wide)}`,
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}
