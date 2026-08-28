import "./env.js";

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";

import { initDb, dbInfo, one } from "./db.js";
import { checkPassword, issueSession, clearSession, currentUser, requirePage, requireAuth } from "./auth.js";
import eventsRouter from "./routes/events.js";
import participantsRouter from "./routes/participants.js";
import checkinRouter from "./routes/checkin.js";
import reportsRouter from "./routes/reports.js";
import publicRouter from "./routes/public.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");

const app = express();
app.set("trust proxy", 1); // Railway berada di belakang proxy
app.use(express.json({ limit: "8mb" })); // muat untuk impor CSV besar
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

/* ------------------------------ Versi aset -------------------------------- */
/**
 * Sidik jari isi seluruh CSS & JS. Nilainya ditempelkan sebagai ?v= pada
 * setiap tautan aset di HTML, sehingga satu deploy baru otomatis mengubah
 * URL-nya. Tanpa ini, browser yang sudah menyimpan app.js lama akan terus
 * memakainya sampai cache kedaluwarsa — perubahan tidak muncul di layar.
 */
function computeAssetVersion() {
  const hash = crypto.createHash("sha1");
  for (const dir of ["css", "js", "vendor"]) {
    const full = path.join(PUBLIC_DIR, dir);
    let entries = [];
    try {
      entries = fs.readdirSync(full).sort();
    } catch {
      continue; // folder vendor belum ada sebelum `npm run build`
    }
    for (const name of entries) {
      try {
        hash.update(name).update(fs.readFileSync(path.join(full, name)));
      } catch { /* lewati berkas yang tidak terbaca */ }
    }
  }
  return hash.digest("hex").slice(0, 10);
}

const ASSET_VERSION = computeAssetVersion();

/* --------------------------------- Static --------------------------------- */
const IS_PROD = process.env.NODE_ENV === "production";

app.use(
  express.static(PUBLIC_DIR, {
    index: false,
    // Aman menyimpan lama karena URL sudah bertanda versi.
    maxAge: IS_PROD ? "365d" : 0,
    setHeaders(res, filePath) {
      if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
      else if (IS_PROD) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    },
  })
);

/**
 * Menyajikan halaman HTML sambil menempelkan ?v= pada tautan /css, /js,
 * dan /vendor. Hasilnya disimpan di memori — berkasnya tidak berubah
 * selama proses berjalan.
 */
const pageCache = new Map();

function page(name) {
  return (req, res) => {
    let html = pageCache.get(name);

    if (html === undefined) {
      html = fs
        .readFileSync(path.join(PUBLIC_DIR, name), "utf8")
        .replace(
          /(["'])(\/(?:css|js|vendor)\/[^"'?]+)\1/g,
          (m, quote, url) => `${quote}${url}?v=${ASSET_VERSION}${quote}`
        );
      pageCache.set(name, html);
    }

    res.type("html").set("Cache-Control", "no-cache").send(html);
  };
}

/* ---------------------------------- Auth ---------------------------------- */
app.get("/healthz", (req, res) =>
  res.json({ ok: true, db: dbInfo().database, assets: ASSET_VERSION })
);

app.get("/login", (req, res) => {
  if (currentUser(req)) return res.redirect("/");
  page("login.html")(req, res);
});

app.post("/api/login", (req, res) => {
  if (!checkPassword(req.body?.password)) {
    return res.status(401).json({ error: "Password salah." });
  }
  issueSession(res);
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

app.get("/api/me", requireAuth, (req, res) => res.json({ user: req.user }));

/* ---------------------------------- API ----------------------------------- */
app.use("/api/events", eventsRouter);
app.use("/api/participants", participantsRouter);
app.use("/api/checkin", checkinRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/public", publicRouter); // tanpa autentikasi — pendaftaran mandiri

/* --------------------------------- Halaman -------------------------------- */
app.get("/", requirePage, page("app.html"));
app.get("/kiosk", requirePage, page("kiosk.html"));
app.get("/badge/:id", requirePage, page("badge.html"));
app.get("/laporan/:id", requirePage, page("report.html"));
app.get("/poster/:id", requirePage, page("poster.html"));

/* Halaman pendaftaran mandiri — publik, dibuka pengunjung lewat QR. */
app.get("/daftar/:token", page("register.html"));

/* --------------------------- 404 & error handler -------------------------- */
app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Endpoint tidak ditemukan." });
  res.status(404);
  page("404.html")(req, res);
});

app.use((err, req, res, next) => {
  console.error("[error]", err);
  const message =
    err.code === "ER_DUP_ENTRY"
      ? "Data sudah ada (duplikat)."
      : err.code === "ECONNREFUSED"
        ? "Tidak bisa terhubung ke MySQL. Pastikan servernya jalan."
        : err.message || "Terjadi kesalahan pada server.";
  res.status(500).json({ error: message });
});

/* ---------------------------------- Boot ---------------------------------- */
const PORT = Number(process.env.PORT) || 3000;

try {
  await initDb();
  const { host, database } = dbInfo();
  app.listen(PORT, () => {
    console.log(`\n  Presensi siap`);
    console.log(`  → http://localhost:${PORT}`);
    console.log(`  → MySQL ${host}/${database}\n`);
  });
} catch (err) {
  console.error("\n  Gagal terhubung ke MySQL:", err.message);
  console.error("  Periksa MYSQL_URL atau MYSQLHOST/MYSQLUSER/MYSQLPASSWORD di .env\n");
  process.exit(1);
}
