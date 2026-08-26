(function () {
  let csrfToken = "";
  const message = document.getElementById("authMessage");

  async function loadSession() {
    const response = await fetch("/api/session");
    const data = await response.json();
    csrfToken = data.csrf_token;
  }

  function show(text) { if (message) message.textContent = text; }

  const sessionReady = loadSession();

  const signupForm = document.getElementById("signupForm");
  if (signupForm) signupForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    await sessionReady;
    const response = await fetch("/api/signup", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify({ username: document.getElementById("signupUsername").value.trim(), email: document.getElementById("signupEmail").value.trim(), password: document.getElementById("signupPassword").value, department: "CSE", study_year: document.getElementById("signupYear").value }) });
    const data = await response.json();
    if (!response.ok) return show(data.error || "Unable to create account.");
    sessionStorage.setItem("campuspulseVerificationCode", data.verification_code || "");
    sessionStorage.setItem("campuspulseMfaCode", data.verification_code || "");
    show("Account created. Development verification code: " + (data.verification_code || "check your email") + ".");
    window.location.href = "verify.html";
  });

  const verifyForm = document.getElementById("verifyForm");
  const verificationCodeInput = document.getElementById("verificationCode");
  if (verificationCodeInput) {
    verificationCodeInput.value = sessionStorage.getItem("campuspulseVerificationCode") || "";
  }
  if (verifyForm) verifyForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    await sessionReady;
    const response = await fetch("/api/verify", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify({ code: document.getElementById("verificationCode").value.trim() }) });
    const data = await response.json();
    if (!response.ok) return show(data.error || "Verification failed.");
    show("Account verified. You can now log in with your MFA code.");
  });

  const requestForm = document.getElementById("resetRequestForm");
  if (requestForm) requestForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    await sessionReady;
    const response = await fetch("/api/request-password-reset", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify({ email: document.getElementById("resetEmail").value.trim() }) });
    const data = await response.json();
    show(data.message + (data.reset_token ? " Use the development reset token below." : ""));
    if (data.reset_token) { document.getElementById("resetForm").hidden = false; document.getElementById("resetToken").value = data.reset_token; }
  });

  const resetFormElement = document.getElementById("resetForm");
  if (resetFormElement) resetFormElement.addEventListener("submit", async function (event) {
    event.preventDefault();
    await sessionReady;
    const response = await fetch("/api/reset-password", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify({ token: document.getElementById("resetToken").value, password: document.getElementById("newPassword").value }) });
    const data = await response.json();
    show(data.error || data.message);
  });
})();