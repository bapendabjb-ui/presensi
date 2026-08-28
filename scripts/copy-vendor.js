/**
 * Menyalin aset vendor ke public/vendor supaya aplikasi tidak bergantung pada CDN.
 * Dijalankan otomatis lewat `npm run build`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "public", "vendor");

const ASSETS = [
  ["lucide/dist/umd/lucide.min.js", "lucide.min.js"],
  ["jsqr/dist/jsQR.js", "jsQR.js"],
];

fs.mkdirSync(OUT, { recursive: true });

for (const [pkgPath, outName] of ASSETS) {
  try {
    const src = require.resolve(pkgPath);
    fs.copyFileSync(src, path.join(OUT, outName));
    console.log(`  vendor  ${outName}`);
  } catch (err) {
    console.error(`  gagal menyalin ${pkgPath}: ${err.message}`);
    process.exitCode = 1;
  }
}
