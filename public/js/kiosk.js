/* ============================================================
   kiosk.js — layar meja registrasi
   Fokus: satu peserta satu waktu, umpan balik besar dan cepat.
   ============================================================ */
(function () {
  const { api, esc, toast, fmtTime, fmtDate, fmtNumber, initials, avatarTone } = window.UI;

  const els = {
    video: document.getElementById("video"),
    frame: document.getElementById("frame"),
    idle: document.getElementById("idle"),
    idleMsg: document.getElementById("idle-msg"),
    controls: document.getElementById("cam-controls"),
    camera: document.getElementById("camera"),
    result: document.getElementById("result"),
    event: document.getElementById("event"),
    code: document.getElementById("code"),
    hadir: document.getElementById("s-hadir"),
    belum: document.getElementById("s-belum"),
    total: document.getElementById("s-total"),
  };

  let scanner = null;
  let busy = false;
  let resetTimer = null;

  function icons() {
    lucide.createIcons({ nameAttr: "data-lucide" });
  }

  /* ----------------------------- Tampilan ----------------------------- */
  function showIdle() {
    els.result.innerHTML =
      '<div class="text-center max-w-sm">' +
        '<div class="mx-auto grid place-items-center h-20 w-20 rounded-3xl surface border line text-brand-500 mb-5">' +
          '<i data-lucide="qr-code" class="h-9 w-9"></i>' +
        "</div>" +
        '<h2 class="text-2xl font-extrabold">Selamat datang</h2>' +
        '<p class="text-muted mt-2 leading-relaxed">' +
          "Tunjukkan QR pada undangan Anda ke kamera, atau ketik kode peserta di bawah." +
        "</p>" +
      "</div>";
    icons();
  }

  const STYLES = {
    ok: {
      icon: "circle-check",
      ring: "border-emerald-500/50",
      chip: "bg-emerald-500/12 text-emerald-500",
      title: "Check-in berhasil",
      heading: "text-emerald-500",
    },
    duplicate: {
      icon: "clock-alert",
      ring: "border-amber-500/50",
      chip: "bg-amber-500/12 text-amber-500",
      title: "Sudah check-in",
      heading: "text-amber-500",
    },
    wrong_event: {
      icon: "triangle-alert",
      ring: "border-amber-500/50",
      chip: "bg-amber-500/12 text-amber-500",
      title: "Event tidak cocok",
      heading: "text-amber-500",
    },
    unknown: {
      icon: "circle-x",
      ring: "border-rose-500/50",
      chip: "bg-rose-500/12 text-rose-500",
      title: "Kode tidak dikenal",
      heading: "text-rose-500",
    },
    invalid: {
      icon: "circle-x",
      ring: "border-rose-500/50",
      chip: "bg-rose-500/12 text-rose-500",
      title: "Kode tidak valid",
      heading: "text-rose-500",
    },
  };

  function showResult(res) {
    const style = STYLES[res.result] || STYLES.invalid;
    const p = res.participant;

    els.result.innerHTML =
      '<div class="w-full max-w-md card border-2 ' + style.ring + ' p-7 text-center animate-pop">' +
        '<div class="mx-auto grid place-items-center h-20 w-20 rounded-3xl ' + style.chip + ' mb-5">' +
          '<i data-lucide="' + style.icon + '" class="h-10 w-10"></i>' +
        "</div>" +
        '<h2 class="text-2xl font-extrabold ' + style.heading + '">' + style.title + "</h2>" +

        (p
          ? '<div class="mt-6 pt-6 border-t line">' +
              '<div class="mx-auto grid place-items-center h-16 w-16 rounded-full font-extrabold text-xl mb-3 ' +
                avatarTone(p.name) + '">' + esc(initials(p.name)) + "</div>" +
              '<p class="text-xl font-extrabold text-strong leading-tight">' + esc(p.name) + "</p>" +
              (p.org ? '<p class="text-muted text-sm mt-1">' + esc(p.org) + "</p>" : "") +
              '<div class="flex flex-wrap justify-center gap-1.5 mt-3">' +
                '<span class="badge badge-off">' + esc(p.ticket_type) + "</span>" +
                '<span class="badge badge-live">' + esc(p.event_name) + "</span>" +
              "</div>" +
              '<p class="mt-4 text-[11px] font-bold uppercase tracking-wider text-muted">Kode peserta</p>' +
              '<p class="font-extrabold text-strong tracking-[0.14em]">' + esc(p.code) + "</p>" +
              (p.checked_in_at
                ? '<p class="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted">' +
                  '<i data-lucide="clock" class="h-4 w-4"></i>' +
                  (res.result === "duplicate" ? "Tercatat hadir pada " : "Waktu masuk ") +
                  esc(fmtTime(p.checked_in_at)) + " · " + esc(fmtDate(p.checked_in_at)) + "</p>"
                : "") +
            "</div>"
          : '<p class="mt-4 text-muted leading-relaxed">' + esc(res.message) + "</p>" +
            (res.code
              ? '<p class="mt-3 font-extrabold text-strong tracking-[0.14em]">' + esc(res.code) + "</p>"
              : "") +
            '<p class="mt-5 text-[13px] text-muted">Silakan hubungi petugas registrasi.</p>') +

        "</div>";
    icons();
  }

  /* ---------------------------- Statistik ---------------------------- */
  async function refreshStats() {
    const id = els.event.value;
    try {
      const s = await api.get("/api/reports/summary" + (id ? "?event_id=" + id : ""));
      animateNumber(els.hadir, s.total_hadir);
      animateNumber(els.belum, s.belum_hadir);
      animateNumber(els.total, s.total_peserta);
    } catch { /* statistik tidak krusial untuk operasi kiosk */ }
  }

  function animateNumber(el, target) {
    const from = Number(el.textContent.replace(/\D/g, "")) || 0;
    const to = Number(target) || 0;
    if (from === to) return;
    const steps = 14;
    let i = 0;
    const timer = setInterval(() => {
      i++;
      el.textContent = fmtNumber(Math.round(from + ((to - from) * i) / steps));
      if (i >= steps) clearInterval(timer);
    }, 24);
  }

  /* ------------------------------ Nada ------------------------------ */
  let audioCtx;
  function beep(result) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const notes = result === "ok" ? [660, 990] : result === "duplicate" ? [520, 520] : [200, 160];
      notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        const start = audioCtx.currentTime + i * 0.11;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.18, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
        osc.start(start);
        osc.stop(start + 0.22);
      });
      if (navigator.vibrate) navigator.vibrate(result === "ok" ? 60 : [60, 50, 60]);
    } catch { /* autoplay diblokir sampai ada interaksi — abaikan */ }
  }

  /* --------------------------- Proses kode --------------------------- */
  async function submit(code, method) {
    if (busy || !code) return;
    busy = true;
    clearTimeout(resetTimer);

    try {
      const res = await api.post("/api/checkin/scan", {
        code,
        event_id: els.event.value || undefined,
        method,
      });
      showResult(res);
      beep(res.result);
      if (res.result === "ok") refreshStats();

      // Kembali ke layar sambutan supaya peserta berikutnya tidak melihat data orang lain.
      resetTimer = setTimeout(() => {
        showIdle();
        scanner?.resetCooldown();
      }, res.result === "ok" ? 5000 : 7000);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      busy = false;
      els.code.focus();
    }
  }

  /* ----------------------------- Kamera ----------------------------- */
  async function startCamera() {
    scanner = new window.QrScanner(els.video, (code) => submit(code, "qr"), { cooldown: 3000 });
    try {
      await scanner.start(els.camera.value || undefined);
      els.idle.classList.add("hidden");
      els.frame.classList.remove("hidden");
      els.controls.classList.remove("hidden");
      els.controls.classList.add("flex");

      const cams = await window.QrScanner.listCameras();
      if (cams.length > 1) {
        els.camera.innerHTML = cams
          .map((c, i) => '<option value="' + c.deviceId + '">' + esc(c.label || "Kamera " + (i + 1)) + "</option>")
          .join("");
        els.camera.classList.remove("hidden");
      }
    } catch (err) {
      scanner = null;
      els.idleMsg.textContent = err.message;
      toast(err.message, "error");
    }
  }

  async function stopCamera() {
    await scanner?.stop();
    scanner = null;
    els.idle.classList.remove("hidden");
    els.frame.classList.add("hidden");
    els.controls.classList.add("hidden");
    els.controls.classList.remove("flex");
  }

  /* ------------------------------ Boot ------------------------------ */
  (async function init() {
    showIdle();

    try {
      const events = await api.get("/api/events");
      const last = localStorage.lastEventId || "";
      els.event.innerHTML =
        '<option value="">Semua event</option>' +
        events
          .map((e) =>
            '<option value="' + e.id + '"' + (String(e.id) === String(last) ? " selected" : "") + ">" +
            esc(e.name) + "</option>"
          )
          .join("");
    } catch (err) {
      toast(err.message, "error");
    }

    refreshStats();
    setInterval(refreshStats, 20000); // jaga angka tetap segar bila ada petugas lain

    els.event.addEventListener("change", () => {
      localStorage.lastEventId = els.event.value;
      refreshStats();
      showIdle();
    });

    document.getElementById("start").addEventListener("click", startCamera);
    document.getElementById("stop").addEventListener("click", stopCamera);
    els.camera.addEventListener("change", () => { if (scanner) startCamera(); });

    document.getElementById("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const code = els.code.value.trim();
      els.code.value = "";
      submit(code, "kode");
    });

    document.getElementById("fullscreen").addEventListener("click", () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
    });

    // Barcode scanner USB mengetik ke mana pun fokus berada — arahkan kembali ke input.
    document.addEventListener("keydown", (e) => {
      if (e.target.matches("input, select, textarea, button")) return;
      if (e.key.length === 1) els.code.focus();
    });

    // Jaga fokus tetap di input kode selama kiosk berjalan.
    setInterval(() => {
      if (document.activeElement === document.body) els.code.focus();
    }, 1500);

    icons();
  })();
})();
