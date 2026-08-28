/**
 * Mengisi database dengan data contoh untuk mencoba aplikasi.
 * Jalankan: npm run seed
 */
import "../server/env.js";
import { initDb, run, one, all } from "../server/db.js";
import { makeCode, slugify } from "../server/util.js";

const EVENTS = [
  {
    name: "Seminar Nasional Transformasi Digital 2026",
    description: "Membahas arah kebijakan dan praktik transformasi digital di sektor publik.",
    location: "Auditorium Graha Utama, Jakarta",
    offsetDays: 0,
    hour: 8,
    status: "aktif",
  },
  {
    name: "Workshop UI/UX untuk Pemula",
    description: "Kelas praktik merancang antarmuka dari riset sampai prototipe.",
    location: "Ruang Kreatif Lt. 5, Bandung",
    offsetDays: 6,
    hour: 9,
    status: "aktif",
  },
  {
    name: "Rapat Koordinasi Tahunan",
    description: "Evaluasi capaian dan penyusunan rencana kerja tahun berikutnya.",
    location: "Hotel Nusantara, Ballroom B",
    offsetDays: -21,
    hour: 13,
    status: "selesai",
  },
];

const DEPAN = ["Budi", "Siti", "Andi", "Rina", "Dewi", "Agus", "Putri", "Rizky", "Maya", "Bayu",
  "Fitri", "Hendra", "Lestari", "Yoga", "Nadia", "Fajar", "Ayu", "Dimas", "Intan", "Reza",
  "Sari", "Iqbal", "Nur", "Galih", "Tari", "Bagus", "Wulan", "Arif", "Citra", "Eko"];
const BELAKANG = ["Santoso", "Rahayu", "Wijaya", "Pratama", "Lestari", "Nugroho", "Hakim", "Puspita",
  "Setiawan", "Anggraini", "Kurniawan", "Maulana", "Safitri", "Hidayat", "Permana"];
const INSTANSI = ["PT Nusantara Jaya", "Universitas Merdeka", "Dinas Kominfo", "CV Cipta Karya",
  "Yayasan Sinar Harapan", "PT Data Andalan", "Politeknik Negeri", "Startup Lokal", "Freelance"];
const TIPE = ["Reguler", "Reguler", "Reguler", "VIP", "Panitia", "Media"];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pad = (n) => String(n).padStart(2, "0");

function mysqlDate(d) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " +
    pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}

function shiftDays(days, hour = 8, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  await initDb();

  const existing = await one("SELECT COUNT(*) AS jumlah FROM events");
  if (Number(existing.jumlah) > 0) {
    console.log("\n  Database sudah berisi data — seed dilewati.");
    console.log("  Kosongkan tabel events lebih dulu bila ingin mengisi ulang.\n");
    process.exit(0);
  }

  const codes = new Set();
  function code() {
    let c;
    do { c = makeCode(); } while (codes.has(c));
    codes.add(c);
    return c;
  }

  for (const spec of EVENTS) {
    const mulai = shiftDays(spec.offsetDays, spec.hour);
    const selesai = shiftDays(spec.offsetDays, spec.hour + 8);

    const { insertId: eventId } = await run(
      `INSERT INTO events (name, slug, description, location, starts_at, ends_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [spec.name, slugify(spec.name), spec.description, spec.location,
       mysqlDate(mulai), mysqlDate(selesai), spec.status]
    );

    const jumlah = 28 + Math.floor(Math.random() * 22);
    // Event yang sudah selesai hampir penuh; event mendatang baru sebagian hadir.
    const rasioHadir = spec.status === "selesai" ? 0.92 : spec.offsetDays === 0 ? 0.55 : 0;

    for (let i = 0; i < jumlah; i++) {
      const nama = pick(DEPAN) + " " + pick(BELAKANG);
      const slugNama = nama.toLowerCase().replace(/\s+/g, ".");

      const { insertId: pid } = await run(
        `INSERT INTO participants (event_id, code, name, email, phone, org, ticket_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [eventId, code(), nama, slugNama + i + "@contoh.id",
         "08" + Math.floor(100000000 + Math.random() * 899999999),
         pick(INSTANSI), pick(TIPE)]
      );

      if (Math.random() < rasioHadir) {
        // Sebar waktu check-in di sekitar jam mulai agar grafik tren terlihat wajar.
        const menit = Math.round(Math.abs(randomNormal()) * 55) - 25;
        const waktu = shiftDays(spec.offsetDays, spec.hour, Math.max(-40, Math.min(240, menit)));
        await run(
          `INSERT INTO checkins (participant_id, event_id, checked_in_at, method, operator)
           VALUES (?, ?, ?, ?, ?)`,
          [pid, eventId, mysqlDate(waktu), Math.random() < 0.85 ? "qr" : "kode", "Admin"]
        );
      }
    }

    console.log("  + " + spec.name + " (" + jumlah + " peserta)");
  }

  const stats = await all(
    `SELECT (SELECT COUNT(*) FROM events) AS event,
            (SELECT COUNT(*) FROM participants) AS peserta,
            (SELECT COUNT(*) FROM checkins) AS hadir`
  );
  console.log("\n  Selesai: " + stats[0].event + " event, " + stats[0].peserta +
              " peserta, " + stats[0].hadir + " check-in.\n");
  process.exit(0);
}

/** Box–Muller: bikin sebaran waktu menumpuk di sekitar jam mulai. */
function randomNormal() {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

main().catch((err) => {
  console.error("\n  Seed gagal:", err.message, "\n");
  process.exit(1);
});
