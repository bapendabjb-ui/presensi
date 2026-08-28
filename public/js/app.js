/* ============================================================
   app.js — router hash + seluruh tampilan panel admin
   ============================================================ */
(function () {
  const {
    api, esc, toast, modal, confirmDialog,
    fmtDate, fmtTime, fmtDayLong, fmtRelative, fmtNumber,
    initials, avatarTone, areaChart, progressRing, animateRings, emptyState,
  } = window.UI;

  const view = document.getElementById("view");
  const titleEl = document.getElementById("page-title");
  const subEl = document.getElementById("page-sub");

  /** Cache event agar dropdown filter tidak memanggil API berulang kali. */
  const store = { events: [], eventId: localStorage.lastEventId || "" };

  async function loadEvents(force = false) {
    if (force || !store.events.length) store.events = await api.get("/api/events");

    // Event yang tersimpan di localStorage bisa saja sudah dihapus — kalau
    // dibiarkan, semua filter memakai id hantu dan hasilnya selalu nol.
    if (store.eventId && !store.events.some((e) => String(e.id) === String(store.eventId))) {
      store.eventId = "";
      localStorage.removeItem("lastEventId");
    }
    return store.events;
  }

  function setHeader(title, subtitle = "") {
    titleEl.textContent = title;
    subEl.textContent = subtitle;
    document.title = title + " · Presensi";
  }

  function icons() {
    lucide.createIcons({ nameAttr: "data-lucide" });
  }

  function loading() {
    view.innerHTML =
      '<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">' +
      Array(4).fill('<div class="card h-28 skeleton border-0"></div>').join("") +
      '</div><div class="card h-72 mt-4 skeleton border-0"></div>';
  }

  function errorState(message) {
    view.innerHTML =
      '<div class="card">' +
      emptyState({
        icon: "server-crash",
        title: "Gagal memuat data",
        message: message,
        action: '<button class="btn btn-outline" onclick="location.reload()">' +
          '<i data-lucide="rotate-cw" class="h-4 w-4"></i> Muat ulang</button>',
      }) + "</div>";
    icons();
  }

  /* ================================================================
     Potongan UI yang dipakai berulang
     ================================================================ */

  function statCard({ label, value, sub, icon, tone = "brand" }) {
    const tones = {
      brand: "bg-brand-500/12 text-brand-600 dark:text-brand-400",
      emerald: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
      amber: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
      sky: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
    };
    return (
      '<div class="card p-5 transition hover:shadow-[var(--shadow-lift)]">' +
        '<div class="flex items-start justify-between gap-3">' +
          '<p class="text-[12px] font-bold uppercase tracking-wider text-muted">' + esc(label) + "</p>" +
          '<div class="grid place-items-center h-9 w-9 rounded-xl shrink-0 ' + tones[tone] + '">' +
            '<i data-lucide="' + icon + '" class="h-[18px] w-[18px]"></i>' +
          "</div>" +
        "</div>" +
        '<p class="mt-3 text-[30px] leading-none font-extrabold text-strong tracking-tight">' + esc(value) + "</p>" +
        (sub ? '<p class="mt-2 text-[12px] text-muted font-medium">' + esc(sub) + "</p>" : "") +
      "</div>"
    );
  }

  const STATUS_BADGE = {
    aktif: '<span class="badge badge-live"><i data-lucide="radio" class="h-3 w-3"></i>Aktif</span>',
    draft: '<span class="badge badge-off"><i data-lucide="pencil-line" class="h-3 w-3"></i>Draft</span>',
    selesai: '<span class="badge badge-ok"><i data-lucide="check" class="h-3 w-3"></i>Selesai</span>',
  };

  function avatar(name, size = "h-9 w-9 text-[12px]") {
    return (
      '<div class="grid place-items-center rounded-full shrink-0 font-bold ' + size + " " +
      avatarTone(name) + '">' + esc(initials(name)) + "</div>"
    );
  }

  /** Dropdown pilih event yang dipakai di beberapa halaman. */
  function eventSelect(id, selected, { allowAll = true, allLabel = "Semua event" } = {}) {
    const options = store.events
      .map((e) =>
        '<option value="' + e.id + '"' + (String(e.id) === String(selected) ? " selected" : "") + ">" +
        esc(e.name) + "</option>"
      )
      .join("");
    return (
      '<select id="' + id + '" class="input w-auto min-w-[190px] max-w-[280px] pr-9">' +
      (allowAll ? '<option value="">' + esc(allLabel) + "</option>" : "") +
      options + "</select>"
    );
  }

  /** Ikon chevron untuk select — dibungkus supaya panah tetap terlihat. */
  function selectWrap(inner) {
    return (
      '<div class="relative">' + inner +
      '<i data-lucide="chevron-down" class="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none"></i></div>'
    );
  }

  /* ================================================================
     Halaman: Dashboard
     ================================================================ */
  async function renderDashboard() {
    setHeader("Dashboard", "Ringkasan kehadiran seluruh event");
    loading();

    try {
      await loadEvents(true);
      const scope = store.eventId ? "?event_id=" + store.eventId : "";
      const [summary, trend, recent] = await Promise.all([
        api.get("/api/reports/summary" + scope),
        api.get("/api/reports/trend" + scope),
        api.get("/api/checkin/recent" + (store.eventId ? scope + "&limit=8" : "?limit=8")),
      ]);

      const upcoming = store.events
        .filter((e) => e.status !== "selesai")
        .slice(0, 4);

      view.innerHTML =
        /* --- baris filter --- */
        '<div class="flex flex-wrap items-center gap-3 mb-5">' +
          '<div class="mr-auto">' +
            '<h2 class="text-xl font-extrabold">Halo, panitia 👋</h2>' +
            '<p class="text-sm text-muted mt-0.5">' + esc(fmtDayLong(new Date().toISOString().slice(0, 10))) + "</p>" +
          "</div>" +
          selectWrap(eventSelect("scope", store.eventId)) +
          '<a href="#/checkin" class="btn btn-primary"><i data-lucide="scan-line" class="h-4 w-4"></i> Mulai check-in</a>' +
        "</div>" +

        /* --- kartu statistik --- */
        '<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">' +
          statCard({ label: "Total peserta", value: fmtNumber(summary.total_peserta),
                     sub: summary.total_event + " event terdaftar", icon: "users", tone: "brand" }) +
          statCard({ label: "Sudah hadir", value: fmtNumber(summary.total_hadir),
                     sub: summary.hadir_hari_ini + " check-in hari ini", icon: "user-check", tone: "emerald" }) +
          statCard({ label: "Belum hadir", value: fmtNumber(summary.belum_hadir),
                     sub: "Menunggu di meja registrasi", icon: "user-x", tone: "amber" }) +
          statCard({ label: "Event aktif", value: fmtNumber(summary.event_aktif),
                     sub: "Siap menerima peserta", icon: "calendar-check", tone: "sky" }) +
        "</div>" +

        '<div class="grid gap-4 mt-4 xl:grid-cols-3">' +

          /* --- grafik tren --- */
          '<div class="card p-5 xl:col-span-2">' +
            '<div class="flex items-start justify-between gap-4 mb-1">' +
              "<div>" +
                '<h3 class="font-bold">Tren check-in</h3>' +
                '<p class="text-[12px] text-muted mt-0.5">' +
                  (trend.day ? "Sebaran per jam · " + esc(fmtDate(trend.day)) : "Belum ada aktivitas") +
                "</p>" +
              "</div>" +
              '<span class="badge badge-live">' + (trend.points || []).reduce((a, p) => a + Number(p.jumlah), 0) + " scan</span>" +
            "</div>" +
            areaChart(trend.points || []) +
          "</div>" +

          /* --- cincin persentase --- */
          '<div class="card p-5 flex flex-col items-center justify-center text-center">' +
            '<h3 class="font-bold self-start">Tingkat kehadiran</h3>' +
            '<div class="relative my-4">' + progressRing(summary.persentase) +
              '<div class="absolute inset-0 grid place-items-center">' +
                '<div><p class="text-[26px] font-extrabold text-strong leading-none">' + summary.persentase + '<span class="text-base">%</span></p>' +
                '<p class="text-[11px] text-muted font-semibold mt-1">hadir</p></div>' +
              "</div>" +
            "</div>" +
            '<div class="w-full grid grid-cols-2 gap-2 text-left">' +
              '<div class="rounded-xl surface-sunken p-3">' +
                '<p class="text-[11px] font-bold uppercase tracking-wide text-muted">Hadir</p>' +
                '<p class="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">' + fmtNumber(summary.total_hadir) + "</p></div>" +
              '<div class="rounded-xl surface-sunken p-3">' +
                '<p class="text-[11px] font-bold uppercase tracking-wide text-muted">Belum</p>' +
                '<p class="text-lg font-extrabold text-amber-600 dark:text-amber-400 mt-0.5">' + fmtNumber(summary.belum_hadir) + "</p></div>" +
            "</div>" +
          "</div>" +
        "</div>" +

        '<div class="grid gap-4 mt-4 xl:grid-cols-3">' +

          /* --- aktivitas terbaru --- */
          '<div class="card xl:col-span-2 overflow-hidden">' +
            '<div class="flex items-center justify-between px-5 py-4 border-b line">' +
              '<h3 class="font-bold">Aktivitas terbaru</h3>' +
              '<a href="#/checkin" class="text-[13px] font-bold text-brand-600 dark:text-brand-400 hover:underline">Lihat semua</a>' +
            "</div>" +
            (recent.length
              ? '<ul class="divide-y line">' + recent.map(recentRow).join("") + "</ul>"
              : emptyState({ icon: "scan-line", title: "Belum ada check-in",
                             message: "Aktivitas peserta akan muncul di sini begitu QR pertama dipindai." })) +
          "</div>" +

          /* --- daftar event --- */
          '<div class="card overflow-hidden">' +
            '<div class="flex items-center justify-between px-5 py-4 border-b line">' +
              '<h3 class="font-bold">Event terdekat</h3>' +
              '<a href="#/events" class="text-[13px] font-bold text-brand-600 dark:text-brand-400 hover:underline">Kelola</a>' +
            "</div>" +
            (upcoming.length
              ? '<ul class="divide-y line">' + upcoming.map(eventMiniRow).join("") + "</ul>"
              : emptyState({ icon: "calendar-plus", title: "Belum ada event",
                             message: "Buat event pertama untuk mulai mendata peserta." })) +
          "</div>" +
        "</div>";

      icons();
      animateRings(view);
      updateCounts();

      document.getElementById("scope").addEventListener("change", (e) => {
        store.eventId = e.target.value;
        localStorage.lastEventId = store.eventId;
        renderDashboard();
      });
    } catch (err) {
      errorState(err.message);
    }
  }

  function recentRow(r) {
    return (
      '<li class="flex items-center gap-3 px-5 py-3 row-hover">' +
        avatar(r.name) +
        '<div class="min-w-0 flex-1">' +
          '<p class="text-sm font-semibold text-strong truncate">' + esc(r.name) + "</p>" +
          '<p class="text-[12px] text-muted truncate">' +
            esc(r.org || r.code) + " · " + esc(r.event_name) +
          "</p>" +
        "</div>" +
        '<div class="text-right shrink-0">' +
          '<p class="text-sm font-bold text-strong tabular-nums">' + fmtTime(r.checked_in_at) + "</p>" +
          '<p class="text-[11px] text-muted">' + esc(fmtRelative(r.checked_in_at)) + "</p>" +
        "</div>" +
      "</li>"
    );
  }

  function eventMiniRow(e) {
    const total = Number(e.total_peserta) || 0;
    const hadir = Number(e.total_hadir) || 0;
    const pct = total ? Math.round((hadir / total) * 100) : 0;
    return (
      '<li class="px-5 py-4 row-hover">' +
        '<div class="flex items-start justify-between gap-3">' +
          '<a href="#/participants?event=' + e.id + '" class="min-w-0 flex-1 group">' +
            '<p class="text-sm font-bold text-strong truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition">' +
              esc(e.name) + "</p>" +
            '<p class="text-[12px] text-muted truncate mt-0.5">' +
              (e.starts_at ? esc(fmtDate(e.starts_at, true)) : "Tanggal belum diatur") +
            "</p>" +
          "</a>" +
          (STATUS_BADGE[e.status] || "") +
        "</div>" +
        '<div class="mt-3 flex items-center gap-2.5">' +
          '<div class="h-1.5 flex-1 rounded-full surface-sunken overflow-hidden">' +
            '<div class="h-full rounded-full bg-brand-500 transition-all duration-700" style="width:' + pct + '%"></div>' +
          "</div>" +
          '<span class="text-[11px] font-bold text-muted tabular-nums shrink-0">' + hadir + "/" + total + "</span>" +
        "</div>" +
      "</li>"
    );
  }

  /* ================================================================
     Halaman: Event
     ================================================================ */
  async function renderEvents() {
    setHeader("Event", "Kelola seluruh acara dan jadwalnya");
    loading();

    try {
      const events = await loadEvents(true);
      updateCounts();

      view.innerHTML =
        '<div class="flex flex-wrap items-center gap-3 mb-5">' +
          '<div class="mr-auto min-w-[200px]">' +
            '<h2 class="text-xl font-extrabold">Daftar event</h2>' +
            '<p class="text-sm text-muted mt-0.5">' + events.length + " event terdaftar</p>" +
          "</div>" +
          '<div class="relative flex-1 min-w-[200px] max-w-xs">' +
            '<i data-lucide="search" class="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none"></i>' +
            '<input id="q" class="input pl-10" placeholder="Cari event…" />' +
          "</div>" +
          '<button id="new" class="btn btn-primary"><i data-lucide="plus" class="h-4 w-4"></i> Event baru</button>' +
        "</div>" +
        '<div id="grid" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"></div>';

      const grid = document.getElementById("grid");

      function paint(list) {
        grid.innerHTML = list.length
          ? list.map(eventCard).join("")
          : '<div class="card sm:col-span-2 xl:col-span-3">' +
            emptyState({
              icon: "calendar-plus",
              title: "Belum ada event",
              message: "Buat event pertama, lalu tambahkan daftar pesertanya.",
              action: '<button class="btn btn-primary" data-new><i data-lucide="plus" class="h-4 w-4"></i> Buat event</button>',
            }) + "</div>";
        icons();
      }

      paint(events);

      document.getElementById("q").addEventListener("input", (e) => {
        const q = e.target.value.toLowerCase();
        paint(events.filter((ev) =>
          ev.name.toLowerCase().includes(q) || (ev.location || "").toLowerCase().includes(q)
        ));
      });

      view.addEventListener("click", async (e) => {
        if (e.target.closest("#new, [data-new]")) return openEventForm();
        const card = e.target.closest("[data-event]");
        if (!card) return;
        const id = card.dataset.event;
        const event = events.find((x) => String(x.id) === id);

        if (e.target.closest("[data-edit]")) return openEventForm(event);
        if (e.target.closest("[data-delete]")) {
          const ok = await confirmDialog({
            title: "Hapus event?",
            message: '"' + event.name + '" beserta ' + event.total_peserta +
              " peserta dan catatan kehadirannya akan dihapus permanen.",
            confirmText: "Ya, hapus",
          });
          if (!ok) return;
          try {
            await api.del("/api/events/" + id);
            toast("Event dihapus.");
            renderEvents();
          } catch (err) { toast(err.message, "error"); }
        }
      });
    } catch (err) {
      errorState(err.message);
    }
  }

  function eventCard(e) {
    const total = Number(e.total_peserta) || 0;
    const hadir = Number(e.total_hadir) || 0;
    const pct = total ? Math.round((hadir / total) * 100) : 0;

    return (
      '<div class="card p-5 flex flex-col transition hover:shadow-[var(--shadow-lift)]" data-event="' + e.id + '">' +
        '<div class="flex items-start justify-between gap-3">' +
          (STATUS_BADGE[e.status] || "") +
          '<div class="flex gap-0.5 -mr-1.5 -mt-1">' +
            '<button data-edit class="btn btn-ghost btn-icon" aria-label="Ubah event">' +
              '<i data-lucide="pencil" class="h-4 w-4"></i></button>' +
            '<button data-delete class="btn btn-ghost btn-icon hover:text-rose-600" aria-label="Hapus event">' +
              '<i data-lucide="trash-2" class="h-4 w-4"></i></button>' +
          "</div>" +
        "</div>" +

        '<h3 class="mt-3 font-extrabold text-[17px] leading-snug text-strong">' + esc(e.name) + "</h3>" +
        (e.description
          ? '<p class="text-[13px] text-muted mt-1.5 leading-relaxed line-clamp-2">' + esc(e.description) + "</p>"
          : "") +

        '<div class="mt-4 space-y-2 text-[13px]">' +
          '<p class="flex items-center gap-2 text-muted">' +
            '<i data-lucide="calendar" class="h-4 w-4 shrink-0"></i>' +
            (e.starts_at ? esc(fmtDate(e.starts_at, true)) : "Tanggal belum diatur") + "</p>" +
          (e.location
            ? '<p class="flex items-center gap-2 text-muted"><i data-lucide="map-pin" class="h-4 w-4 shrink-0"></i>' +
              esc(e.location) + "</p>"
            : "") +
        "</div>" +

        '<div class="mt-4 pt-4 border-t line">' +
          '<div class="flex items-end justify-between mb-2">' +
            '<div><p class="text-[11px] font-bold uppercase tracking-wide text-muted">Kehadiran</p>' +
            '<p class="text-lg font-extrabold text-strong leading-tight mt-0.5">' +
              fmtNumber(hadir) + '<span class="text-muted font-bold text-sm"> / ' + fmtNumber(total) + "</span></p></div>" +
            '<span class="text-2xl font-extrabold text-brand-500 leading-none">' + pct + '<span class="text-sm">%</span></span>' +
          "</div>" +
          '<div class="h-1.5 rounded-full surface-sunken overflow-hidden">' +
            '<div class="h-full rounded-full bg-brand-500 transition-all duration-700" style="width:' + pct + '%"></div>' +
          "</div>" +
        "</div>" +

        '<div class="mt-4 flex gap-2">' +
          '<a href="#/participants?event=' + e.id + '" class="btn btn-outline btn-sm flex-1">' +
            '<i data-lucide="users" class="h-4 w-4"></i> Peserta</a>' +
          '<a href="#/reports?event=' + e.id + '" class="btn btn-outline btn-sm flex-1">' +
            '<i data-lucide="clipboard-list" class="h-4 w-4"></i> Laporan</a>' +
        "</div>" +
      "</div>"
    );
  }

  /** Ubah DATETIME MySQL jadi nilai untuk <input type="datetime-local">. */
  function toLocalInput(value) {
    return value ? String(value).replace(" ", "T").slice(0, 16) : "";
  }

  async function openEventForm(event = null) {
    const editing = Boolean(event);
    const field = (label, name, attrs, hint) =>
      '<div><label class="label" for="f-' + name + '">' + label + "</label>" +
      '<input id="f-' + name + '" name="' + name + '" class="input" ' + attrs + " />" +
      (hint ? '<p class="text-[11px] text-muted mt-1.5">' + hint + "</p>" : "") + "</div>";

    await modal({
      title: editing ? "Ubah event" : "Event baru",
      subtitle: editing ? event.name : "Isi detail acara yang akan digelar",
      size: "lg",
      body:
        '<form id="event-form" class="space-y-4">' +
          field("Nama event", "name", 'required maxlength="180" placeholder="Seminar Nasional Teknologi 2026" value="' + esc(event?.name) + '"') +
          '<div><label class="label" for="f-description">Deskripsi</label>' +
            '<textarea id="f-description" name="description" rows="2" class="input" ' +
            'placeholder="Keterangan singkat acara (opsional)">' + esc(event?.description) + "</textarea></div>" +
          field("Lokasi", "location", 'maxlength="190" placeholder="Gedung Serbaguna, Lantai 3" value="' + esc(event?.location) + '"') +
          '<div class="grid sm:grid-cols-2 gap-4">' +
            field("Mulai", "starts_at", 'type="datetime-local" value="' + toLocalInput(event?.starts_at) + '"') +
            field("Selesai", "ends_at", 'type="datetime-local" value="' + toLocalInput(event?.ends_at) + '"') +
          "</div>" +
          '<div><label class="label" for="f-status">Status</label>' +
            selectWrap(
              '<select id="f-status" name="status" class="input">' +
              ["aktif", "draft", "selesai"].map((s) =>
                '<option value="' + s + '"' + ((event?.status || "aktif") === s ? " selected" : "") + ">" +
                s.charAt(0).toUpperCase() + s.slice(1) + "</option>"
              ).join("") + "</select>"
            ) +
          "</div>" +
          '<p id="form-error" class="hidden text-sm font-medium text-rose-600 dark:text-rose-400"></p>' +
        "</form>",
      footer:
        '<button data-close class="btn btn-outline">Batal</button>' +
        '<button data-save class="btn btn-primary"><i data-lucide="check" class="h-4 w-4"></i> ' +
        (editing ? "Simpan perubahan" : "Buat event") + "</button>",
      onMount(wrap, close) {
        const form = wrap.querySelector("#event-form");
        const errorEl = wrap.querySelector("#form-error");
        const saveBtn = wrap.querySelector("[data-save]");

        async function submit() {
          const payload = Object.fromEntries(new FormData(form));
          if (!payload.name.trim()) {
            errorEl.textContent = "Nama event wajib diisi.";
            errorEl.classList.remove("hidden");
            return;
          }
          if (payload.starts_at && payload.ends_at && payload.ends_at < payload.starts_at) {
            errorEl.textContent = "Waktu selesai tidak boleh lebih awal dari waktu mulai.";
            errorEl.classList.remove("hidden");
            return;
          }

          saveBtn.disabled = true;
          try {
            if (editing) await api.put("/api/events/" + event.id, payload);
            else await api.post("/api/events", payload);
            toast(editing ? "Event diperbarui." : "Event berhasil dibuat.");
            close(true);
            renderEvents();
          } catch (err) {
            errorEl.textContent = err.message;
            errorEl.classList.remove("hidden");
            saveBtn.disabled = false;
          }
        }

        saveBtn.addEventListener("click", submit);
        form.addEventListener("submit", (e) => { e.preventDefault(); submit(); });
      },
    });
  }

  /* ================================================================
     Halaman: Peserta
     ================================================================ */
  async function renderParticipants(query) {
    setHeader("Peserta", "Kelola daftar peserta tiap event");

    const eventId = query.get("event") || store.eventId || "";
    store.eventId = eventId;
    if (eventId) localStorage.lastEventId = eventId;

    loading();

    try {
      await loadEvents();
      updateCounts();

      view.innerHTML =
        '<div class="flex flex-wrap items-center gap-3 mb-5">' +
          '<div class="mr-auto min-w-[180px]">' +
            '<h2 class="text-xl font-extrabold">Daftar peserta</h2>' +
            '<p id="meta" class="text-sm text-muted mt-0.5">Memuat…</p>' +
          "</div>" +
          selectWrap(eventSelect("f-event", eventId)) +
          selectWrap(
            '<select id="f-status" class="input w-auto pr-9">' +
              '<option value="">Semua status</option>' +
              '<option value="hadir">Sudah hadir</option>' +
              '<option value="belum">Belum hadir</option>' +
            "</select>"
          ) +
          '<div class="relative flex-1 min-w-[190px] max-w-xs">' +
            '<i data-lucide="search" class="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none"></i>' +
            '<input id="f-q" class="input pl-10" placeholder="Cari nama, kode, instansi…" />' +
          "</div>" +
          '<button id="import" class="btn btn-outline"><i data-lucide="upload" class="h-4 w-4"></i>' +
            '<span class="hidden sm:inline">Impor CSV</span></button>' +
          '<button id="add" class="btn btn-primary"><i data-lucide="user-plus" class="h-4 w-4"></i> Tambah</button>' +
        "</div>" +
        '<div class="card overflow-hidden">' +
          '<div class="overflow-x-auto"><table class="w-full min-w-[760px]">' +
            '<thead class="surface-sunken border-b line"><tr>' +
              '<th class="th">Peserta</th><th class="th">Kode</th><th class="th">Instansi</th>' +
              '<th class="th">Tipe</th><th class="th">Status</th><th class="th text-right">Aksi</th>' +
            "</tr></thead>" +
            '<tbody id="rows" class="divide-y line"></tbody>' +
          "</table></div>" +
        "</div>";

      icons();

      const rowsEl = document.getElementById("rows");
      const metaEl = document.getElementById("meta");
      let timer;

      async function load() {
        rowsEl.innerHTML =
          '<tr><td colspan="6" class="p-0">' +
          Array(5).fill('<div class="h-14 skeleton"></div>').join("") + "</td></tr>";

        const params = new URLSearchParams();
        const ev = document.getElementById("f-event").value;
        const st = document.getElementById("f-status").value;
        const q = document.getElementById("f-q").value.trim();
        if (ev) params.set("event_id", ev);
        if (st) params.set("status", st);
        if (q) params.set("q", q);

        try {
          const { data, total } = await api.get("/api/participants?" + params);
          const hadir = data.filter((p) => p.checked_in_at).length;
          metaEl.textContent =
            fmtNumber(total) + " peserta · " + fmtNumber(hadir) + " sudah hadir";

          rowsEl.innerHTML = data.length
            ? data.map(participantRow).join("")
            : '<tr><td colspan="6">' +
              emptyState({
                icon: q || st ? "search-x" : "user-plus",
                title: q || st ? "Tidak ada yang cocok" : "Belum ada peserta",
                message: q || st
                  ? "Coba ubah kata kunci atau filter statusnya."
                  : "Tambahkan peserta satu per satu atau impor sekaligus dari file CSV.",
              }) + "</td></tr>";
          icons();
        } catch (err) {
          rowsEl.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-sm text-rose-600">' +
            esc(err.message) + "</td></tr>";
        }
      }

      document.getElementById("f-event").addEventListener("change", (e) => {
        store.eventId = e.target.value;
        localStorage.lastEventId = store.eventId;
        load();
      });
      document.getElementById("f-status").addEventListener("change", load);
      document.getElementById("f-q").addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(load, 280);
      });

      document.getElementById("add").addEventListener("click", () =>
        openParticipantForm(null, document.getElementById("f-event").value, load)
      );
      document.getElementById("import").addEventListener("click", () =>
        openImport(document.getElementById("f-event").value, load)
      );

      rowsEl.addEventListener("click", async (e) => {
        const tr = e.target.closest("[data-id]");
        if (!tr) return;
        const id = tr.dataset.id;
        const name = tr.dataset.name;

        if (e.target.closest("[data-qr]")) return openQr(id, name, tr.dataset.code);
        if (e.target.closest("[data-edit]")) {
          const { data } = await api.get("/api/participants?q=" + encodeURIComponent(tr.dataset.code));
          return openParticipantForm(data[0], null, load);
        }
        if (e.target.closest("[data-undo]")) {
          const ok = await confirmDialog({
            title: "Batalkan check-in?",
            message: name + " akan kembali berstatus belum hadir.",
            confirmText: "Batalkan",
          });
          if (!ok) return;
          try {
            await api.del("/api/checkin/" + id);
            toast("Check-in dibatalkan.", "warning");
            load();
          } catch (err) { toast(err.message, "error"); }
        }
        if (e.target.closest("[data-checkin]")) {
          try {
            const res = await api.post("/api/checkin/scan", { code: tr.dataset.code, method: "manual" });
            toast(res.result === "ok" ? name + " berhasil check-in." : res.message,
                  res.result === "ok" ? "success" : "warning");
            load();
          } catch (err) { toast(err.message, "error"); }
        }
        if (e.target.closest("[data-delete]")) {
          const ok = await confirmDialog({
            title: "Hapus peserta?",
            message: name + " akan dihapus permanen dari daftar.",
            confirmText: "Ya, hapus",
          });
          if (!ok) return;
          try {
            await api.del("/api/participants/" + id);
            toast("Peserta dihapus.");
            load();
          } catch (err) { toast(err.message, "error"); }
        }
      });

      load();
    } catch (err) {
      errorState(err.message);
    }
  }

  function participantRow(p) {
    const hadir = Boolean(p.checked_in_at);
    return (
      '<tr class="row-hover" data-id="' + p.id + '" data-code="' + esc(p.code) +
        '" data-name="' + esc(p.name) + '">' +

        '<td class="td"><div class="flex items-center gap-3">' + avatar(p.name) +
          '<div class="min-w-0"><p class="font-semibold text-strong truncate">' + esc(p.name) + "</p>" +
          '<p class="text-[12px] text-muted truncate">' + esc(p.email || p.phone || "—") + "</p></div></div></td>" +

        '<td class="td"><code class="text-[12px] font-bold px-2 py-1 rounded-lg surface-sunken tracking-wide">' +
          esc(p.code) + "</code></td>" +

        '<td class="td text-muted">' + esc(p.org || "—") + "</td>" +
        '<td class="td"><span class="badge badge-off">' + esc(p.ticket_type) + "</span></td>" +

        '<td class="td">' + (hadir
          ? '<div><span class="badge badge-ok"><i data-lucide="check" class="h-3 w-3"></i>Hadir</span>' +
            '<p class="text-[11px] text-muted mt-1 tabular-nums">' + esc(fmtDate(p.checked_in_at, true)) + "</p></div>"
          : '<span class="badge badge-wait"><i data-lucide="clock" class="h-3 w-3"></i>Belum</span>') + "</td>" +

        '<td class="td"><div class="flex items-center justify-end gap-0.5">' +
          (hadir
            ? '<button data-undo class="btn btn-ghost btn-icon" title="Batalkan check-in">' +
              '<i data-lucide="rotate-ccw" class="h-4 w-4"></i></button>'
            : '<button data-checkin class="btn btn-ghost btn-icon hover:text-emerald-600" title="Check-in manual">' +
              '<i data-lucide="user-check" class="h-4 w-4"></i></button>') +
          '<button data-qr class="btn btn-ghost btn-icon" title="Lihat QR"><i data-lucide="qr-code" class="h-4 w-4"></i></button>' +
          '<button data-edit class="btn btn-ghost btn-icon" title="Ubah"><i data-lucide="pencil" class="h-4 w-4"></i></button>' +
          '<button data-delete class="btn btn-ghost btn-icon hover:text-rose-600" title="Hapus">' +
            '<i data-lucide="trash-2" class="h-4 w-4"></i></button>' +
        "</div></td>" +
      "</tr>"
    );
  }

  async function openParticipantForm(participant, defaultEvent, onDone) {
    const editing = Boolean(participant);
    const field = (label, name, attrs) =>
      '<div><label class="label" for="p-' + name + '">' + label + "</label>" +
      '<input id="p-' + name + '" name="' + name + '" class="input" ' + attrs + " /></div>";

    if (!editing && !defaultEvent && !store.events.length) {
      return toast("Buat event terlebih dulu sebelum menambah peserta.", "warning");
    }

    await modal({
      title: editing ? "Ubah peserta" : "Tambah peserta",
      subtitle: editing ? participant.code : "Kode QR dibuat otomatis setelah tersimpan",
      size: "lg",
      body:
        '<form id="p-form" class="space-y-4">' +
          (editing ? "" :
            '<div><label class="label" for="p-event_id">Event</label>' +
            selectWrap(
              '<select id="p-event_id" name="event_id" class="input" required>' +
              store.events.map((e) =>
                '<option value="' + e.id + '"' + (String(e.id) === String(defaultEvent) ? " selected" : "") +
                ">" + esc(e.name) + "</option>"
              ).join("") + "</select>"
            ) + "</div>") +
          field("Nama lengkap", "name", 'required maxlength="180" placeholder="Nama peserta" value="' + esc(participant?.name) + '"') +
          '<div class="grid sm:grid-cols-2 gap-4">' +
            field("Email", "email", 'type="email" maxlength="190" placeholder="nama@email.com" value="' + esc(participant?.email) + '"') +
            field("Telepon / WA", "phone", 'maxlength="40" placeholder="08xxxxxxxxxx" value="' + esc(participant?.phone) + '"') +
          "</div>" +
          '<div class="grid sm:grid-cols-2 gap-4">' +
            field("Instansi", "org", 'maxlength="190" placeholder="Nama instansi" value="' + esc(participant?.org) + '"') +
            field("Tipe tiket", "ticket_type", 'maxlength="60" placeholder="Reguler" value="' + esc(participant?.ticket_type || "Reguler") + '"') +
          "</div>" +
          field("Catatan", "note", 'maxlength="255" placeholder="Opsional" value="' + esc(participant?.note) + '"') +
          '<p id="p-error" class="hidden text-sm font-medium text-rose-600 dark:text-rose-400"></p>' +
        "</form>",
      footer:
        '<button data-close class="btn btn-outline">Batal</button>' +
        '<button data-save class="btn btn-primary"><i data-lucide="check" class="h-4 w-4"></i> Simpan</button>',
      onMount(wrap, close) {
        const form = wrap.querySelector("#p-form");
        const errorEl = wrap.querySelector("#p-error");
        const saveBtn = wrap.querySelector("[data-save]");

        async function submit() {
          const payload = Object.fromEntries(new FormData(form));
          if (!payload.name.trim()) {
            errorEl.textContent = "Nama peserta wajib diisi.";
            errorEl.classList.remove("hidden");
            return;
          }
          saveBtn.disabled = true;
          try {
            if (editing) await api.put("/api/participants/" + participant.id, payload);
            else await api.post("/api/participants", payload);
            toast(editing ? "Data peserta diperbarui." : "Peserta ditambahkan.");
            close(true);
            onDone?.();
          } catch (err) {
            errorEl.textContent = err.message;
            errorEl.classList.remove("hidden");
            saveBtn.disabled = false;
          }
        }

        saveBtn.addEventListener("click", submit);
        form.addEventListener("submit", (e) => { e.preventDefault(); submit(); });
      },
    });
  }

  function openQr(id, name, code) {
    return modal({
      title: "QR peserta",
      subtitle: name,
      size: "sm",
      body:
        '<div class="text-center">' +
          '<div class="inline-block p-4 bg-white rounded-2xl border line">' +
            '<img src="/api/participants/' + id + '/qr.png?size=440" alt="QR ' + esc(code) +
            '" class="h-56 w-56 block" />' +
          "</div>" +
          '<p class="mt-4 text-[11px] font-bold uppercase tracking-wider text-muted">Kode peserta</p>' +
          '<p class="text-xl font-extrabold text-strong tracking-[0.12em] mt-1">' + esc(code) + "</p>" +
          '<p class="text-[12px] text-muted mt-3 leading-relaxed">' +
            "Peserta bisa menunjukkan QR ini, atau menyebutkan kodenya bila QR tidak terbaca." +
          "</p>" +
        "</div>",
      footer:
        '<button data-close class="btn btn-outline">Tutup</button>' +
        '<a href="/badge/' + id + '" target="_blank" class="btn btn-primary">' +
          '<i data-lucide="printer" class="h-4 w-4"></i> Cetak badge</a>',
    });
  }

  const CSV_TEMPLATE =
    "nama,email,telepon,instansi,tipe\n" +
    "Budi Santoso,budi@email.com,081234567890,PT Nusantara,VIP\n" +
    "Siti Rahayu,siti@email.com,081298765432,Universitas Merdeka,Reguler";

  function openImport(defaultEvent, onDone) {
    return modal({
      title: "Impor peserta dari CSV",
      subtitle: "Kolom wajib: nama. Kolom lain opsional.",
      size: "lg",
      body:
        '<div class="space-y-4">' +
          '<div><label class="label" for="i-event">Masukkan ke event</label>' +
            selectWrap(
              '<select id="i-event" class="input">' +
              store.events.map((e) =>
                '<option value="' + e.id + '"' + (String(e.id) === String(defaultEvent) ? " selected" : "") +
                ">" + esc(e.name) + "</option>"
              ).join("") + "</select>"
            ) + "</div>" +

          '<div><label class="label">Berkas CSV</label>' +
            '<label for="i-file" class="flex flex-col items-center justify-center gap-2 py-7 px-4 rounded-xl ' +
              'border-2 border-dashed line cursor-pointer hover:border-brand-500 hover:bg-brand-500/[0.04] transition">' +
              '<i data-lucide="file-up" class="h-7 w-7 text-muted"></i>' +
              '<span id="i-filename" class="text-sm font-semibold text-strong">Pilih berkas .csv</span>' +
              '<span class="text-[12px] text-muted">atau tempel isinya di kotak bawah</span>' +
            "</label>" +
            '<input id="i-file" type="file" accept=".csv,text/csv" class="hidden" /></div>' +

          '<div><div class="flex items-center justify-between mb-1.5">' +
              '<label class="label mb-0" for="i-csv">Isi CSV</label>' +
              '<button id="i-sample" type="button" class="text-[12px] font-bold text-brand-600 dark:text-brand-400 hover:underline">' +
                "Isi contoh</button>" +
            "</div>" +
            '<textarea id="i-csv" rows="7" class="input font-mono text-[12px] leading-relaxed" ' +
              'placeholder="nama,email,telepon,instansi,tipe&#10;Budi Santoso,budi@email.com,0812…,PT Nusantara,VIP"></textarea>' +
          "</div>" +

          '<div class="rounded-xl surface-sunken p-3.5 flex gap-3">' +
            '<i data-lucide="info" class="h-4 w-4 text-brand-500 shrink-0 mt-0.5"></i>' +
            '<p class="text-[12px] leading-relaxed text-muted">' +
              "Nama kolom dikenali otomatis: <b>nama/name</b>, <b>email</b>, <b>telepon/hp/wa</b>, " +
              "<b>instansi/organisasi</b>, <b>tipe/kategori</b>, <b>catatan</b>. Kode QR dibuat otomatis." +
            "</p>" +
          "</div>" +

          '<p id="i-error" class="hidden text-sm font-medium text-rose-600 dark:text-rose-400"></p>' +
        "</div>",
      footer:
        '<button data-close class="btn btn-outline">Batal</button>' +
        '<button data-import class="btn btn-primary"><i data-lucide="upload" class="h-4 w-4"></i> Impor</button>',
      onMount(wrap, close) {
        const fileInput = wrap.querySelector("#i-file");
        const textarea = wrap.querySelector("#i-csv");
        const errorEl = wrap.querySelector("#i-error");
        const button = wrap.querySelector("[data-import]");

        fileInput.addEventListener("change", () => {
          const file = fileInput.files?.[0];
          if (!file) return;
          wrap.querySelector("#i-filename").textContent = file.name;
          const reader = new FileReader();
          reader.onload = () => { textarea.value = reader.result; };
          reader.readAsText(file, "utf-8");
        });

        wrap.querySelector("#i-sample").addEventListener("click", () => {
          textarea.value = CSV_TEMPLATE;
        });

        button.addEventListener("click", async () => {
          const csv = textarea.value.trim();
          if (!csv) {
            errorEl.textContent = "Isi CSV masih kosong.";
            errorEl.classList.remove("hidden");
            return;
          }
          button.disabled = true;
          try {
            const res = await api.post("/api/participants/import", {
              event_id: wrap.querySelector("#i-event").value,
              csv,
            });
            toast(
              res.imported + " peserta diimpor" +
              (res.skipped.length ? " · " + res.skipped.length + " baris dilewati" : "."),
              res.skipped.length ? "warning" : "success"
            );
            close(true);
            onDone?.();
          } catch (err) {
            errorEl.textContent = err.message;
            errorEl.classList.remove("hidden");
            button.disabled = false;
          }
        });
      },
    });
  }

  /* ================================================================
     Halaman: Check-in
     ================================================================ */
  let activeScanner = null;

  async function renderCheckin(query) {
    setHeader("Check-in", "Pindai QR atau masukkan kode peserta");

    const eventId = query.get("event") || store.eventId || "";
    loading();

    try {
      await loadEvents();
      updateCounts();

      view.innerHTML =
        '<div class="flex flex-wrap items-center gap-3 mb-5">' +
          '<div class="mr-auto min-w-[180px]">' +
            '<h2 class="text-xl font-extrabold">Meja registrasi</h2>' +
            '<p class="text-sm text-muted mt-0.5">Arahkan QR peserta ke kamera</p>' +
          "</div>" +
          selectWrap(eventSelect("c-event", eventId, { allLabel: "Terima semua event" })) +
          '<a href="/kiosk" target="_blank" class="btn btn-outline">' +
            '<i data-lucide="maximize" class="h-4 w-4"></i> Mode kiosk</a>' +
        "</div>" +

        '<div class="grid gap-4 xl:grid-cols-5">' +

          /* --- kamera --- */
          '<div class="card p-5 xl:col-span-3">' +
            '<div class="flex items-center justify-between gap-3 mb-4">' +
              '<h3 class="font-bold">Pemindai QR</h3>' +
              '<div class="flex items-center gap-2">' +
                /* Pembungkusnya yang disembunyikan, supaya ikon chevron ikut hilang. */
                '<div id="c-camera-wrap" class="relative hidden">' +
                  '<select id="c-camera" class="input h-9 w-auto max-w-[170px] text-[13px] pr-9"></select>' +
                  '<i data-lucide="chevron-down" class="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none"></i>' +
                "</div>" +
                '<button id="c-toggle" class="btn btn-primary btn-sm">' +
                  '<i data-lucide="camera" class="h-4 w-4"></i> Nyalakan</button>' +
              "</div>" +
            "</div>" +

            '<div id="c-stage" class="relative aspect-[4/3] rounded-xl2 overflow-hidden surface-sunken">' +
              '<video id="c-video" class="absolute inset-0 h-full w-full object-cover" muted playsinline></video>' +
              '<div id="c-idle" class="absolute inset-0 grid place-items-center text-center p-6">' +
                '<div><div class="mx-auto grid place-items-center h-14 w-14 rounded-2xl surface text-muted mb-3 border line">' +
                  '<i data-lucide="camera-off" class="h-6 w-6"></i></div>' +
                  '<p class="font-bold text-strong">Kamera belum aktif</p>' +
                  '<p class="text-[13px] text-muted mt-1 max-w-xs">Nyalakan kamera untuk mulai memindai, ' +
                    "atau gunakan input kode di samping.</p></div>" +
              "</div>" +
              /* bingkai bidik */
              '<div id="c-frame" class="absolute inset-0 hidden pointer-events-none">' +
                '<div class="absolute inset-0 bg-black/25"></div>' +
                '<div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[62%] aspect-square">' +
                  '<div class="absolute inset-0 rounded-2xl" style="box-shadow:0 0 0 9999px rgba(0,0,0,.35)"></div>' +
                  '<div class="absolute -left-1 -top-1 h-9 w-9 border-t-[3px] border-l-[3px] border-white rounded-tl-xl"></div>' +
                  '<div class="absolute -right-1 -top-1 h-9 w-9 border-t-[3px] border-r-[3px] border-white rounded-tr-xl"></div>' +
                  '<div class="absolute -left-1 -bottom-1 h-9 w-9 border-b-[3px] border-l-[3px] border-white rounded-bl-xl"></div>' +
                  '<div class="absolute -right-1 -bottom-1 h-9 w-9 border-b-[3px] border-r-[3px] border-white rounded-br-xl"></div>' +
                  '<div class="absolute left-2 right-2 h-0.5 bg-brand-400 rounded-full animate-sweep ' +
                    'shadow-[0_0_14px_2px_var(--color-brand-400)] top-1/2"></div>' +
                "</div>" +
              "</div>" +
            "</div>" +

            '<p id="c-hint" class="mt-3 text-[12px] text-muted text-center"></p>' +

            /* --- input kode manual --- */
            '<div class="mt-4 pt-4 border-t line">' +
              '<label class="label" for="c-code">Input kode manual</label>' +
              '<form id="c-form" class="flex gap-2">' +
                '<input id="c-code" class="input font-bold tracking-[0.14em] uppercase" ' +
                  'placeholder="PRS-XXXXXX" autocomplete="off" />' +
                '<button class="btn btn-primary shrink-0"><i data-lucide="corner-down-left" class="h-4 w-4"></i>' +
                  '<span class="hidden sm:inline">Check-in</span></button>' +
              "</form>" +
              '<p class="text-[11px] text-muted mt-2">Cocok juga untuk barcode scanner USB — ' +
                "alat itu mengetik kode lalu menekan Enter otomatis.</p>" +
            "</div>" +
          "</div>" +

          /* --- hasil & riwayat --- */
          '<div class="xl:col-span-2 flex flex-col gap-4">' +
            '<div id="c-result" class="card p-5"></div>' +
            '<div class="card overflow-hidden flex-1">' +
              '<div class="flex items-center justify-between px-5 py-4 border-b line">' +
                '<h3 class="font-bold">Riwayat check-in</h3>' +
                '<button id="c-refresh" class="btn btn-ghost btn-icon" title="Muat ulang">' +
                  '<i data-lucide="rotate-cw" class="h-4 w-4"></i></button>' +
              "</div>" +
              '<ul id="c-recent" class="divide-y line max-h-[420px] overflow-y-auto"></ul>' +
            "</div>" +
          "</div>" +
        "</div>";

      icons();

      const videoEl = document.getElementById("c-video");
      const idleEl = document.getElementById("c-idle");
      const frameEl = document.getElementById("c-frame");
      const toggleBtn = document.getElementById("c-toggle");
      const cameraSelect = document.getElementById("c-camera");
      const hintEl = document.getElementById("c-hint");
      const resultEl = document.getElementById("c-result");
      const recentEl = document.getElementById("c-recent");
      const codeInput = document.getElementById("c-code");

      idleResult();

      /* ---- riwayat ---- */
      async function loadRecent() {
        const ev = document.getElementById("c-event").value;
        try {
          const rows = await api.get("/api/checkin/recent?limit=15" + (ev ? "&event_id=" + ev : ""));
          recentEl.innerHTML = rows.length
            ? rows.map(recentRow).join("")
            : emptyState({ icon: "history", title: "Belum ada riwayat",
                           message: "Check-in yang berhasil akan tercatat di sini." });
          icons();
        } catch (err) {
          recentEl.innerHTML = '<li class="p-5 text-sm text-rose-600">' + esc(err.message) + "</li>";
        }
      }

      /* ---- panel hasil ---- */
      function idleResult() {
        resultEl.className = "card p-5";
        resultEl.innerHTML =
          '<div class="text-center py-6">' +
            '<div class="mx-auto grid place-items-center h-12 w-12 rounded-2xl surface-sunken text-muted mb-3">' +
              '<i data-lucide="scan-line" class="h-5 w-5"></i></div>' +
            '<p class="font-bold text-strong">Menunggu pemindaian</p>' +
            '<p class="text-[13px] text-muted mt-1">Hasil check-in muncul di sini.</p>' +
          "</div>";
        icons();
      }

      const RESULT_STYLE = {
        ok: ["circle-check", "text-emerald-600 dark:text-emerald-400", "bg-emerald-500/12", "border-emerald-500/40"],
        duplicate: ["clock-alert", "text-amber-600 dark:text-amber-400", "bg-amber-500/12", "border-amber-500/40"],
        wrong_event: ["triangle-alert", "text-amber-600 dark:text-amber-400", "bg-amber-500/12", "border-amber-500/40"],
        unknown: ["circle-x", "text-rose-600 dark:text-rose-400", "bg-rose-500/12", "border-rose-500/40"],
        invalid: ["circle-x", "text-rose-600 dark:text-rose-400", "bg-rose-500/12", "border-rose-500/40"],
      };

      function showResult(res) {
        const [icon, tone, bg, border] = RESULT_STYLE[res.result] || RESULT_STYLE.invalid;
        const p = res.participant;

        resultEl.className = "card p-5 border-2 " + border + " animate-pop";
        resultEl.innerHTML =
          '<div class="flex items-start gap-3.5">' +
            '<div class="grid place-items-center h-12 w-12 rounded-2xl shrink-0 ' + bg + " " + tone + '">' +
              '<i data-lucide="' + icon + '" class="h-6 w-6"></i></div>' +
            '<div class="min-w-0 flex-1">' +
              '<p class="font-extrabold text-[15px] ' + tone + '">' +
                (res.result === "ok" ? "Check-in berhasil" :
                 res.result === "duplicate" ? "Sudah pernah check-in" :
                 res.result === "wrong_event" ? "Event tidak cocok" : "Kode tidak dikenal") + "</p>" +
              '<p class="text-[13px] text-muted mt-0.5 leading-relaxed">' + esc(res.message) + "</p>" +
            "</div>" +
          "</div>" +
          (p
            ? '<div class="mt-4 pt-4 border-t line flex items-center gap-3">' +
                avatar(p.name, "h-11 w-11 text-sm") +
                '<div class="min-w-0 flex-1">' +
                  '<p class="font-bold text-strong truncate">' + esc(p.name) + "</p>" +
                  '<p class="text-[12px] text-muted truncate">' + esc(p.org || p.email || p.code) + "</p>" +
                  '<div class="flex flex-wrap gap-1.5 mt-1.5">' +
                    '<span class="badge badge-off">' + esc(p.ticket_type) + "</span>" +
                    '<span class="badge badge-live">' + esc(p.event_name) + "</span>" +
                  "</div>" +
                "</div>" +
                (p.checked_in_at
                  ? '<div class="text-right shrink-0"><p class="text-lg font-extrabold text-strong tabular-nums">' +
                    fmtTime(p.checked_in_at) + '</p><p class="text-[11px] text-muted">' +
                    esc(fmtDate(p.checked_in_at)) + "</p></div>"
                  : "") +
              "</div>"
            : res.code
              ? '<div class="mt-4 pt-4 border-t line"><p class="text-[11px] font-bold uppercase tracking-wider text-muted">Kode terbaca</p>' +
                '<p class="font-extrabold text-strong tracking-wider mt-1">' + esc(res.code) + "</p></div>"
              : "");
        icons();
      }

      /* ---- proses satu kode ---- */
      let busy = false;
      async function submitCode(code, method) {
        if (busy || !code) return;
        busy = true;
        try {
          const res = await api.post("/api/checkin/scan", {
            code,
            event_id: document.getElementById("c-event").value || undefined,
            method,
          });
          showResult(res);
          beep(res.result === "ok");
          if (res.result === "ok") loadRecent();
        } catch (err) {
          toast(err.message, "error");
        } finally {
          busy = false;
        }
      }

      /* ---- kamera ---- */
      async function fillCameras() {
        try {
          const cams = await window.QrScanner.listCameras();
          if (cams.length > 1) {
            cameraSelect.innerHTML = cams
              .map((c, i) => '<option value="' + c.deviceId + '">' + esc(c.label || "Kamera " + (i + 1)) + "</option>")
              .join("");
            document.getElementById("c-camera-wrap").classList.remove("hidden");
          }
        } catch { /* daftar kamera tidak wajib */ }
      }

      async function startCamera() {
        hintEl.textContent = "Meminta izin kamera…";
        activeScanner = new window.QrScanner(videoEl, (code) => submitCode(code, "qr"));
        try {
          await activeScanner.start(cameraSelect.value || undefined);
          idleEl.classList.add("hidden");
          frameEl.classList.remove("hidden");
          toggleBtn.className = "btn btn-outline btn-sm";
          toggleBtn.innerHTML = '<i data-lucide="camera-off" class="h-4 w-4"></i> Matikan';
          hintEl.textContent = activeScanner.detector
            ? "Pemindai cepat aktif (BarcodeDetector)."
            : "Pemindai aktif. Pastikan QR terlihat jelas dan cahaya cukup.";
          await fillCameras();
          icons();
        } catch (err) {
          activeScanner = null;
          hintEl.textContent = "";
          toast(err.message, "error");
        }
      }

      async function stopCamera() {
        await activeScanner?.stop();
        activeScanner = null;
        idleEl.classList.remove("hidden");
        frameEl.classList.add("hidden");
        toggleBtn.className = "btn btn-primary btn-sm";
        toggleBtn.innerHTML = '<i data-lucide="camera" class="h-4 w-4"></i> Nyalakan';
        hintEl.textContent = "";
        icons();
      }

      toggleBtn.addEventListener("click", () => (activeScanner ? stopCamera() : startCamera()));
      cameraSelect.addEventListener("change", () => { if (activeScanner) startCamera(); });

      document.getElementById("c-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const code = codeInput.value.trim();
        codeInput.value = "";
        submitCode(code, "kode");
      });

      document.getElementById("c-refresh").addEventListener("click", loadRecent);
      document.getElementById("c-event").addEventListener("change", (e) => {
        store.eventId = e.target.value;
        localStorage.lastEventId = store.eventId;
        loadRecent();
      });

      codeInput.focus();
      loadRecent();
    } catch (err) {
      errorState(err.message);
    }
  }

  /** Nada singkat sebagai umpan balik — tidak butuh berkas audio. */
  let audioCtx;
  function beep(success) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = "sine";
      osc.frequency.value = success ? 880 : 220;
      gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.16, audioCtx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.22);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.24);
      if (navigator.vibrate) navigator.vibrate(success ? 40 : [50, 40, 50]);
    } catch { /* audio diblokir browser — abaikan */ }
  }

  /* ================================================================
     Halaman: Laporan
     ================================================================ */
  async function renderReports(query) {
    setHeader("Laporan", "Rekap kehadiran dan ekspor data");
    loading();

    try {
      await loadEvents();
      updateCounts();

      if (!store.events.length) {
        view.innerHTML = '<div class="card">' + emptyState({
          icon: "clipboard-list",
          title: "Belum ada event",
          message: "Laporan tersedia setelah ada event dan peserta.",
          action: '<a href="#/events" class="btn btn-primary"><i data-lucide="plus" class="h-4 w-4"></i> Buat event</a>',
        }) + "</div>";
        icons();
        return;
      }

      const eventId = query.get("event") || store.eventId || store.events[0].id;
      store.eventId = String(eventId);
      localStorage.lastEventId = store.eventId;

      view.innerHTML =
        '<div class="flex flex-wrap items-center gap-3 mb-5">' +
          '<div class="mr-auto min-w-[180px]">' +
            '<h2 class="text-xl font-extrabold">Laporan presensi</h2>' +
            '<p class="text-sm text-muted mt-0.5">Rekap per event, siap diekspor</p>' +
          "</div>" +
          selectWrap(eventSelect("r-event", eventId, { allowAll: false })) +
          selectWrap(
            '<select id="r-status" class="input w-auto pr-9">' +
              '<option value="">Semua peserta</option>' +
              '<option value="hadir">Hanya yang hadir</option>' +
              '<option value="belum">Hanya yang belum</option>' +
            "</select>"
          ) +
          '<button id="r-export" class="btn btn-outline">' +
            '<i data-lucide="file-down" class="h-4 w-4"></i> Ekspor CSV</button>' +
          '<a id="r-print" href="#" target="_blank" class="btn btn-primary">' +
            '<i data-lucide="printer" class="h-4 w-4"></i> Cetak</a>' +
        "</div>" +
        '<div id="r-body"></div>';

      icons();

      const bodyEl = document.getElementById("r-body");

      async function load() {
        const id = document.getElementById("r-event").value;
        const status = document.getElementById("r-status").value;
        store.eventId = String(id);
        localStorage.lastEventId = store.eventId;
        document.getElementById("r-print").href = "/laporan/" + id + (status ? "?status=" + status : "");

        bodyEl.innerHTML =
          '<div class="grid gap-4 sm:grid-cols-4">' +
          Array(4).fill('<div class="card h-28 skeleton border-0"></div>').join("") +
          '</div><div class="card h-96 mt-4 skeleton border-0"></div>';

        try {
          const data = await api.get("/api/reports/event/" + id + (status ? "?status=" + status : ""));
          bodyEl.innerHTML = reportBody(data);
          icons();
          animateRings(bodyEl);
        } catch (err) {
          bodyEl.innerHTML = '<div class="card">' +
            emptyState({ icon: "server-crash", title: "Gagal memuat laporan", message: err.message }) + "</div>";
          icons();
        }
      }

      document.getElementById("r-event").addEventListener("change", load);
      document.getElementById("r-status").addEventListener("change", load);
      document.getElementById("r-export").addEventListener("click", () => {
        const id = document.getElementById("r-event").value;
        const status = document.getElementById("r-status").value;
        location.href = "/api/reports/event/" + id + "/export.csv" + (status ? "?status=" + status : "");
        toast("Berkas CSV sedang diunduh.");
      });

      load();
    } catch (err) {
      errorState(err.message);
    }
  }

  function reportBody(data) {
    const { event, rows, ringkasan, perTipe } = data;

    return (
      '<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">' +
        statCard({ label: "Total peserta", value: fmtNumber(ringkasan.total), icon: "users", tone: "brand" }) +
        statCard({ label: "Hadir", value: fmtNumber(ringkasan.hadir), icon: "user-check", tone: "emerald" }) +
        statCard({ label: "Belum hadir", value: fmtNumber(ringkasan.belum), icon: "user-x", tone: "amber" }) +
        statCard({ label: "Tingkat kehadiran", value: ringkasan.persentase + "%", icon: "trending-up", tone: "sky" }) +
      "</div>" +

      '<div class="grid gap-4 mt-4 xl:grid-cols-3">' +
        '<div class="card p-5 xl:col-span-2">' +
          '<h3 class="font-bold mb-1">' + esc(event.name) + "</h3>" +
          '<p class="text-[13px] text-muted">' +
            (event.starts_at ? esc(fmtDayLong(event.starts_at)) + " · " + esc(fmtTime(event.starts_at)) : "Tanggal belum diatur") +
            (event.location ? " · " + esc(event.location) : "") + "</p>" +
          (event.description ? '<p class="text-[13px] mt-3 leading-relaxed">' + esc(event.description) + "</p>" : "") +
          '<div class="mt-5 space-y-3">' +
            perTipe.map((t) => {
              const pct = t.total ? Math.round((Number(t.hadir) / Number(t.total)) * 100) : 0;
              return '<div><div class="flex items-center justify-between text-[13px] mb-1.5">' +
                '<span class="font-semibold text-strong">' + esc(t.tipe) + "</span>" +
                '<span class="text-muted font-bold tabular-nums">' + fmtNumber(t.hadir) + " / " + fmtNumber(t.total) + "</span></div>" +
                '<div class="h-2 rounded-full surface-sunken overflow-hidden">' +
                '<div class="h-full rounded-full bg-brand-500 transition-all duration-700" style="width:' + pct + '%"></div></div></div>';
            }).join("") +
          "</div>" +
        "</div>" +

        '<div class="card p-5 flex flex-col items-center justify-center">' +
          '<h3 class="font-bold self-start">Kehadiran</h3>' +
          '<div class="relative my-4">' + progressRing(ringkasan.persentase) +
            '<div class="absolute inset-0 grid place-items-center">' +
              '<div class="text-center"><p class="text-[26px] font-extrabold text-strong leading-none">' +
                ringkasan.persentase + '<span class="text-base">%</span></p>' +
              '<p class="text-[11px] text-muted font-semibold mt-1">dari ' + fmtNumber(ringkasan.total) + "</p></div>" +
            "</div>" +
          "</div>" +
        "</div>" +
      "</div>" +

      '<div class="card mt-4 overflow-hidden">' +
        '<div class="px-5 py-4 border-b line flex items-center justify-between">' +
          '<h3 class="font-bold">Rincian peserta</h3>' +
          '<span class="text-[12px] text-muted font-semibold">' + fmtNumber(rows.length) + " baris</span>" +
        "</div>" +
        (rows.length
          ? '<div class="overflow-x-auto"><table class="w-full min-w-[720px]">' +
              '<thead class="surface-sunken border-b line"><tr>' +
                '<th class="th w-12">#</th><th class="th">Nama</th><th class="th">Kode</th>' +
                '<th class="th">Instansi</th><th class="th">Tipe</th><th class="th">Waktu hadir</th>' +
              "</tr></thead><tbody class=\"divide-y line\">" +
              rows.map((r, i) =>
                '<tr class="row-hover">' +
                  '<td class="td text-muted tabular-nums">' + (i + 1) + "</td>" +
                  '<td class="td"><div class="flex items-center gap-2.5">' + avatar(r.name, "h-8 w-8 text-[11px]") +
                    '<span class="font-semibold text-strong">' + esc(r.name) + "</span></div></td>" +
                  '<td class="td"><code class="text-[12px] font-bold px-2 py-1 rounded-lg surface-sunken">' + esc(r.code) + "</code></td>" +
                  '<td class="td text-muted">' + esc(r.org || "—") + "</td>" +
                  '<td class="td"><span class="badge badge-off">' + esc(r.ticket_type) + "</span></td>" +
                  '<td class="td">' + (r.checked_in_at
                    ? '<span class="badge badge-ok"><i data-lucide="check" class="h-3 w-3"></i>' +
                      esc(fmtDate(r.checked_in_at, true)) + "</span>"
                    : '<span class="badge badge-wait">Belum hadir</span>') + "</td>" +
                "</tr>"
              ).join("") +
            "</tbody></table></div>"
          : emptyState({ icon: "search-x", title: "Tidak ada data",
                         message: "Tidak ada peserta yang cocok dengan filter ini." })) +
      "</div>"
    );
  }

  /* ================================================================
     Router
     ================================================================ */
  const ROUTES = {
    dashboard: renderDashboard,
    events: renderEvents,
    participants: renderParticipants,
    checkin: renderCheckin,
    reports: renderReports,
  };

  function updateCounts() {
    const events = store.events.length;
    const peserta = store.events.reduce((a, e) => a + Number(e.total_peserta || 0), 0);
    const set = (key, value) =>
      document.querySelectorAll('[data-count="' + key + '"]').forEach((el) => (el.textContent = value || ""));
    set("events", events ? fmtNumber(events) : "");
    set("participants", peserta ? fmtNumber(peserta) : "");
  }

  async function route() {
    // Matikan kamera saat berpindah halaman supaya lampu kamera tidak menyala terus.
    if (activeScanner) { await activeScanner.stop(); activeScanner = null; }

    const raw = location.hash.replace(/^#\/?/, "") || "dashboard";
    const [name, search] = raw.split("?");
    const handler = ROUTES[name] || ROUTES.dashboard;

    document.querySelectorAll("[data-nav]").forEach((a) =>
      a.setAttribute("aria-current", a.dataset.nav === name ? "page" : "false")
    );

    closeSidebar();
    view.scrollTop = 0;
    await handler(new URLSearchParams(search || ""));
  }

  /* ------------------------- Kerangka halaman ------------------------- */
  const sidebar = document.getElementById("sidebar");
  const scrim = document.getElementById("scrim");

  function openSidebar() {
    sidebar.classList.remove("-translate-x-full");
    scrim.classList.remove("hidden");
  }
  function closeSidebar() {
    sidebar.classList.add("-translate-x-full");
    scrim.classList.add("hidden");
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-open-sidebar]")) openSidebar();
    if (e.target.closest("[data-close-sidebar]") || e.target === scrim) closeSidebar();
  });

  document.getElementById("logout").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Keluar dari panel?",
      message: "Anda perlu memasukkan password lagi untuk masuk kembali.",
      confirmText: "Keluar",
      danger: false,
    });
    if (!ok) return;
    await api.post("/api/logout");
    location.href = "/login";
  });

  /* Jam pada topbar */
  const clock = document.getElementById("clock");
  function tick() {
    const d = new Date();
    clock.textContent =
      String(d.getHours()).padStart(2, "0") + ":" +
      String(d.getMinutes()).padStart(2, "0") + ":" +
      String(d.getSeconds()).padStart(2, "0");
  }
  tick();
  setInterval(tick, 1000);

  window.addEventListener("hashchange", route);
  if (!location.hash) location.hash = "#/dashboard";
  route();
})();
