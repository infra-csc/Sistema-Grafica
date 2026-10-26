// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { applyColorMode, readColorMode, setColorMode, COLOR_MODE_KEY } from "../../client/src/lib/color-mode";

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); applyColorMode("light"); });

test("mantém a preferência escura após reinicializar a interface", () => {
  setColorMode("dark");
  applyColorMode("light");
  applyColorMode(readColorMode());
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  expect(document.documentElement.style.colorScheme).toBe("dark");
  setColorMode("light");
  expect(readColorMode()).toBe("light");
  expect(document.documentElement.classList.contains("dark")).toBe(false);
});

test("aceita armazenamento indisponível sem impedir a troca de tema", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage indisponível"); });
  expect(() => setColorMode("dark")).not.toThrow();
  expect(document.documentElement.classList.contains("dark")).toBe(true);
});

test("usa tema claro para preferência inválida ou leitura bloqueada", () => {
  localStorage.setItem(COLOR_MODE_KEY, "invalid");
  expect(readColorMode()).toBe("light");
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Storage indisponível"); });
  expect(readColorMode()).toBe("light");
});
