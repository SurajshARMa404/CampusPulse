(function () {
  const logoutButton = document.getElementById("logoutButton");
  if (!logoutButton) {
    return;
  }

  logoutButton.addEventListener("click", async function () {
    logoutButton.disabled = true;
    try {
      const sessionResponse = await fetch("/api/session", { credentials: "same-origin" });
      const session = await sessionResponse.json();
      await fetch("/api/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "X-CSRF-Token": session.csrf_token || "" }
      });
    } finally {
      localStorage.removeItem("campuspulseToken");
      window.location.replace("login.html");
    }
  });
})();
