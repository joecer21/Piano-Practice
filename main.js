import "./style.css";
import { startApplication } from "./application/app-controller.js";

let disposeApplication = () => {};

function start() {
  disposeApplication = startApplication({ production: import.meta.env.PROD });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    document.removeEventListener("DOMContentLoaded", start);
    disposeApplication();
  });
}
