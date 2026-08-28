/* ============================================================
   Pendaftaran mandiri — endpoint publik, TANPA autentikasi.
   Pengunjung memindai QR event, mengisi form, lalu langsung
   terdaftar (dan opsional tercatat hadir).
   ============================================================ */
import { Router } from "express";
import QRCode from "qrcode";
import { one, run } from "../db.js";
import { makeCode } from "../util.js";

const router = Router();

/* ------------------------- Pembatas laju sederhana ------------------------- */
/**
 * Penyimpanan di memori sudah memadai: batasnya hanya perlu menahan spam
 * ringan, dan kalau proses restart, jendela hitungnya wajar untuk direset.
 */
const hits = new Map();
const WINDOW_MS = 10 * 60 * 1000; // 10 menit
const MAX_PER_WINDOW = 12;

function clientIp(req) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function rateLimit(req, res, next) {
  const key = clientIp(req);
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }

  if (entry.count >= MAX_PER_WINDOW) {
    const menit = Math.ceil((entry.resetAt - now) / 60000);
    return res.status(429).json({
      error: `Terlalu banyak pendaftaran dari perangkat ini. Coba lagi dalam ${menit} menit, atau hubungi petugas.`,
    });
  }

  entry.count++;
  next();
}

// Buang entri kedaluwarsa supaya Map tidak tumbuh terus di acara panjang.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hits) if (now > entry.resetAt) hits.delete(key);
}, WINDOW_MS).unref();

/* ------------------------------- Pembantu -------------------------------- */
async function findOpenEvent(token) {
  const event = await one(
    `SELECT id, name, description, location, starts_at, ends_at, status,
            self_register, public_token
       FROM events
      WHERE public_token = ? LIMIT 1`,
    [token]
  );
  if (!event) return { error: "Tautan pendaftaran tidak dikenal." };
  if (event.self_register === "off") {
    return { error: "Pendaftaran mandiri untuk event ini sedang ditutup." };
  }
  if (event.status === "selesai") {
    return { error: "Event ini sudah selesai." };
  }
  return { event };
}

async function uniqueCode() {
  for (let i = 0; i < 20; i++) {
    const code = makeCode();
    const clash = await one("SELECT id FROM participants WHERE code = ? LIMIT 1", [code]);
    if (!clash) return code;
  }
  return `PRS-${Date.now().toString(36).toUpperCase()}`;
}

/* ---------------------------- Info event publik --------------------------- */
router.get("/event/:token", async (req, res) => {
  const { event, error } = await findOpenEvent(req.params.token);
  if (error) return res.status(404).json({ error });

  // Sengaja hanya mengirim field yang aman dipajang di halaman publik.
  res.json({
    name: event.name,
    description: event.description,
    location: event.location,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    mode: event.self_register, // "daftar" | "hadir"
  });
});

/* ----------------------------- Proses pendaftaran ------------------------- */
router.post("/register/:token", rateLimit, async (req, res) => {
  const { event, error } = await findOpenEvent(req.params.token);
  if (error) return res.status(404).json({ error });

  // Umpan honeypot: bot mengisi semua field, manusia tidak melihat yang ini.
  if (req.body?.website) return res.status(400).json({ error: "Pendaftaran ditolak." });

  const name = String(req.body?.name ?? "").trim();
  const email = String(req.body?.email ?? "").trim();
  const phone = String(req.body?.phone ?? "").trim();
  const org = String(req.body?.org ?? "").trim();

  if (name.length < 3) {
    return res.status(400).json({ error: "Nama minimal 3 huruf." });
  }
  if (name.length > 180) {
    return res.status(400).json({ error: "Nama terlalu panjang." });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return res.status(400).json({ error: "Format email tidak valid." });
  }
  if (!email && !phone) {
    return res.status(400).json({ error: "Isi email atau nomor telepon sebagai kontak." });
  }

  /* Pendaftar berulang: kembalikan data lama, jangan bikin baris kembar.
     Ini juga yang menangani orang yang memindai QR dua kali. */
  let participant = null;
  if (email) {
    participant = await one(
      "SELECT * FROM participants WHERE event_id = ? AND email = ? LIMIT 1",
      [event.id, email]
    );
  }
  if (!participant && phone) {
    participant = await one(
      "SELECT * FROM participants WHERE event_id = ? AND phone = ? LIMIT 1",
      [event.id, phone]
    );
  }

  let sudahTerdaftar = Boolean(participant);

  if (!participant) {
    const { insertId } = await run(
      `INSERT INTO participants (event_id, code, name, email, phone, org, ticket_type, source)
       VALUES (?, ?, ?, ?, ?, ?, 'Reguler', 'mandiri')`,
      [event.id, await uniqueCode(), name, email || null, phone || null, org || null]
    );
    participant = await one("SELECT * FROM participants WHERE id = ?", [insertId]);
  }

  /* Mode "hadir": pendaftaran sekaligus mencatat kehadiran. */
  let checkin = null;
  if (event.self_register === "hadir") {
    const existing = await one(
      "SELECT checked_in_at FROM checkins WHERE participant_id = ? LIMIT 1",
      [participant.id]
    );
    if (existing) {
      checkin = { at: existing.checked_in_at, baru: false };
    } else {
      await run(
        `INSERT INTO checkins (participant_id, event_id, method, operator)
         VALUES (?, ?, 'manual', 'Pendaftaran mandiri')`,
        [participant.id, event.id]
      );
      const fresh = await one(
        "SELECT checked_in_at FROM checkins WHERE participant_id = ? LIMIT 1",
        [participant.id]
      );
      checkin = { at: fresh?.checked_in_at, baru: true };
    }
  }

  res.status(201).json({
    sudahTerdaftar,
    participant: {
      name: participant.name,
      code: participant.code,
      org: participant.org,
      ticket_type: participant.ticket_type,
    },
    event: { name: event.name, location: event.location, starts_at: event.starts_at },
    checkin,
  });
});

/* --------------------- QR pribadi peserta (berdasar kode) ------------------ */
router.get("/qr/:code.png", async (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const participant = await one("SELECT id FROM participants WHERE code = ? LIMIT 1", [code]);
  if (!participant) return res.status(404).send("Not found");

  const size = Math.min(1024, Math.max(120, Number(req.query.size) || 320));
  const png = await QRCode.toBuffer(code, {
    width: size,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#101014", light: "#ffffff" },
  });
  res.type("png").set("Cache-Control", "public, max-age=86400").send(png);
});

export default router;
