/* ============================================================
   register.js — halaman pendaftaran mandiri (publik).
   Dibuka pengunjung dari HP setelah memindai QR event.
   ============================================================ */
(function () {
  const { api, esc, fmtDayLong, fmtTime, emptyState } = window.UI;

  const token = decodeURIComponent(location.pathname.split("/").pop());
  const root = document.getElementById("root");

  function icons() {
    lucide.createIcons({ nameAttr: "data-lucide" });
  }

  function card(inner, extra = "") {
    return '<div class="card p-6 sm:p-7 animate-rise ' + extra + '">' + inner + "</div>";
  }

  function header(event) {
    const waktu = event.starts_at
      ? esc(fmtDayLong(event.starts_at)) + " · " + esc(fmtTime(event.starts_at))
      : null;

    return (
      '<div class="text-center mb-6">' +
        '<div class="mx-auto grid place-items-center h-14 w-14 rounded-2xl bg-brand-600 text-white ' +
          'shadow-lg shadow-brand-600/25 mb-4">' +
          '<i data-lucide="scan-line" class="h-6 w-6"></i>' +
        "</div>" +
        '<p class="text-[10px] font-extrabold uppercase tracking-[0.18em] text-brand-500">Pendaftaran Peserta</p>' +
        '<h1 class="text-[22px] font-extrabold leading-tight mt-2">' + esc(event.name) + "</h1>" +
        (waktu ? '<p class="text-[13px] text-muted mt-2">' + waktu + "</p>" : "") +
        (event.location
          ? '<p class="text-[13px] text-muted mt-0.5 flex items-center justify-center gap-1.5">' +
            '<i data-lucide="map-pin" class="h-3.5 w-3.5"></i>' + esc(event.location) + "</p>"
          : "") +
      "</div>"
    );
  }

  /* ------------------------------ Form isi ------------------------------ */
  function renderForm(event) {
    const field = (label, name, attrs, hint) =>
      '<div><label class="label" for="r-' + name + '">' + label + "</label>" +
      '<input id="r-' + name + '" name="' + name + '" class="input h-11" ' + attrs + " />" +
      (hint ? '<p class="text-[11px] text-muted mt-1.5">' + hint + "</p>" : "") + "</div>";

    root.innerHTML =
      header(event) +
      card(
        '<form id="form" class="space-y-4" novalidate>' +
          field("Nama lengkap", "name",
            'required maxlength="180" autocomplete="name" placeholder="Nama sesuai identitas"') +
          field("Email", "email",
            'type="email" maxlength="190" autocomplete="email" inputmode="email" placeholder="nama@email.com"') +
          field("Nomor WhatsApp", "phone",
            'maxlength="40" autocomplete="tel" inputmode="tel" placeholder="08xxxxxxxxxx"',
            "Isi email atau nomor WhatsApp — minimal salah satu.") +
          field("Instansi / asal", "org",
            'maxlength="190" autocomplete="organization" placeholder="Opsional"') +

          /* Umpan honeypot — disembunyikan dari manusia, sering diisi bot. */
          '<div class="hidden" aria-hidden="true">' +
            '<input name="website" tabindex="-1" autocomplete="off" /></div>' +

          '<p id="error" class="hidden items-start gap-2 text-sm text-rose-600 dark:text-rose-400 font-medium">' +
            '<i data-lucide="circle-alert" class="h-4 w-4 shrink-0 mt-0.5"></i><span></span></p>' +

          '<button type="submit" id="submit" class="btn btn-primary w-full h-12 text-[15px]">' +
            '<span class="label-text">' +
              (event.mode === "hadir" ? "Daftar & check-in" : "Daftar sekarang") + "</span>" +
            '<i data-lucide="arrow-right" class="h-4 w-4"></i></button>' +
        "</form>"
      ) +
      '<p class="text-[12px] text-muted text-center mt-5 leading-relaxed px-4">' +
        (event.mode === "hadir"
          ? "Kehadiran Anda langsung tercatat begitu formulir dikirim."
          : "Simpan kode peserta yang muncul setelah mendaftar — tunjukkan saat masuk.") +
      "</p>";

    icons();

    const form = document.getElementById("form");
    const button = document.getElementById("submit");
    const errorEl = document.getElementById("error");

    function showError(message) {
      errorEl.querySelector("span").textContent = message;
      errorEl.classList.remove("hidden");
      errorEl.classList.add("flex");
    }

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      errorEl.classList.add("hidden");
      errorEl.classList.remove("flex");

      const payload = Object.fromEntries(new FormData(form));

      if (payload.name.trim().length < 3) return showError("Nama minimal 3 huruf.");
      if (!payload.email.trim() && !payload.phone.trim()) {
        return showError("Isi email atau nomor WhatsApp sebagai kontak.");
      }

      button.disabled = true;
      button.querySelector(".label-text").textContent = "Mengirim…";

      try {
        const res = await api.post("/api/public/register/" + encodeURIComponent(token), payload);
        renderSuccess(res, event);
      } catch (err) {
        showError(err.message);
        button.disabled = false;
        button.querySelector(".label-text").textContent =
          event.mode === "hadir" ? "Daftar & check-in" : "Daftar sekarang";
      }
    });

    document.getElementById("r-name").focus();
  }

  /* ---------------------------- Layar berhasil ---------------------------- */
  function renderSuccess(res, event) {
    const p = res.participant;
    const hadir = res.checkin;

    const judul = hadir
      ? hadir.baru ? "Check-in berhasil" : "Anda sudah tercatat hadir"
      : res.sudahTerdaftar ? "Anda sudah terdaftar" : "Pendaftaran berhasil";

    const pesan = hadir
      ? hadir.baru
        ? "Silakan masuk ke ruang acara."
        : "Kehadiran Anda tercatat pada " + esc(fmtTime(hadir.at)) + ". Silakan masuk."
      : res.sudahTerdaftar
        ? "Data Anda sudah ada sebelumnya, jadi kami pakai kode yang lama."
        : "Tunjukkan QR di bawah kepada petugas saat masuk.";

    root.innerHTML =
      card(
        '<div class="text-center">' +
          '<div class="mx-auto grid place-items-center h-16 w-16 rounded-3xl mb-4 animate-pop ' +
            'bg-emerald-500/12 text-emerald-500">' +
            '<i data-lucide="circle-check" class="h-8 w-8"></i>' +
          "</div>" +
          '<h1 class="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">' + esc(judul) + "</h1>" +
          '<p class="text-[13px] text-muted mt-2 leading-relaxed">' + pesan + "</p>" +

          '<div class="mt-6 pt-6 border-t line">' +
            '<p class="text-xl font-extrabold text-strong leading-tight">' + esc(p.name) + "</p>" +
            (p.org ? '<p class="text-[13px] text-muted mt-1">' + esc(p.org) + "</p>" : "") +
            '<p class="text-[13px] text-muted mt-1">' + esc(event.name) + "</p>" +
          "</div>" +

          '<div class="mt-6 inline-block p-3 bg-white rounded-2xl border line">' +
            '<img src="/api/public/qr/' + encodeURIComponent(p.code) + '.png?size=440" ' +
              'alt="QR peserta" class="h-44 w-44 block" />' +
          "</div>" +

          '<p class="mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-muted">Kode peserta</p>' +
          '<p class="text-2xl font-extrabold text-strong tracking-[0.14em] mt-1">' + esc(p.code) + "</p>" +

          '<div class="mt-6 rounded-xl surface-sunken p-4 flex gap-3 text-left">' +
            '<i data-lucide="camera" class="h-4 w-4 text-brand-500 shrink-0 mt-0.5"></i>' +
            '<p class="text-[12px] leading-relaxed text-muted">' +
              "Simpan tangkapan layar halaman ini. Kalau QR tidak terbaca, " +
              "sebutkan saja kode peserta di atas kepada petugas." +
            "</p>" +
          "</div>" +

          '<button id="lagi" class="btn btn-outline w-full mt-4">' +
            '<i data-lucide="user-plus" class="h-4 w-4"></i> Daftarkan orang lain</button>' +
        "</div>"
      );

    icons();
    window.scrollTo({ top: 0, behavior: "smooth" });

    document.getElementById("lagi").addEventListener("click", () => renderForm(event));
  }

  /* -------------------------------- Muat -------------------------------- */
  (async function init() {
    root.innerHTML = '<div class="card h-96 skeleton border-0"></div>';

    try {
      const event = await api.get("/api/public/event/" + encodeURIComponent(token));
      document.title = "Daftar · " + event.name;
      renderForm(event);
    } catch (err) {
      root.innerHTML =
        '<div class="card">' +
        emptyState({
          icon: "link-2-off",
          title: "Pendaftaran tidak tersedia",
          message: err.message,
        }) +
        "</div>";
      icons();
    }
  })();
})();
