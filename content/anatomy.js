/* ==========================================================================
   anatomy.js — the modal for /anatomy/: its copy and layout, all in this
   file.

   Default-exports render({ titleId }), which returns the modal's HTML:
   the subtitle in the header row (beside the close button), then the
   title, the intro and the whole QR code, then each part's heading and
   paragraph with its pictures (part.figures) below it. The close button stays outside, in each page's
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
      // each figure is one picture with its own caption, shown in this
      // order under the paragraph, on no white backing; add wide: true to
      // one to make it fill the text's width; give one srcs (a list) in
      // place of src to show those pictures side by side, the text's full
      // width, under the one caption (as contrast.js's pairs)
      figures: [
        {
          src: img("position-squares.png"),
          caption: "The three position markers of a QR code. They always sit in the same places: the top left, top right and bottom left corners",
        },
        {
          src: img("position-square-7x7.png"),
          caption: "A single position marker made up of seven by seven cells: a one cell-wide outline, a one cell gap and a three by three square in the center",
        },
      ],
    },
    {
      name: "Timing Pattern",
      text: "The timing patterns are two lines of alternating dark and light cells that run between the position markers. They help identify the size of the QR code even if the image is distorted.",
      figures: [
        {
          src: img("timing-belt-L.png"),
          caption: "Version 3 (29 x 29 modules) QR code with the timing belt highlighted in red.",
        },
        {
          srcs: [img("timing-belt-M.png"), img("timing-belt-H.png")],
          ratios: [504 / 618, 685 / 600], // each picture's width / height
          caption:"Left: Version 4 (33 x 33 modules) QR code.<br>Right: Version 5 (37 x 37 modules) QR code.<br>The position markers help correct the orientation while the timing belts tell the size of each cell, so both QR codes are still scannable",
        },
      ],
    },
    {
      name: "Quiet Zone",
      text: "The quiet zone is the blank margin surrounding the QR code. Each QR code needs a quiet zone that is at least one cell wide. The quiet zone helps isolate the QR code from the background for scanning.",
      figures: [
        {
          src: img("yellow-zone.png"),
          caption: "The quiet zone highlighted in yellow",
        },
        {
          srcs: [img("black-zone.png"), img("white-zone.png")],
          caption: "Left: a QR code with a dark quiet zone, which blends into its dark modules, making it hard to scan. Right: a QR code with a quiet zone the same color as the light modules",
        },
      ],
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
          <figure class="modal__figure modal__figure--clear${wide ? " modal__figure--wide" : ""}">
            <img src="${src}" alt="" />
            <figcaption>${caption}</figcaption>
          </figure>`;

// pictures side by side under one caption, together the figure's width
// (inset from the text like any figure); each takes a share of it by its
// ratio (width / height), so they come out the same height
const pictures = ({ srcs, ratios, caption }) => `
          <figure class="modal__figure modal__figure--wide">
            <div class="modal__pair modal__pair--spaced">
              ${srcs.map((src, i) => `<img src="${src}" alt="" style="flex-grow: ${ratios ? ratios[i] : 1}" />`).join("")}
            </div>
            <figcaption>${caption}</figcaption>
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
          <p>${copy.intro}</p>
          ${copy.figure ? figure(copy.figure.src, copy.figure.caption) : ""}
          ${copy.parts
            .map(
              (part) => `
          <h3 class="modal__part">${part.name}</h3>
          <p>${part.text}</p>
          ${part.figures.map((f) => (f.srcs ? pictures(f) : figure(f.src, f.caption, f.wide))).join("")}`,
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}
