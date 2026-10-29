// Modal for /lens-l/ — the lenticular QR's view from the left; see content/lentiqr.js.
import { lensModal } from "./lentiqr.js";

const { render, mount } = lensModal(0);
export default render;
export { mount };
