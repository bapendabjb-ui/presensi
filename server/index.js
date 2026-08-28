import "./env.js";

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");

const app = express();
app.set("trust proxy", 1); // Railway berada di belakang proxy
app.use(express.json({ limit: "8mb" })); // muat untuk impor CSV besar
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

/* --------------------------------- Static --------------------------------- */
app.use(
  express.static(PUBLIC_DIR, {
    index: false,
    maxAge: process.env.NODE_ENV === "production" ? "7d" : 0,
    setHeaders(res, filePath) {
      if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
    },
  })
);

const page = (name) => (req, res) => res.sendFile(path.join(PUBLIC_DIR, name));

/* ---------------------------------- Auth ---------------------------------- */
app.get("/healthz", (req, res) => res.json({ ok: true, db: dbInfo().database }));

app.get("/login", (req, res) => {
  if (currentUser(req)) return res.redirect("/");
  res.sendFile(path.join(PUBLIC_DIR, "login.html"));
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

/* --------------------------------- Halaman -------------------------------- */
app.get("/", requirePage, page("app.html"));
app.get("/kiosk", requirePage, page("kiosk.html"));
app.get("/badge/:id", requirePage, page("badge.html"));
app.get("/laporan/:id", requirePage, page("report.html"));

/* --------------------------- 404 & error handler -------------------------- */
app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Endpoint tidak ditemukan." });
  res.status(404).sendFile(path.join(PUBLIC_DIR, "404.html"));
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
