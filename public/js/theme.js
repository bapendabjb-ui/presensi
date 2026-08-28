/** Pengalih tema terang/gelap, dipakai di semua halaman. */
(function () {
  const root = document.documentElement;

  function apply(mode) {
    root.classList.toggle("dark", mode === "dark");
    localStorage.theme = mode;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", mode === "dark" ? "#08080a" : "#f7f7f8");
  }

  window.toggleTheme = function () {
    apply(root.classList.contains("dark") ? "light" : "dark");
  };

  document.addEventListener("click", function (e) {
    if (e.target.closest("#theme, [data-theme-toggle]")) window.toggleTheme();
  });

  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  if (window.lucide) window.lucide.createIcons();
})();
