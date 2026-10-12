/* Static GitHub Pages build: sets GH_PAGES=1, runs `next build` (output: export -> out/)
   and adds .nojekyll so Pages serves the _next/ folder. Works on any OS. */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
const res = spawnSync(process.execPath, [nextBin, "build"], {
  stdio: "inherit",
  env: { ...process.env, GH_PAGES: "1" },
});
if (res.status !== 0) process.exit(res.status ?? 1);

writeFileSync("out/.nojekyll", "");
console.log("Pages build ready in out/");
