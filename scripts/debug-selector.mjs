import { JSDOM } from "jsdom";
import { renderSamplerStatus } from "../ui.js";
import { getSamplerStatusSnapshot } from "../audio.js";

const dom = new JSDOM("<select id='piano-model'></select>");
global.document = dom.window.document;
global.window = dom.window;
const select = dom.window.document.getElementById("piano-model");

const snapshot = getSamplerStatusSnapshot();
console.log("[debug] initial snapshot", JSON.stringify(snapshot, null, 2));
renderSamplerStatus({ pianoModel: select }, snapshot);
console.log("[debug] rendered select", select.outerHTML);
