import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

window.addEventListener("error", (e) => {
  console.error("[CRASH]", e.message, e.error?.stack);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[UNHANDLED PROMISE]", e.reason);
});

createRoot(document.getElementById("root")!).render(<App />);
