// Tunggu build latar selesai (maks 240 dtk), lalu cetak status + ekor log.
import { readFileSync, existsSync } from "node:fs";

const deadline = Date.now() + 240_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function tail(path, n = 60) {
  try {
    const lines = readFileSync(path, "utf8").split(/\r?\n/);
    return lines.slice(-n).join("\n");
  } catch {
    return "(tidak ada)";
  }
}

while (Date.now() < deadline) {
  const log = existsSync(".build.log") ? readFileSync(".build.log", "utf8") : "";
  const err = existsSync(".build.err") ? readFileSync(".build.err", "utf8") : "";
  // Penanda build selesai: ringkasan Next.js atau error tsc.
  const done =
    /Route \(app\)|Compiled successfully|Failed to compile|Type error|Build error/i.test(log) ||
    /Failed to compile|Type error|ELIFECYCLE/i.test(err);
  if (done) {
    console.log("=== .build.log (ekor) ===");
    console.log(tail(".build.log", 80));
    console.log("=== .build.err (ekor) ===");
    console.log(tail(".build.err", 40));
    process.exit(0);
  }
  await sleep(5000);
}
console.log("TIMEOUT menunggu build. .build.log ekor:");
console.log(tail(".build.log", 60));
console.log(".build.err ekor:");
console.log(tail(".build.err", 40));
