/**
 * Pemuat .env sederhana — tanpa dependensi.
 * Variabel yang sudah ada di environment (mis. dari Railway) tidak ditimpa.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    // Buang tanda kutip pembungkus bila ada.
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);

    if (!(key in process.env)) process.env[key] = value;
  }
}
