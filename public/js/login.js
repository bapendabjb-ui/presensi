(function () {
  const form = document.getElementById("form");
  const input = document.getElementById("password");
  const button = document.getElementById("submit");
  const error = document.getElementById("error");
  const toggle = document.getElementById("toggle");

  toggle.addEventListener("click", function () {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    toggle.innerHTML =
      '<i data-lucide="' + (show ? "eye-off" : "eye") + '" class="h-4 w-4"></i>';
    lucide.createIcons();
    input.focus();
  });

  function showError(message) {
    error.querySelector("span").textContent = message;
    error.classList.remove("hidden");
    error.classList.add("flex");
    form.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-7px)" },
        { transform: "translateX(7px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 260, easing: "ease-in-out" }
    );
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    error.classList.add("hidden");
    error.classList.remove("flex");

    if (!input.value) return showError("Password belum diisi.");

    button.disabled = true;
    button.querySelector(".label-text").textContent = "Memeriksa…";

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: input.value }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showError(data.error || "Gagal masuk.");
        input.select();
        return;
      }

      const next = new URLSearchParams(location.search).get("next");
      location.href = next && next.startsWith("/") ? next : "/";
    } catch {
      showError("Tidak bisa menghubungi server.");
    } finally {
      button.disabled = false;
      button.querySelector(".label-text").textContent = "Masuk";
    }
  });
})();
