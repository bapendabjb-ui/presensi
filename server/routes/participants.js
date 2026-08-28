import { Router } from "express";
import QRCode from "qrcode";
import { all, one, run, pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { makeCode, parseCsv } from "../util.js";

const router = Router();

const SELECT = `
  SELECT p.*, c.checked_in_at, c.method AS checkin_method
  FROM participants p
  LEFT JOIN checkins c ON c.participant_id = p.id`;

/**
 * Kode unik dengan proteksi tabrakan. `taken` menampung kode yang sudah dipakai
 * di dalam transaksi berjalan — baris itu belum terlihat oleh koneksi lain.
 */
async function uniqueCode(taken = null) {
  for (let i = 0; i < 20; i++) {
    const code = makeCode();
    if (taken?.has(code)) continue;
    const clash = await one("SELECT id FROM participants WHERE code = ? LIMIT 1", [code]);
    if (!clash) {
      taken?.add(code);
      return code;
    }
  }
  const fallback = `PRS-${Date.now().toString(36).toUpperCase()}`;
  taken?.add(fallback);
  return fallback;
}

/* ---------- QR peserta (publik supaya bisa di-embed di email/undangan) ---------- */
router.get("/:id/qr.png", async (req, res) => {
  const p = await one("SELECT code FROM participants WHERE id = ?", [req.params.id]);
  if (!p) return res.status(404).send("Not found");
  const size = Math.min(1024, Math.max(120, Number(req.query.size) || 320));
  const png = await QRCode.toBuffer(p.code, {
    width: size,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#101014", light: "#ffffff" },
  });
  res.type("png").set("Cache-Control", "public, max-age=86400").send(png);
});

router.use(requireAuth);

/* ---------------------------- Daftar & pencarian ---------------------------- */
router.get("/", async (req, res) => {
  const { event_id, q = "", status = "", limit = 500, offset = 0 } = req.query;
  const where = [];
  const params = [];

  if (event_id) { where.push("p.event_id = ?"); params.push(event_id); }
  if (q) {
    where.push("(p.name LIKE ? OR p.email LIKE ? OR p.org LIKE ? OR p.code LIKE ? OR p.phone LIKE ?)");
    params.push(...Array(5).fill(`%${q}%`));
  }
  if (status === "hadir") where.push("c.id IS NOT NULL");
  if (status === "belum") where.push("c.id IS NULL");

  const clause = where.length ? "WHERE " + where.join(" AND ") : "";
  const rows = await all(
    `${SELECT} ${clause} ORDER BY p.name ASC LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  const [{ total }] = await all(
    `SELECT COUNT(*) AS total FROM participants p
     LEFT JOIN checkins c ON c.participant_id = p.id ${clause}`,
    params
  );
  res.json({ data: rows, total });
});

router.post("/", async (req, res) => {
  const { event_id, name, email, phone, org, ticket_type, note } = req.body;
  if (!event_id) return res.status(400).json({ error: "Event wajib dipilih." });
  if (!name?.trim()) return res.status(400).json({ error: "Nama peserta wajib diisi." });

  const event = await one("SELECT id FROM events WHERE id = ?", [event_id]);
  if (!event) return res.status(400).json({ error: "Event tidak ditemukan." });

  const result = await run(
    `INSERT INTO participants (event_id, code, name, email, phone, org, ticket_type, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event_id,
      await uniqueCode(),
      name.trim(),
      email?.trim() || null,
      phone?.trim() || null,
      org?.trim() || null,
      ticket_type?.trim() || "Reguler",
      note?.trim() || null,
    ]
  );
  res.status(201).json(await one(`${SELECT} WHERE p.id = ?`, [result.insertId]));
});

router.put("/:id", async (req, res) => {
  const { name, email, phone, org, ticket_type, note } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Nama peserta wajib diisi." });

  const result = await run(
    `UPDATE participants
        SET name = ?, email = ?, phone = ?, org = ?, ticket_type = ?, note = ?
      WHERE id = ?`,
    [
      name.trim(),
      email?.trim() || null,
      phone?.trim() || null,
      org?.trim() || null,
      ticket_type?.trim() || "Reguler",
      note?.trim() || null,
      req.params.id,
    ]
  );
  if (!result.affectedRows) return res.status(404).json({ error: "Peserta tidak ditemukan." });
  res.json(await one(`${SELECT} WHERE p.id = ?`, [req.params.id]));
});

router.delete("/:id", async (req, res) => {
  const result = await run("DELETE FROM participants WHERE id = ?", [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: "Peserta tidak ditemukan." });
  res.json({ ok: true });
});

/* -------------------------------- Impor CSV -------------------------------- */
const FIELD_ALIASES = {
  name: ["nama", "name", "nama peserta", "nama lengkap", "fullname", "full name"],
  email: ["email", "e-mail", "surel"],
  phone: ["phone", "telepon", "no hp", "nohp", "hp", "whatsapp", "wa", "telp"],
  org: ["org", "instansi", "organisasi", "perusahaan", "asal", "institusi", "company"],
  ticket_type: ["tipe", "tipe tiket", "kategori", "ticket", "ticket type", "jenis"],
  note: ["note", "catatan", "keterangan"],
};

function mapHeaders(headerRow) {
  const map = {};
  headerRow.forEach((raw, index) => {
    const key = raw.trim().toLowerCase();
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.includes(key)) map[field] = index;
    }
  });
  return map;
}

router.post("/import", async (req, res) => {
  const { event_id, csv } = req.body;
  if (!event_id) return res.status(400).json({ error: "Event wajib dipilih." });
  if (!csv?.trim()) return res.status(400).json({ error: "Isi CSV masih kosong." });

  const rows = parseCsv(csv);
  if (rows.length < 2) {
    return res.status(400).json({ error: "CSV butuh baris header dan minimal satu baris data." });
  }

  const map = mapHeaders(rows[0]);
  if (map.name === undefined) {
    return res.status(400).json({ error: 'Kolom "nama" tidak ditemukan di baris header.' });
  }

  const pick = (row, field) => (map[field] === undefined ? null : row[map[field]]?.trim() || null);

  const conn = await pool.getConnection();
  const taken = new Set();
  let imported = 0;
  const skipped = [];
  try {
    await conn.beginTransaction();
    for (let i = 1; i < rows.length; i++) {
      const name = pick(rows[i], "name");
      if (!name) { skipped.push({ line: i + 1, reason: "Nama kosong" }); continue; }
      await conn.query(
        `INSERT INTO participants (event_id, code, name, email, phone, org, ticket_type, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          event_id,
          await uniqueCode(taken),
          name,
          pick(rows[i], "email"),
          pick(rows[i], "phone"),
          pick(rows[i], "org"),
          pick(rows[i], "ticket_type") || "Reguler",
          pick(rows[i], "note"),
        ]
      );
      imported++;
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  res.json({ imported, skipped });
});

export default router;
