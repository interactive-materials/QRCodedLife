/* ==========================================================================
   about.js — the About modal, opened by the icon at the top right: its
   copy and layout, all in this file, in the same shape as the QR modals
   (content/contrast.js): the subtitle in the header row (beside the close
   button), then the title and copy in the scrolling text section. The
   close button stays outside, in each page's HTML.

   Default-exports render({ titleId }), which returns the modal's HTML.
   ========================================================================== */

const copy = {
  subtitle: "About",
  title: "Coded Life",
  // each entry a paragraph, or { part } for a heading over the next ones
  body: [
    "Coded Life is an exhibition designed by the Interactive Materials Lab in the Department of Design at the National University of Singapore. This exhibition digs deep into the QR&nbsp;code, a familiar thing we see and use every day. This website is an interactive digital twin of the physical exhibition at Sengkang MRT station.",
    { part: "Research & Design:" },
    "Clement Zheng<br>Yong Zhen Zhou<br>Vina Setiawaty<br>Stephanie Beh<br>Jan Juarez<br>Tan Ler Shan<br>Danikh Nizam<br>Myron Teo",
    { part: "Web Development:" },
    "Vina Setiawaty",
    { part: "Find out more:" },
    "<a href='https://interactivematerials.info/2025-11-coded-life' target='_blank'>Coded Life 2025</a><br><a href='https://interactivematerials.info' target='_blank'>Interactive Materials Lab</a><br><a href='https://cde.nus.edu.sg/dd/' target='_blank'>Department of Design, NUS</a>",
  ],
};

/* ---- HTML ---------------------------------------------------------------
   titleId lets the <dialog>'s aria-labelledby point at the heading.
   ------------------------------------------------------------------------ */
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
            .map((entry) =>
              typeof entry === "string"
                ? `
          <p>${entry}</p>`
                : `
          <h3 class="modal__part">${entry.part}</h3>`,
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}
