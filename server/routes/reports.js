import { Router } from "express";
import { all, one } from "../db.js";
import { requireAuth } from "../auth.js";
import { csvFrom } from "../util.js";

const router = Router();
router.use(requireAuth);

/* --------------------------- Ringkasan dashboard --------------------------- */
router.get("/summary", async (req, res) => {
  const { event_id } = req.query;
  const scope = event_id ? "WHERE event_id = ?" : "";
  const p = event_id ? [event_id] : [];

  const [totals] = await all(
    `SELECT
       (SELECT COUNT(*) FROM participants ${scope}) AS total_peserta,
       (SELECT COUNT(*) FROM checkins ${scope})     AS total_hadir`,
    [...p, ...p]
  );

  const events = event_id
    ? [await one("SELECT COUNT(*) AS jumlah FROM events WHERE id = ?", [event_id])]
    : [await one("SELECT COUNT(*) AS jumlah FROM events")];

  const aktif = await one(
    `SELECT COUNT(*) AS jumlah FROM events WHERE status = 'aktif'` +
      (event_id ? " AND id = ?" : ""),
    p
  );

  const hariIni = await one(
    `SELECT COUNT(*) AS jumlah FROM checkins
      WHERE DATE(checked_in_at) = CURDATE()` + (event_id ? " AND event_id = ?" : ""),
    p
  );

  const total = Number(totals.total_peserta) || 0;
  const hadir = Number(totals.total_hadir) || 0;

  res.json({
    total_peserta: total,
    total_hadir: hadir,
    belum_hadir: Math.max(0, total - hadir),
    persentase: total ? Math.round((hadir / total) * 1000) / 10 : 0,
    total_event: Number(events[0]?.jumlah) || 0,
    event_aktif: Number(aktif?.jumlah) || 0,
    hadir_hari_ini: Number(hariIni?.jumlah) || 0,
  });
});

/* ------------------------ Tren check-in (untuk grafik) ---------------------- */
router.get("/trend", async (req, res) => {
  const { event_id, mode = "hour" } = req.query;
  const params = [];
  let clause = "";
  if (event_id) { clause = "WHERE event_id = ?"; params.push(event_id); }

  if (mode === "day") {
    const rows = await all(
      `SELECT DATE(checked_in_at) AS bucket, COUNT(*) AS jumlah
         FROM checkins ${clause}
        GROUP BY bucket ORDER BY bucket ASC LIMIT 60`,
      params
    );
    return res.json({ mode, points: rows });
  }

  // Per jam, khusus hari check-in paling ramai (fokus hari-H acara).
  const busiest = await one(
    `SELECT DATE(checked_in_at) AS hari, COUNT(*) AS jumlah
       FROM checkins ${clause}
      GROUP BY hari ORDER BY jumlah DESC, hari DESC LIMIT 1`,
    params
  );
  if (!busiest) return res.json({ mode, day: null, points: [] });

  const rows = await all(
    `SELECT HOUR(checked_in_at) AS jam, COUNT(*) AS jumlah
       FROM checkins
      WHERE DATE(checked_in_at) = ? ${event_id ? "AND event_id = ?" : ""}
      GROUP BY jam ORDER BY jam ASC`,
    event_id ? [busiest.hari, event_id] : [busiest.hari]
  );

  // Lengkapi jam kosong supaya garis grafik tidak putus.
  const byHour = new Map(rows.map((r) => [Number(r.jam), Number(r.jumlah)]));
  const jamAda = rows.map((r) => Number(r.jam));
  const mulai = Math.max(0, Math.min(...jamAda) - 1);
  const selesai = Math.min(23, Math.max(...jamAda) + 1);
  const points = [];
  for (let h = mulai; h <= selesai; h++) {
    points.push({ bucket: `${String(h).padStart(2, "0")}:00`, jumlah: byHour.get(h) || 0 });
  }

  res.json({ mode, day: busiest.hari, points });
});

/* ------------------------- Rincian laporan per event ------------------------ */
async function reportRows(eventId, status) {
  const where = ["p.event_id = ?"];
  const params = [eventId];
  if (status === "hadir") where.push("c.id IS NOT NULL");
  if (status === "belum") where.push("c.id IS NULL");

  return all(
    `SELECT p.code, p.name, p.email, p.phone, p.org, p.ticket_type,
            c.checked_in_at, c.method, c.operator
       FROM participants p
       LEFT JOIN checkins c ON c.participant_id = p.id
      WHERE ${where.join(" AND ")}
      ORDER BY (c.checked_in_at IS NULL), c.checked_in_at ASC, p.name ASC`,
    params
  );
}

router.get("/event/:id", async (req, res) => {
  const event = await one("SELECT * FROM events WHERE id = ?", [req.params.id]);
  if (!event) return res.status(404).json({ error: "Event tidak ditemukan." });

  const rows = await reportRows(req.params.id, req.query.status);
  const hadir = rows.filter((r) => r.checked_in_at).length;

  const perTipe = await all(
    `SELECT p.ticket_type AS tipe,
            COUNT(*) AS total,
            SUM(c.id IS NOT NULL) AS hadir
       FROM participants p
       LEFT JOIN checkins c ON c.participant_id = p.id
      WHERE p.event_id = ?
      GROUP BY p.ticket_type ORDER BY total DESC`,
    [req.params.id]
  );

  res.json({
    event,
    rows,
    perTipe,
    ringkasan: {
      total: rows.length,
      hadir,
      belum: rows.length - hadir,
      persentase: rows.length ? Math.round((hadir / rows.length) * 1000) / 10 : 0,
    },
  });
});

/* -------------------------------- Ekspor CSV -------------------------------- */
router.get("/event/:id/export.csv", async (req, res) => {
  const event = await one("SELECT * FROM events WHERE id = ?", [req.params.id]);
  if (!event) return res.status(404).send("Event tidak ditemukan.");

  const rows = await reportRows(req.params.id, req.query.status);
  const csv = csvFrom(
    ["Kode", "Nama", "Email", "Telepon", "Instansi", "Tipe Tiket", "Status", "Waktu Check-in", "Metode", "Operator"],
    rows.map((r) => [
      r.code, r.name, r.email, r.phone, r.org, r.ticket_type,
      r.checked_in_at ? "Hadir" : "Belum hadir",
      r.checked_in_at || "", r.method || "", r.operator || "",
    ])
  );

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `presensi-${event.slug}-${stamp}.csv`;
  res
    .type("text/csv; charset=utf-8")
    .set("Content-Disposition", `attachment; filename="${fileName}"`)
    .send(csv);
});

export default router;
