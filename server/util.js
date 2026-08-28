import crypto from "node:crypto";

const ALPHABET = "ACDEFGHJKLMNPQRTUVWXY3479"; // tanpa karakter ambigu (0/O, 1/I, S/5, B/8, 2/Z, 6/G)

/** Kode peserta pendek yang mudah dibaca & diketik ulang, mis. "PRS-K7Q4X9". */
export function makeCode(prefix = "PRS") {
  const bytes = crypto.randomBytes(6);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `${prefix}-${out}`;
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "event";
}

/** "2026-08-28T09:30" (input datetime-local) -> "2026-08-28 09:30:00" untuk MySQL. */
export function toMysqlDate(value) {
  if (!value) return null;
  const s = String(value).trim().replace("T", " ");
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) return s + ":00";
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + " 00:00:00";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 19).replace("T", " ");
}

/** Parser CSV yang menangani tanda kutip, koma di dalam kutip, dan CRLF. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  const src = String(text).replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === "," || ch === ";") { row.push(field); field = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Escape satu sel CSV, termasuk proteksi formula injection di Excel. */
export function csvCell(value) {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function csvFrom(headers, rows) {
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) lines.push(r.map(csvCell).join(","));
  return "\uFEFF" + lines.join("\r\n"); // BOM supaya Excel membaca UTF-8
}
