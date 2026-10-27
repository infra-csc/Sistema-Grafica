export const COLOR_MODE_KEY = "grafica-color-mode";
export const COLOR_MODE_EVENT = "grafica-color-mode-change";
export type ColorMode = "light" | "dark";

export function readColorMode(): ColorMode {
  try { return localStorage.getItem(COLOR_MODE_KEY) === "dark" ? "dark" : "light"; }
  catch { return "light"; }
}

export function applyColorMode(mode: ColorMode) {
  document.documentElement.classList.toggle("dark", mode === "dark");
  document.documentElement.style.colorScheme = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", mode === "dark" ? "#292c32" : "#fafaf9");
}

export function setColorMode(mode: ColorMode) {
  try { localStorage.setItem(COLOR_MODE_KEY, mode); } catch { /* Ainda funciona nesta sessão. */ }
  applyColorMode(mode);
  window.dispatchEvent(new CustomEvent(COLOR_MODE_EVENT, { detail: mode }));
}
