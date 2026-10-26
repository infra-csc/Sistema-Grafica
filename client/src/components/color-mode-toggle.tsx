import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { applyColorMode, COLOR_MODE_EVENT, COLOR_MODE_KEY, readColorMode, setColorMode, type ColorMode } from "@/lib/color-mode";

export function ColorModeToggle() {
  const [mode, setMode] = useState<ColorMode>(() => document.documentElement.classList.contains("dark") ? "dark" : "light");
  useEffect(() => {
    const localChange = (event: Event) => setMode((event as CustomEvent<ColorMode>).detail);
    const storageChange = (event: StorageEvent) => {
      if (event.key === COLOR_MODE_KEY || event.key === null) {
        const next = readColorMode(); applyColorMode(next); setMode(next);
      }
    };
    window.addEventListener(COLOR_MODE_EVENT, localChange);
    window.addEventListener("storage", storageChange);
    return () => { window.removeEventListener(COLOR_MODE_EVENT, localChange); window.removeEventListener("storage", storageChange); };
  }, []);
  const label = mode === "dark" ? "Ativar modo claro" : "Ativar modo escuro";
  const Icon = mode === "dark" ? Sun : Moon;
  return <button type="button" aria-label={label} title={label} aria-pressed={mode === "dark"}
    onClick={() => setColorMode(mode === "dark" ? "light" : "dark")}
    className="color-mode-toggle h-9 w-9 max-md:h-11 max-md:w-11 shrink-0 flex items-center justify-center rounded-[9px] border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
    <Icon size={18} aria-hidden="true" />
  </button>;
}
