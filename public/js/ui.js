/* ============================================================
   ui.js — helper bersama: API, format, toast, modal, grafik
   ============================================================ */
(function () {
  /* ------------------------------ API ------------------------------ */
  async function api(path, options = {}) {
    const res = await fetch(path, {
      headers: options.body ? { "Content-Type": "application/json" } : {},
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (res.status === 401) {
      location.href = "/login?next=" + encodeURIComponent(location.pathname + location.hash);
      throw new Error("Sesi berakhir.");
    }

    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(data?.error || "Permintaan gagal (" + res.status + ").");
    return data;
  }

  api.get = (p) => api(p);
  api.post = (p, body) => api(p, { method: "POST", body });
  api.put = (p, body) => api(p, { method: "PUT", body });
  api.del = (p) => api(p, { method: "DELETE" });

  /* --------------------------- Escaping ---------------------------- */
  const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(value) {
    return value == null ? "" : String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
  }

  /* ---------------------------- Format ----------------------------- */
  const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

  /** MySQL DATETIME ("2026-08-28 09:30:00") -> objek Date lokal. */
  function toDate(value) {
    if (!value) return null;
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }

  const pad = (n) => String(n).padStart(2, "0");

  function fmtDate(value, withTime = false) {
    const d = toDate(value);
    if (!d) return "—";
    const base = d.getDate() + " " + BULAN[d.getMonth()] + " " + d.getFullYear();
    return withTime ? base + ", " + pad(d.getHours()) + ":" + pad(d.getMinutes()) : base;
  }

  function fmtTime(value) {
    const d = toDate(value);
    return d ? pad(d.getHours()) + ":" + pad(d.getMinutes()) : "—";
  }

  function fmtDayLong(value) {
    const d = toDate(value);
    if (!d) return "—";
    return HARI[d.getDay()] + ", " + d.getDate() + " " + BULAN[d.getMonth()] + " " + d.getFullYear();
  }

  /** "3 menit lalu", "2 jam lalu", … */
  function fmtRelative(value) {
    const d = toDate(value);
    if (!d) return "—";
    const detik = Math.floor((Date.now() - d.getTime()) / 1000);
    if (detik < 45) return "baru saja";
    if (detik < 3600) return Math.floor(detik / 60) + " menit lalu";
    if (detik < 86400) return Math.floor(detik / 3600) + " jam lalu";
    if (detik < 604800) return Math.floor(detik / 86400) + " hari lalu";
    return fmtDate(value);
  }

  function fmtNumber(n) {
    return new Intl.NumberFormat("id-ID").format(Number(n) || 0);
  }

  /** Inisial untuk avatar, maks 2 huruf. */
  function initials(name) {
    const parts = String(name || "?").trim().split(/\s+/);
    return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
  }

  /** Warna avatar deterministik dari nama, supaya konsisten antar-render. */
  const AVATAR_TONES = [
    "bg-brand-500/15 text-brand-700 dark:text-brand-300",
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    "bg-sky-500/15 text-sky-700 dark:text-sky-400",
    "bg-rose-500/15 text-rose-700 dark:text-rose-400",
    "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  ];
  function avatarTone(name) {
    let hash = 0;
    for (const ch of String(name || "")) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATAR_TONES[hash % AVATAR_TONES.length];
  }

  /* ----------------------------- Toast ----------------------------- */
  const TOAST_STYLE = {
    success: ["circle-check", "text-emerald-500"],
    error: ["circle-x", "text-rose-500"],
    warning: ["triangle-alert", "text-amber-500"],
    info: ["info", "text-brand-500"],
  };

  function toast(message, type = "success") {
    const root = document.getElementById("toast-root");
    const [icon, tone] = TOAST_STYLE[type] || TOAST_STYLE.info;

    const el = document.createElement("div");
    el.className =
      "card pointer-events-auto flex items-start gap-3 px-4 py-3 max-w-sm shadow-[var(--shadow-lift)] animate-rise";
    el.innerHTML =
      '<i data-lucide="' + icon + '" class="h-[18px] w-[18px] shrink-0 mt-px ' + tone + '"></i>' +
      '<p class="text-sm font-medium text-strong leading-snug">' + esc(message) + "</p>";

    root.appendChild(el);
    lucide.createIcons({ nameAttr: "data-lucide" });

    setTimeout(() => {
      el.style.transition = "opacity .3s, transform .3s";
      el.style.opacity = "0";
      el.style.transform = "translateY(6px)";
      setTimeout(() => el.remove(), 300);
    }, 3200);
  }

  /* ----------------------------- Modal ----------------------------- */
  let openModal = null;

  /**
   * Menampilkan modal. `render` menerima helper close() dan mengembalikan HTML.
   * Mengembalikan Promise yang resolve dengan nilai yang dikirim ke close().
   */
  function modal({ title, subtitle, body, footer, size = "md", onMount }) {
    return new Promise((resolve) => {
      const width = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];

      const wrap = document.createElement("div");
      wrap.className = "fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-6";
      wrap.innerHTML =
        '<div data-backdrop class="absolute inset-0 bg-black/45 backdrop-blur-[3px] opacity-0 transition-opacity duration-200"></div>' +
        '<div data-panel class="relative w-full ' + width + ' card rounded-b-none sm:rounded-2xl ' +
        'max-h-[92vh] flex flex-col translate-y-4 opacity-0 transition-all duration-200 shadow-[var(--shadow-lift)]">' +
          '<div class="flex items-start gap-4 px-6 pt-5 pb-4 border-b line shrink-0">' +
            '<div class="min-w-0 flex-1">' +
              '<h3 class="text-base font-bold">' + esc(title) + "</h3>" +
              (subtitle ? '<p class="text-[13px] text-muted mt-0.5">' + esc(subtitle) + "</p>" : "") +
            "</div>" +
            '<button data-close class="btn btn-ghost btn-icon -mr-1.5 -mt-1" aria-label="Tutup">' +
              '<i data-lucide="x" class="h-4 w-4"></i></button>' +
          "</div>" +
          '<div data-body class="px-6 py-5 overflow-y-auto">' + body + "</div>" +
          (footer ? '<div class="px-6 py-4 border-t line surface-sunken rounded-b-2xl shrink-0 flex justify-end gap-2">' + footer + "</div>" : "") +
        "</div>";

      document.getElementById("modal-root").appendChild(wrap);
      lucide.createIcons({ nameAttr: "data-lucide" });

      requestAnimationFrame(() => {
        wrap.querySelector("[data-backdrop]").style.opacity = "1";
        const panel = wrap.querySelector("[data-panel]");
        panel.style.transform = "translateY(0)";
        panel.style.opacity = "1";
      });

      function close(value) {
        if (openModal !== close) return;
        openModal = null;
        document.removeEventListener("keydown", onKey);
        wrap.querySelector("[data-backdrop]").style.opacity = "0";
        const panel = wrap.querySelector("[data-panel]");
        panel.style.transform = "translateY(8px)";
        panel.style.opacity = "0";
        setTimeout(() => wrap.remove(), 180);
        resolve(value);
      }

      function onKey(e) {
        if (e.key === "Escape") close(null);
      }

      openModal = close;
      document.addEventListener("keydown", onKey);
      wrap.querySelector("[data-backdrop]").addEventListener("click", () => close(null));
      wrap.querySelectorAll("[data-close]").forEach((b) =>
        b.addEventListener("click", () => close(null))
      );

      if (onMount) onMount(wrap, close);
      wrap.querySelector("input,select,textarea")?.focus();
    });
  }

  /** Dialog konfirmasi ringkas. */
  function confirmDialog({ title, message, confirmText = "Hapus", danger = true }) {
    return modal({
      title,
      body:
        '<div class="flex gap-4">' +
          '<div class="grid place-items-center h-11 w-11 rounded-xl shrink-0 ' +
          (danger ? "bg-rose-500/12 text-rose-600 dark:text-rose-400" : "bg-brand-500/12 text-brand-600") + '">' +
            '<i data-lucide="' + (danger ? "trash-2" : "circle-help") + '" class="h-5 w-5"></i>' +
          "</div>" +
          '<p class="text-sm leading-relaxed pt-2">' + esc(message) + "</p>" +
        "</div>",
      footer:
        '<button data-close class="btn btn-outline">Batal</button>' +
        '<button data-confirm class="btn ' + (danger ? "btn-danger" : "btn-primary") + '">' + esc(confirmText) + "</button>",
      onMount(wrap, close) {
        wrap.querySelector("[data-confirm]").addEventListener("click", () => close(true));
      },
    });
  }

  /* -------------------- Grafik area (SVG murni) -------------------- */
  /**
   * Grafik garis + area halus tanpa pustaka eksternal.
   * points: [{ bucket, jumlah }]
   */
  function areaChart(points, { height = 190 } = {}) {
    if (!points.length) {
      return '<div class="h-[190px] grid place-items-center text-sm text-muted">Belum ada data check-in.</div>';
    }

    const W = 640;
    const H = height;
    const padX = 26; // ruang agar label paling kiri/kanan tidak terpotong
    const padTop = 14;
    const padBottom = 26;
    const max = Math.max(1, ...points.map((p) => Number(p.jumlah)));
    const stepX = points.length > 1 ? (W - padX * 2) / (points.length - 1) : 0;

    const coords = points.map((p, i) => [
      padX + i * stepX,
      padTop + (1 - Number(p.jumlah) / max) * (H - padTop - padBottom),
    ]);

    // Kurva Catmull-Rom disederhanakan jadi kubik Bézier — garis mulus tanpa overshoot berlebihan.
    let d = "M " + coords[0][0] + " " + coords[0][1];
    for (let i = 0; i < coords.length - 1; i++) {
      const [x0, y0] = coords[Math.max(0, i - 1)];
      const [x1, y1] = coords[i];
      const [x2, y2] = coords[i + 1];
      const [x3, y3] = coords[Math.min(coords.length - 1, i + 2)];
      const c1x = x1 + (x2 - x0) / 6;
      const c1y = y1 + (y2 - y0) / 6;
      const c2x = x2 - (x3 - x1) / 6;
      const c2y = y2 - (y3 - y1) / 6;
      d += " C " + c1x + " " + c1y + ", " + c2x + " " + c2y + ", " + x2 + " " + y2;
    }
    const baseline = H - padBottom;
    const area = d + " L " + coords[coords.length - 1][0] + " " + baseline + " L " + coords[0][0] + " " + baseline + " Z";

    // Tampilkan sebagian label agar sumbu X tidak berdesakan.
    const every = Math.ceil(points.length / 8);
    const last = points.length - 1;
    const labels = points
      .map((p, i) => {
        if (i % every !== 0 && i !== last) return "";
        // Label ujung dirapatkan ke tepi supaya tidak keluar dari bidang gambar.
        const anchor = i === 0 ? "start" : i === last ? "end" : "middle";
        return '<text x="' + coords[i][0] + '" y="' + (H - 7) + '" text-anchor="' + anchor + '" ' +
          'font-size="10" font-weight="600" fill="var(--text-muted)">' + esc(p.bucket) + "</text>";
      })
      .join("");

    const dots = points
      .map((p, i) =>
        Number(p.jumlah) > 0
          ? '<circle cx="' + coords[i][0] + '" cy="' + coords[i][1] + '" r="3.5" ' +
            'fill="var(--surface-card)" stroke="var(--color-brand-500)" stroke-width="2.5">' +
            "<title>" + esc(p.bucket) + " · " + esc(p.jumlah) + " check-in</title></circle>"
          : ""
      )
      .join("");

    const grid = [0, 0.5, 1]
      .map((t) => {
        const y = padTop + t * (H - padTop - padBottom);
        return '<line x1="0" y1="' + y + '" x2="' + W + '" y2="' + y +
          '" stroke="var(--line)" stroke-width="1" stroke-dasharray="3 5"/>';
      })
      .join("");

    // Skala seragam (tanpa preserveAspectRatio="none") supaya teks dan titik
    // tidak ikut melar saat kartu melebar.
    return (
      '<svg viewBox="0 0 ' + W + " " + H + '" class="w-full h-auto" role="img" ' +
        'aria-label="Grafik tren check-in">' +
        "<defs><linearGradient id=\"areaFill\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">" +
          '<stop offset="0%" stop-color="var(--color-brand-500)" stop-opacity="0.28"/>' +
          '<stop offset="100%" stop-color="var(--color-brand-500)" stop-opacity="0"/>' +
        "</linearGradient></defs>" +
        grid +
        '<path d="' + area + '" fill="url(#areaFill)"/>' +
        '<path d="' + d + '" fill="none" stroke="var(--color-brand-500)" stroke-width="2.5" ' +
          'stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>' +
        dots + labels +
      "</svg>"
    );
  }

  /** Cincin progres untuk persentase kehadiran. */
  function progressRing(percent, { size = 132, stroke = 11 } = {}) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const offset = c * (1 - Math.min(100, Math.max(0, percent)) / 100);
    return (
      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + " " + size + '" class="-rotate-90">' +
        '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" ' +
          'stroke="var(--surface-sunken)" stroke-width="' + stroke + '"/>' +
        '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" ' +
          'stroke="var(--color-brand-500)" stroke-width="' + stroke + '" stroke-linecap="round" ' +
          'stroke-dasharray="' + c + '" stroke-dashoffset="' + c + '" ' +
          'style="transition:stroke-dashoffset 1s cubic-bezier(.16,1,.3,1)" ' +
          'data-ring-target="' + offset + '"/>' +
      "</svg>"
    );
  }

  /** Jalankan animasi semua ring yang baru dirender. */
  function animateRings(scope = document) {
    requestAnimationFrame(() => {
      scope.querySelectorAll("[data-ring-target]").forEach((el) => {
        el.style.strokeDashoffset = el.getAttribute("data-ring-target");
      });
    });
  }

  /** Placeholder kosong yang seragam di semua tabel/daftar. */
  function emptyState({ icon = "inbox", title, message, action = "" }) {
    return (
      '<div class="py-16 px-6 text-center">' +
        '<div class="mx-auto grid place-items-center h-14 w-14 rounded-2xl surface-sunken text-muted mb-4">' +
          '<i data-lucide="' + icon + '" class="h-6 w-6"></i>' +
        "</div>" +
        '<p class="font-bold text-strong">' + esc(title) + "</p>" +
        '<p class="text-sm text-muted mt-1.5 max-w-sm mx-auto leading-relaxed">' + esc(message) + "</p>" +
        (action ? '<div class="mt-5">' + action + "</div>" : "") +
      "</div>"
    );
  }

  window.UI = {
    api, esc, toast, modal, confirmDialog,
    fmtDate, fmtTime, fmtDayLong, fmtRelative, fmtNumber, toDate,
    initials, avatarTone, areaChart, progressRing, animateRings, emptyState,
  };
})();
