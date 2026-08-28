import { Router } from "express";
import { all, one, run } from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();
router.use(requireAuth);

const PARTICIPANT = `
  SELECT p.*, e.name AS event_name, e.status AS event_status,
         c.checked_in_at, c.method AS checkin_method
  FROM participants p
  JOIN events e ON e.id = p.event_id
  LEFT JOIN checkins c ON c.participant_id = p.id`;

/**
 * Proses satu scan.
 * Balasan selalu 200 dengan field `result` supaya layar kiosk bisa
 * membedakan sukses / duplikat / tidak dikenal tanpa menangani error HTTP.
 */
router.post("/scan", async (req, res) => {
  const { code, event_id, method = "qr", operator } = req.body;
  const raw = String(code ?? "").trim().toUpperCase();

  if (!raw) return res.json({ result: "invalid", message: "Kode kosong." });

  const participant = await one(`${PARTICIPANT} WHERE p.code = ?`, [raw]);

  if (!participant) {
    return res.json({
      result: "unknown",
      message: "Kode tidak terdaftar.",
      code: raw,
    });
  }

  if (event_id && Number(participant.event_id) !== Number(event_id)) {
    return res.json({
      result: "wrong_event",
      message: `Peserta ini terdaftar di "${participant.event_name}", bukan event yang sedang dibuka.`,
      participant,
    });
  }

  if (participant.checked_in_at) {
    return res.json({
      result: "duplicate",
      message: "Peserta sudah check-in sebelumnya.",
      participant,
    });
  }

  await run(
    `INSERT INTO checkins (participant_id, event_id, method, operator)
     VALUES (?, ?, ?, ?)`,
    [
      participant.id,
      participant.event_id,
      ["qr", "manual", "kode"].includes(method) ? method : "qr",
      operator || req.user?.name || null,
    ]
  );

  res.json({
    result: "ok",
    message: "Check-in berhasil.",
    participant: await one(`${PARTICIPANT} WHERE p.id = ?`, [participant.id]),
  });
});

/** Batalkan check-in (koreksi salah scan). */
router.delete("/:participantId", async (req, res) => {
  const result = await run("DELETE FROM checkins WHERE participant_id = ?", [
    req.params.participantId,
  ]);
  if (!result.affectedRows) {
    return res.status(404).json({ error: "Peserta ini belum tercatat hadir." });
  }
  res.json({ ok: true });
});

/** Umpan aktivitas terbaru untuk dashboard & kiosk. */
router.get("/recent", async (req, res) => {
  const { event_id, limit = 12 } = req.query;
  const params = [];
  let clause = "";
  if (event_id) { clause = "WHERE c.event_id = ?"; params.push(event_id); }

  res.json(
    await all(
      `SELECT c.id, c.checked_in_at, c.method,
              p.name, p.org, p.code, p.ticket_type,
              e.name AS event_name, e.id AS event_id
         FROM checkins c
         JOIN participants p ON p.id = c.participant_id
         JOIN events e ON e.id = c.event_id
         ${clause}
        ORDER BY c.checked_in_at DESC, c.id DESC
        LIMIT ?`,
      [...params, Number(limit)]
    )
  );
});

export default router;
