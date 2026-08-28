# Presensi — Aplikasi Presensi Peserta Event

Aplikasi presensi berbasis web untuk mengelola kehadiran peserta di berbagai event:
pindai QR di meja registrasi, kelola daftar peserta per event, pantau statistik
langsung, dan tarik laporan siap cetak atau ekspor CSV.

Dibangun dengan **Node.js + Express + MySQL**, antarmuka **Tailwind CSS v4** dan ikon
**Lucide**. Tanpa CDN eksternal — CSS di-*build* dan pustaka vendor disalin lokal saat
proses build, jadi aplikasi tetap jalan meski jaringan terbatas.

---

## Fitur

| Modul | Isi |
|---|---|
| **Dashboard** | Kartu statistik, grafik tren check-in per jam, cincin tingkat kehadiran, aktivitas terbaru |
| **Event** | Buat/ubah/hapus event, status draft–aktif–selesai, jadwal & lokasi, progres kehadiran |
| **Peserta** | Tabel dengan pencarian & filter, tambah/ubah/hapus, impor CSV massal, kode QR unik otomatis |
| **Check-in** | Pindai QR lewat kamera, input kode manual, dukungan barcode scanner USB, batalkan salah scan |
| **Mode Kiosk** | Layar penuh untuk meja registrasi: bingkai pindai, umpan balik besar, nada & getar, statistik langsung |
| **Laporan** | Rekap per event, rincian per tipe tiket, ekspor CSV, halaman cetak dengan kolom tanda tangan |
| **Badge** | Halaman badge peserta siap cetak ukuran A6 lanskap |

Tambahan: tema terang/gelap, tata letak responsif sampai layar ponsel, dan kode
peserta yang sengaja menghindari karakter ambigu (`0/O`, `1/I`, `S/5`, `B/8`) supaya
mudah dibacakan lewat telepon.

---

## Menjalankan di lokal

**Prasyarat:** Node.js 20+ dan MySQL (XAMPP sudah cukup).

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
npm run build             # kompilasi Tailwind + salin vendor
npm run seed              # opsional: isi 3 event & ~105 peserta contoh
npm start
```

Buka <http://localhost:3000> lalu masuk dengan password dari `ADMIN_PASSWORD`
(bawaan: `admin123`).

Untuk pengembangan dengan *auto-reload* CSS dan server:

```bash
npm run dev
```

Database `presensi` dibuat otomatis kalau belum ada, begitu juga seluruh tabelnya —
tidak perlu impor file `.sql` secara manual.

### Catatan soal kamera

`getUserMedia` hanya diizinkan browser di **HTTPS atau `localhost`**. Saat diakses
lewat IP LAN (`http://192.168.x.x:3000`) kamera akan ditolak — gunakan input kode
manual, atau akses lewat domain Railway yang sudah HTTPS.

---

## Deploy ke Railway

1. **Push proyek ini ke GitHub**, lalu di Railway pilih *New Project → Deploy from GitHub repo*.

2. **Tambahkan database MySQL**: di dalam project, klik *New → Database → Add MySQL*.

3. **Hubungkan variabel database.** Buka service aplikasi → tab *Variables* → *Add
   Variable Reference*, lalu pilih `MYSQL_URL` dari service MySQL. Aplikasi membaca
   `MYSQL_URL` (atau `DATABASE_URL`) lebih dulu sebelum variabel terpisah.

4. **Set variabel aplikasi:**

   | Variabel | Nilai |
   |---|---|
   | `ADMIN_PASSWORD` | password admin yang Anda pilih |
   | `SESSION_SECRET` | string acak panjang, mis. hasil `openssl rand -hex 32` |
   | `NODE_ENV` | `production` |

   `PORT` diisi Railway secara otomatis — tidak perlu diset sendiri.

5. **Deploy.** `railway.json` sudah mengatur build (`npm run build`), start
   (`npm start`), dan health check ke `/healthz`.

6. **Buka domain** dari tab *Settings → Networking → Generate Domain*.

Skema tabel dibuat otomatis pada boot pertama. Untuk mengisi data contoh di
produksi, jalankan `railway run npm run seed`.

---

## Struktur proyek

```
server/
  index.js              Express app, static, routing halaman
  env.js                Pemuat .env tanpa dependensi
  db.js                 Koneksi MySQL + skema (auto-migrate)
  auth.js               Sesi cookie bertanda tangan HMAC
  util.js               Kode peserta, slug, parser & penulis CSV
  routes/
    events.js           CRUD event + agregat peserta/hadir
    participants.js     CRUD peserta, impor CSV, QR PNG
    checkin.js          Proses scan, batalkan, riwayat
    reports.js          Ringkasan, tren, rincian, ekspor CSV
src/input.css           Design token & komponen Tailwind v4
public/
  login.html            Halaman masuk
  app.html              Shell panel admin (router hash)
  kiosk.html            Layar meja registrasi
  report.html           Pratinjau cetak laporan
  badge.html            Badge peserta siap cetak
  js/
    ui.js               API client, format, toast, modal, grafik SVG
    app.js              Router + seluruh tampilan panel
    kiosk.js            Logika layar kiosk
    scanner.js          Pemindai QR (BarcodeDetector / jsQR)
    theme.js            Pengalih tema
scripts/
  copy-vendor.js        Salin lucide & jsQR ke public/vendor
  seed.js               Data contoh
```

---

## Format CSV impor

Baris pertama adalah header. Hanya kolom **nama** yang wajib; pemisah koma maupun
titik koma sama-sama dikenali.

```csv
nama,email,telepon,instansi,tipe
Budi Santoso,budi@email.com,081234567890,PT Nusantara,VIP
"Wijaya, Ahmad",ahmad@email.com,081298765432,"PT Maju, Tbk",Reguler
```

Nama kolom yang dikenali otomatis:

| Field | Alias yang diterima |
|---|---|
| nama | `nama`, `name`, `nama peserta`, `nama lengkap`, `fullname` |
| email | `email`, `e-mail`, `surel` |
| telepon | `phone`, `telepon`, `no hp`, `hp`, `whatsapp`, `wa`, `telp` |
| instansi | `org`, `instansi`, `organisasi`, `perusahaan`, `asal`, `company` |
| tipe tiket | `tipe`, `tipe tiket`, `kategori`, `ticket`, `jenis` |
| catatan | `note`, `catatan`, `keterangan` |

Kode QR dibuat otomatis untuk setiap baris yang berhasil diimpor.

---

## Ringkasan API

Semua endpoint butuh sesi login, kecuali `POST /api/login` dan gambar QR peserta
(sengaja terbuka supaya bisa disematkan di email undangan).

| Method | Endpoint | Keterangan |
|---|---|---|
| `POST` | `/api/login` · `/api/logout` | Autentikasi admin |
| `GET/POST/PUT/DELETE` | `/api/events[/:id]` | CRUD event |
| `GET/POST/PUT/DELETE` | `/api/participants[/:id]` | CRUD peserta |
| `POST` | `/api/participants/import` | Impor CSV |
| `GET` | `/api/participants/:id/qr.png` | Gambar QR (publik) |
| `POST` | `/api/checkin/scan` | Proses satu kode |
| `DELETE` | `/api/checkin/:participantId` | Batalkan check-in |
| `GET` | `/api/checkin/recent` | Aktivitas terbaru |
| `GET` | `/api/reports/summary` · `/trend` | Data dashboard |
| `GET` | `/api/reports/event/:id` | Rincian laporan |
| `GET` | `/api/reports/event/:id/export.csv` | Unduh CSV |

`POST /api/checkin/scan` selalu membalas HTTP 200 dengan field `result` bernilai
`ok`, `duplicate`, `wrong_event`, `unknown`, atau `invalid` — supaya layar kiosk bisa
membedakan tiap kondisi tanpa menangani error HTTP.

---

## Keamanan

Aplikasi memakai **satu akun admin** dengan password dari environment variable, dan
sesi disimpan pada cookie `httpOnly` yang ditandatangani HMAC-SHA256 (berlaku 12
jam). Ini memadai untuk panitia internal. Bila nanti perlu banyak akun panitia dengan
peran berbeda, tabel `users` dan hashing bcrypt perlu ditambahkan.

Pastikan `SESSION_SECRET` diganti dengan string acak di produksi.
