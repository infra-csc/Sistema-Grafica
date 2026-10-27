import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const mode = process.argv[2];
if (!["development", "production"].includes(mode)) {
  throw new Error("Informe development ou production.");
}
const require = createRequire(import.meta.url);
const args = mode === "development"
  ? [require.resolve("tsx/cli"), "watch", "--clear-screen=false", "server/index.ts"]
  : ["dist/index.js"];
const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: mode },
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
