/* ==========================================================================
   qolorful-qr.js — the QOLORFUL QR code's modules and their colours,
   shared by its modal (content/color.js) and its panel on the obelisk
   (obelisk.js), so both show it the same way at every slider level.

   QOLORful.svg draws every module as its own <rect>, in one of four
   colours, inside a white margin: magenta and blue stand for black, pink
   and yellow for white (DARK_COLOURS).

   Exports:
     QR_SRC                     the SVG's URL
     DARK_COLOURS               the colours that stand for black
     readColourGrid(url)        { colours, total, first, last }: colours
                                [row][col] over the whole SVG (white where
                                there's no rect), total cells a side, and
                                the first / last row and column that hold
                                modules (the white margin is outside them)
     binarisedColour(colour, b) the colour a module shows at binarisation
                                b (0..1): its own at 0; else its grey —
                                through the weights CSS grayscale() uses,
                                so b = 0 matches the filtered colour —
                                moved b of the way to black (a dark
                                colour) or white
   ========================================================================== */

export const QR_SRC = new URL("../../../color/assets/QOLORful.svg", import.meta.url).href;

export const DARK_COLOURS = ["#ff00c8", "#0082ff"];

export async function readColourGrid(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const svg = new DOMParser().parseFromString(await res.text(), "image/svg+xml").documentElement;

  // every rect one module, the unit set by the first one
  const rects = [...svg.querySelectorAll("rect[x][y]")];
  if (!rects.length) throw new Error(`no modules in ${url}`);
  const unit = parseFloat(rects[0].getAttribute("width"));
  // the grid covers the viewBox, which needn't start at 0 (it may crop
  // the margin); rects outside it are left out
  const vb = svg.viewBox.baseVal;
  const total = Math.round(vb.width / unit);
  const colours = Array.from({ length: total }, () => Array(total).fill("#ffffff"));
  let first = total;
  let last = 0;
  for (const r of rects) {
    const col = Math.round((parseFloat(r.getAttribute("x")) - vb.x) / unit);
    const row = Math.round((parseFloat(r.getAttribute("y")) - vb.y) / unit);
    if (row < 0 || col < 0 || row >= total || col >= total) continue;
    colours[row][col] = r.getAttribute("fill").toLowerCase();
    first = Math.min(first, row, col);
    last = Math.max(last, row, col);
  }
  return { colours, total, first, last };
}

export function binarisedColour(colour, b) {
  if (b <= 0) return colour;
  const [r, g, bl] = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));
  const grey = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  const v = Math.round(grey + ((DARK_COLOURS.includes(colour) ? 0 : 255) - grey) * b);
  return `rgb(${v}, ${v}, ${v})`;
}
