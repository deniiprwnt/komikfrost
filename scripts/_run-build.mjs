// Launcher build latar: spawn `npm run build` detached, output ke file.
import { spawn } from "node:child_process";
import { openSync } from "node:fs";

const out = openSync(".build.log", "w");
const err = openSync(".build.err", "w");
const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
  stdio: ["ignore", out, err],
  detached: true,
  shell: true,
});
child.unref();
console.log(`started pid=${child.pid}`);
