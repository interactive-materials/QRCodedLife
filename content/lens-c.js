// Modal for /lens-c/ — the lenticular QR's view from the centre; see content/lentiqr.js.
import { lensModal } from "./lentiqr.js";

const { render, mount } = lensModal(1);
export default render;
export { mount };
