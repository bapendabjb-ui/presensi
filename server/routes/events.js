import { Router } from "express";
import QRCode from "qrcode";
import { all, one, run } from "../db.js";
import { requireAuth } from "../auth.js";
import { slugify, toMysqlDate, makeToken } from "../util.js";

const router = Router();
router.use(requireAuth);

const SELF_MODES = ["off", "daftar", "hadir"];

/**
 * Token pendaftaran publik dibuat saat pendaftaran mandiri pertama kali
 * dinyalakan, lalu dipertahankan selamanya — QR yang sudah terlanjur
 * dicetak dan ditempel di lokasi acara harus tetap berfungsi.
 */
function resolveToken(mode, existingToken) {
  if (mode === "off") return existingToken ?? null;
  return existingToken || makeToken();
}

const STATS = `
  SELECT e.*,
         (SELECT COUNT(*) FROM participants p WHERE p.event_id = e.id) AS total_peserta,
         (SELECT COUNT(*) FROM checkins c WHERE c.event_id = e.id)     AS total_hadir
  FROM events e`;

/** Slug unik: tambahkan sufiks angka bila bentrok. */
async function uniqueSlug(name, ignoreId = null) {
  const base = slugify(name);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const clash = await one(
      "SELECT id FROM events WHERE slug = ? AND (? IS NULL OR id <> ?) LIMIT 1",
      [candidate, ignoreId, ignoreId]
    );
    if (!clash) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

router.get("/", async (req, res) => {
  const { q = "", status = "" } = req.query;
  const where = [];
  const params = [];
  if (q) { where.push("(e.name LIKE ? OR e.location LIKE ?)"); params.push(`%${q}%`, `%${q}%`); }
  if (status) { where.push("e.status = ?"); params.push(status); }
  const sql = `${STATS} ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY COALESCE(e.starts_at, e.created_at) DESC, e.id DESC`;
  res.json(await all(sql, params));
});

router.get("/:id", async (req, res) => {
  const event = await one(`${STATS} WHERE e.id = ?`, [req.params.id]);
  if (!event) return res.status(404).json({ error: "Event tidak ditemukan." });
  res.json(event);
});

router.post("/", async (req, res) => {
  const { name, description, location, starts_at, ends_at, status, color, self_register } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Nama event wajib diisi." });

  const mode = SELF_MODES.includes(self_register) ? self_register : "off";

  const result = await run(
    `INSERT INTO events (name, slug, description, location, starts_at, ends_at,
                         status, color, self_register, public_token)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name.trim(),
      await uniqueSlug(name),
      description?.trim() || null,
      location?.trim() || null,
      toMysqlDate(starts_at),
      toMysqlDate(ends_at),
      ["draft", "aktif", "selesai"].includes(status) ? status : "aktif",
      color || "brand",
      mode,
      resolveToken(mode, null),
    ]
  );
  res.status(201).json(await one(`${STATS} WHERE e.id = ?`, [result.insertId]));
});

router.put("/:id", async (req, res) => {
  const existing = await one("SELECT * FROM events WHERE id = ?", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Event tidak ditemukan." });

  const { name, description, location, starts_at, ends_at, status, color, self_register } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Nama event wajib diisi." });

  const mode = SELF_MODES.includes(self_register) ? self_register : existing.self_register;

  await run(
    `UPDATE events
        SET name = ?, slug = ?, description = ?, location = ?,
            starts_at = ?, ends_at = ?, status = ?, color = ?,
            self_register = ?, public_token = ?
      WHERE id = ?`,
    [
      name.trim(),
      name.trim() === existing.name ? existing.slug : await uniqueSlug(name, existing.id),
      description?.trim() || null,
      location?.trim() || null,
      toMysqlDate(starts_at),
      toMysqlDate(ends_at),
      ["draft", "aktif", "selesai"].includes(status) ? status : existing.status,
      color || existing.color,
      mode,
      resolveToken(mode, existing.public_token),
      req.params.id,
    ]
  );
  res.json(await one(`${STATS} WHERE e.id = ?`, [req.params.id]));
});

/**
 * QR berisi tautan pendaftaran mandiri — untuk poster di pintu masuk.
 * Isinya URL penuh, jadi kamera bawaan HP bisa langsung membukanya.
 */
router.get("/:id/register-qr.png", async (req, res) => {
  const event = await one("SELECT public_token FROM events WHERE id = ?", [req.params.id]);
  if (!event?.public_token) {
    return res.status(404).send("Pendaftaran mandiri belum dinyalakan untuk event ini.");
  }

  const origin = `${req.protocol}://${req.get("host")}`;
  const size = Math.min(1200, Math.max(160, Number(req.query.size) || 480));

  const png = await QRCode.toBuffer(`${origin}/daftar/${event.public_token}`, {
    width: size,
    margin: 1,
    errorCorrectionLevel: "M", // toleran terhadap cetakan yang sedikit kotor
    color: { dark: "#101014", light: "#ffffff" },
  });
  res.type("png").set("Cache-Control", "no-store").send(png);
});

router.delete("/:id", async (req, res) => {
  const result = await run("DELETE FROM events WHERE id = ?", [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: "Event tidak ditemukan." });
  res.json({ ok: true });
});

export default router;
