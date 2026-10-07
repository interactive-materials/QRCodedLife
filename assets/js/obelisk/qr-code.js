/* ==========================================================================
   qr-code.js — a QR code as a grid of modules, for drawing on a canvas.
   Shared by the modals in content/ that draw QR codes.

   readQrCode(url) -> Promise<QrCode>
     Reads the module grid off a QR drawing (SVG or image) — see
     readQrCode() below.

   QrCode
   The QR as a grid of modules. Every module — quiet zone included — is
   { row, col, dark, groups, style }: row/col count from the symbol's
   top-left (the quiet zone is negative or >= n), and groups lists the
   parts it belongs to, general to specific:
     quiet                     the quiet zone (all light)
     finder, finder-tl|tr|bl   the three position markers (7 x 7)
     separator                 the light ring around each marker
     timing                    row 6 / column 6 between the markers
     alignment                 the 5 x 5 alignment pattern(s), version 2+
     format                    format information, beside the markers
     data                      everything else

   Colours: a module draws in its own style, else its most specific
   group's, else qr.colors. A style is { dark, light }; set only what
   changes.
     qr.paint("finder", { dark: "#112777" })        a whole group
     qr.paint("finder-tl", { dark: "red" })         one marker
     qr.group("timing")[3].style = { dark: "red" }  one module
     qr.clear("finder")                             back to the defaults

   Drawing: qr.draw(ctx, x, y, size, dpr) as a flat square, or
   qr.drawWarped(ctx, project) through any projection (e.g. perspective).
   ========================================================================== */

// alignment pattern centres by version (ISO/IEC 18004 Annex E), v1 - v10
const ALIGNMENT = [
  null,
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

export class QrCode {
  // dark: n x n booleans, the symbol without its quiet zone
  constructor(dark, quiet) {
    const n = dark.length;
    this.n = n;
    this.quiet = quiet;
    this.size = n + 2 * quiet; // modules across, quiet zone included
    this.colors = { dark: "#000000", light: "#ffffff" };
    this.styles = new Map(); // group name -> { dark?, light? }
    this.modules = [];
    this.groups = new Map(); // group name -> modules

    const align = alignmentCentres((n - 17) / 4);
    for (let row = -quiet; row < n + quiet; row++) {
      for (let col = -quiet; col < n + quiet; col++) {
        const inside = row >= 0 && col >= 0 && row < n && col < n;
        const module = {
          row,
          col,
          dark: inside && dark[row][col],
          groups: inside ? classify(row, col, n, align) : ["quiet"],
          style: null,
        };
        this.modules.push(module);
        for (const g of module.groups) {
          if (!this.groups.has(g)) this.groups.set(g, []);
          this.groups.get(g).push(module);
        }
      }
    }
  }

  group(name) {
    return this.groups.get(name) || [];
  }

  paint(name, style) {
    this.styles.set(name, { ...this.styles.get(name), ...style });
  }

  clear(name) {
    this.styles.delete(name);
  }

  colorOf(module) {
    const key = module.dark ? "dark" : "light";
    if (module.style?.[key]) return module.style[key];
    for (let i = module.groups.length - 1; i >= 0; i--) {
      const style = this.styles.get(module.groups[i]);
      if (style?.[key]) return style[key];
    }
    return this.colors[key];
  }

  // the whole code, quiet zone included, as a size x size square with its
  // top-left at (x, y). Module edges snap to device pixels so neighbours
  // meet without hairline seams.
  draw(ctx, x, y, size, dpr) {
    const unit = size / this.size;
    const snap = (v) => Math.round(v * dpr) / dpr;
    const cell = (m) => {
      const x0 = snap(x + (m.col + this.quiet) * unit);
      const y0 = snap(y + (m.row + this.quiet) * unit);
      return [x0, y0, snap(x + (m.col + this.quiet + 1) * unit) - x0, snap(y + (m.row + this.quiet + 1) * unit) - y0];
    };
    ctx.fillStyle = this.colors.light;
    ctx.fillRect(snap(x), snap(y), snap(x + size) - snap(x), snap(y + size) - snap(y));
    for (const m of this.modules) {
      const color = this.colorOf(m);
      if (!m.dark && color === this.colors.light) continue;
      ctx.fillStyle = color;
      ctx.fillRect(...cell(m));
    }
  }

  // the whole code through project(u, v) -> [x, y], where u / v count
  // modules from the code's top-left, quiet zone included (e.g. a
  // perspective view). Each colour's modules are filled as
  // one path, so neighbours meet without seams.
  drawWarped(ctx, project) {
    const outline = (path, pts) => {
      path.moveTo(...pts[0]);
      for (const pt of pts.slice(1)) path.lineTo(...pt);
      path.closePath();
    };
    const n = this.size;
    const ground = new Path2D();
    outline(ground, [project(0, 0), project(n, 0), project(n, n), project(0, n)]);
    ctx.fillStyle = this.colors.light;
    ctx.fill(ground);

    const paths = new Map(); // colour -> Path2D
    for (const m of this.modules) {
      const color = this.colorOf(m);
      if (!m.dark && color === this.colors.light) continue;
      if (!paths.has(color)) paths.set(color, new Path2D());
      const u = m.col + this.quiet;
      const v = m.row + this.quiet;
      outline(paths.get(color), [project(u, v), project(u + 1, v), project(u + 1, v + 1), project(u, v + 1)]);
    }
    for (const [color, path] of paths) {
      ctx.fillStyle = color;
      ctx.fill(path);
    }
  }
}

function alignmentCentres(version) {
  const pos = ALIGNMENT[version] || [];
  const last = pos[pos.length - 1];
  const centres = [];
  for (const r of pos)
    for (const c of pos) {
      // the three corners taken by the position markers
      if ((r === 6 && c === 6) || (r === 6 && c === last) || (r === last && c === 6)) continue;
      centres.push([r, c]);
    }
  return centres;
}

function classify(r, c, n, align) {
  const corner =
    r < 7 && c < 7 ? "tl" : r < 7 && c >= n - 7 ? "tr" : r >= n - 7 && c < 7 ? "bl" : null;
  if (corner) return ["finder", `finder-${corner}`];
  if ((r < 8 && c < 8) || (r < 8 && c >= n - 8) || (r >= n - 8 && c < 8)) return ["separator"];
  if (align.some(([ar, ac]) => Math.abs(r - ar) <= 2 && Math.abs(c - ac) <= 2)) return ["alignment"];
  if ((r === 6 && c >= 8 && c <= n - 9) || (c === 6 && r >= 8 && r <= n - 9)) return ["timing"];
  if ((r === 8 && (c <= 8 || c >= n - 8)) || (c === 8 && (r <= 8 || r >= n - 8))) return ["format"];
  return ["data"];
}

// Reads the module grid off the SVG: drawn to an offscreen canvas, the
// centre of every module is sampled. The module size is the top-left
// marker's top edge / 7; the module count runs from there to the top-right
// marker's right edge; the quiet zone is the margin the drawing shows.
const READ_PX = 1000;

export async function readQrCode(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const svg = new DOMParser().parseFromString(await res.text(), "image/svg+xml").documentElement;
  // a viewBox-only SVG has no size of its own; give it the one we sample at
  svg.setAttribute("width", READ_PX);
  svg.setAttribute("height", READ_PX);
  const blobUrl = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }),
  );
  const img = new Image();
  img.src = blobUrl;
  try {
    await img.decode();
  } finally {
    URL.revokeObjectURL(blobUrl);
  }

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = READ_PX;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, READ_PX, READ_PX);
  const { data } = ctx.getImageData(0, 0, READ_PX, READ_PX);
  // dark: opaque and not light (on a transparent or white ground)
  const isDark = (x, y) => {
    const i = (Math.round(y) * READ_PX + Math.round(x)) * 4;
    return data[i + 3] > 128 && data[i] + data[i + 1] + data[i + 2] < 384;
  };

  let x0 = 0; // the top-left marker's corner: first dark pixel on the diagonal
  while (x0 < READ_PX && !isDark(x0, x0)) x0++;
  if (x0 === READ_PX) throw new Error(`no QR code in ${url}`);
  const edgeY = x0 + 2;
  let x1 = x0;
  while (x1 < READ_PX && isDark(x1, edgeY)) x1++;
  const unit = (x1 - x0) / 7;
  let xr = READ_PX - 1;
  while (xr > x1 && !isDark(xr, edgeY)) xr--;
  const n = Math.round((xr + 1 - x0) / unit);
  if (n < 21 || (n - 17) % 4) throw new Error(`can't read a QR grid in ${url} (${n} modules?)`);

  const dark = [];
  for (let r = 0; r < n; r++) {
    dark.push([]);
    for (let c = 0; c < n; c++) dark[r].push(isDark(x0 + (c + 0.5) * unit, x0 + (r + 0.5) * unit));
  }
  return new QrCode(dark, Math.max(1, Math.round(x0 / unit)));
}
