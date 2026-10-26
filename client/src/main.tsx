import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./styles/color-mode.css";
import { applyColorMode, readColorMode } from "./lib/color-mode";

applyColorMode(readColorMode());

window.addEventListener("error", (e) => {
  console.error("[CRASH]", e.message, e.error?.stack);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[UNHANDLED PROMISE]", e.reason);
});

createRoot(document.getElementById("root")!).render(<App />);
