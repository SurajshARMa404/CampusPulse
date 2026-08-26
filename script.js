(function () {
  let csrfToken = "";
  let sessionUser = "";
  const sessionReady = loadSession();
  const loginForm = document.getElementById("loginForm");
  const welcomeText = document.getElementById("welcomeText");
  const mentalHealthForm = document.getElementById("mentalHealthForm");
  const navUser = document.getElementById("navUser");
  const logoutLink = document.getElementById("logoutLink");

  async function loadSession() {
    const response = await fetch("/api/session");
    const data = await response.json();
    csrfToken = data.csrf_token || "";
    sessionUser = data.username || "";
    return data;
  }

  function onProtectedPage() {
    return /home\.html|focus\.html|self-analysis\.html/i.test(window.location.pathname);
  }

  function updateNavAndSession() {
    const user = sessionUser;
    if (navUser) {
      navUser.textContent = user ? "User: " + user : "Guest";
    }

    if (onProtectedPage() && !user) {
      window.location.href = "login.html";
      return "";
    }

    return user;
  }

  function predictMentalHealthScore(inputs) {
    let score = 100;

    score -= Math.max(0, inputs.avgDailyUsageHours - 3) * 4;
    score -= Math.max(0, inputs.dailyUnlocks - 60) * 0.15;
    score += Math.min(inputs.studyHours, 8) * 1.6;
    score += Math.min(inputs.physicalActivityHours, 4) * 3.5;
    score += (Math.min(inputs.sleepHoursPerNight, 9) - 6) * 4.5;

    if (inputs.purposeOfUse === "Education") {
      score += 4;
    }
    if (inputs.purposeOfUse === "Entertainment") {
      score -= 4;
    }
    if (inputs.platform === "TikTok" || inputs.platform === "Instagram" || inputs.platform === "Snapchat") {
      score -= 2.5;
    }

    score = Math.max(0, Math.min(100, score));
    return Math.round(score);
  }

  function getStressLevel(score) {
    if (score >= 75) {
      return "Low";
    }
    if (score >= 50) {
      return "Moderate";
    }
    return "High";
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async function (event) {
      event.preventDefault();

      const usernameInput = document.getElementById("username");
      const passwordInput = document.getElementById("password");
      const errorMessage = document.getElementById("errorMessage");

      const username = usernameInput.value.trim();
      const password = passwordInput.value;
      const mfaCode = document.getElementById("mfaCode").value.trim();

      if (!username || !password || !mfaCode) {
        errorMessage.textContent = "Enter username, password, and MFA code.";
        return;
      }

      await sessionReady;
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ username: username, password: password, mfa_code: mfaCode })
      });
      const data = await response.json();
      if (!response.ok) {
        errorMessage.textContent = data.error || "Sign-in failed.";
        return;
      }
      window.location.href = data.is_admin ? "admin.html" : "home.html";
    });
  }

  let activeUser = "";
  loadSession().then(function () {
    activeUser = updateNavAndSession();
    if (welcomeText && activeUser) {
      welcomeText.textContent = "Welcome, " + activeUser + "!";
    }
  });

  if (welcomeText) {
    welcomeText.textContent = "Welcome! Fill the form to predict mental health score.";
  }

  if (logoutLink) {
    logoutLink.addEventListener("click", function (event) {
      event.preventDefault();
      fetch("/api/logout", { method: "POST", headers: { "X-CSRF-Token": csrfToken } })
        .finally(function () { window.location.href = "login.html"; });
    });
  }

  if (mentalHealthForm) {
    mentalHealthForm.addEventListener("submit", async function (event) {
      event.preventDefault();

      const predictError = document.getElementById("predictError");
      const predictedScore = document.getElementById("predictedScore");
      const predictedStress = document.getElementById("predictedStress");

      const age = Number(document.getElementById("age").value);
      const gender = document.getElementById("gender").value.trim();
      const country = document.getElementById("country").value.trim();
      const academicLevel = document.getElementById("academicLevel").value.trim();
      const platform = document.getElementById("platform").value.trim();
      const purposeOfUse = document.getElementById("purpose").value.trim();
      const avgDailyUsageHours = Number(document.getElementById("dailyUsage").value);
      const dailyUnlocks = Number(document.getElementById("dailyUnlocks").value);
      const studyHours = Number(document.getElementById("studyHours").value);
      const physicalActivityHours = Number(document.getElementById("activityHours").value);
      const sleepHoursPerNight = Number(document.getElementById("sleepHours").value);

      const hasMissingText = !gender || !country || !academicLevel || !platform || !purposeOfUse;
      const hasInvalidNumber = [
        age,
        avgDailyUsageHours,
        dailyUnlocks,
        studyHours,
        physicalActivityHours,
        sleepHoursPerNight
      ].some(function (value) {
        return Number.isNaN(value);
      });

      if (hasMissingText || hasInvalidNumber) {
        predictError.textContent = "Please fill all required fields before prediction.";
        return;
      }

      predictError.textContent = "";
      const score = predictMentalHealthScore({
        age: age,
        gender: gender,
        country: country,
        academicLevel: academicLevel,
        platform: platform,
        purposeOfUse: purposeOfUse,
        avgDailyUsageHours: avgDailyUsageHours,
        dailyUnlocks: dailyUnlocks,
        studyHours: studyHours,
        physicalActivityHours: physicalActivityHours,
        sleepHoursPerNight: sleepHoursPerNight
      });

      const stressLevel = getStressLevel(score);
      predictedScore.textContent = String(score);
      predictedStress.textContent = stressLevel;
      await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ score: score, stress_level: stressLevel })
      });
    });
  }
})();
