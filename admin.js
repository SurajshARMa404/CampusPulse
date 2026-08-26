(function () {
  let csrfToken = "";
  const stats = document.getElementById("stats");
  const error = document.getElementById("adminError");

  async function load() {
    const sessionResponse = await fetch("/api/session");
    const session = await sessionResponse.json();
    csrfToken = session.csrf_token || "";
    if (!session.authenticated || !session.is_admin) { window.location.href = "login.html"; return; }
    const response = await fetch("/api/admin/stats");
    if (!response.ok) { error.textContent = "Statistics are unavailable."; return; }
    const data = await response.json();
    stats.innerHTML = data.years.map(function (item) {
      return "<article class=\"result\"><h2>Year " + item.year + "</h2><p><strong>High stress:</strong> " + item.stress_percent + "%</p><p>Based on " + item.total + " prediction" + (item.total === 1 ? "" : "s") + "</p></article>";
    }).join("");
  }

  document.getElementById("adminLogout").addEventListener("click", function (event) {
    event.preventDefault();
    fetch("/api/logout", { method: "POST", headers: { "X-CSRF-Token": csrfToken } }).finally(function () { window.location.href = "login.html"; });
  });
  load();
})();