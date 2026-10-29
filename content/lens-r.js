// Modal for /lens-r/ — the lenticular QR's view from the right; see content/lentiqr.js.
import { lensModal } from "./lentiqr.js";

const { render, mount } = lensModal(2);
export default render;
export { mount };
