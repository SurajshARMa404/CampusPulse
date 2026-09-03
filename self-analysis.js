(function () {
  const form = document.getElementById("selfAnalysisForm");
  const analysisDate = document.getElementById("analysisDate");
  const selfError = document.getElementById("selfError");
  const selfSaveStatus = document.getElementById("selfSaveStatus");
  const focusSessionHistory = document.getElementById("focusSessionHistory");

  const gridRefs = {
    study: document.getElementById("studyGrid"),
    coding: document.getElementById("codingGrid"),
    gaming: document.getElementById("gamingGrid"),
    physical: document.getElementById("physicalGrid"),
    social: document.getElementById("socialGrid")
  };

  if (!form || !analysisDate) {
    return;
  }

  function getUser() {
    return "authenticated";
  }

  function toIsoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function lastNDates(days) {
    const end = new Date();
    end.setHours(0, 0, 0, 0);

    const out = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(end);
      d.setDate(end.getDate() - i);
      out.push(toIsoDate(d));
    }
    return out;
  }

  function colorLevel(hours) {
    if (!hours || hours <= 0) {
      return 0;
    }
    if (hours <= 2) {
      return 1;
    }
    if (hours <= 4) {
      return 2;
    }
    if (hours <= 7) {
      return 3;
    }
    return 4;
  }

  function renderOneGrid(target, dateKeys, dataByDate, dataField) {
    target.innerHTML = "";

    dateKeys.forEach(function (key) {
      const record = dataByDate[key] || {};
      const hours = Number(record[dataField] || 0);
      const level = colorLevel(hours);

      const cell = document.createElement("div");
      cell.className = "heat-cell level-" + String(level);
      cell.title = key + " - " + dataField + ": " + String(hours) + "h";
      target.appendChild(cell);
    });
  }

  function renderAllGrids(records) {
    const days = lastNDates(30);
    const byDate = {};

    records.forEach(function (item) {
      byDate[item.log_date] = item;
    });

    renderOneGrid(gridRefs.study, days, byDate, "study_hours");
    renderOneGrid(gridRefs.coding, days, byDate, "coding_hours");
    renderOneGrid(gridRefs.gaming, days, byDate, "gaming_hours");
    renderOneGrid(gridRefs.physical, days, byDate, "physical_activity_hours");
    renderOneGrid(gridRefs.social, days, byDate, "social_media_hours");
  }

  function renderFocusSessions(sessions) {
    if (!sessions.length) {
      focusSessionHistory.innerHTML = "<p class=\"subtitle\">No focus sessions saved yet.</p>";
      return;
    }
    focusSessionHistory.innerHTML = sessions.map(function (item) {
      const distracted = Number(item.distracted_percentage);
      const level = distracted >= 50 ? "High" : distracted >= 25 ? "Moderate" : "Low";
      const duration = Number(item.total_seconds || 0);
      return "<article class=\"focus-history-item\"><strong>" + new Date(item.session_started_at).toLocaleString() +
        "</strong><p>Focused: " + Number(item.focused_percentage).toFixed(1) + "% | Distracted: " + distracted.toFixed(1) +
        "% | Duration: " + duration + "s</p><p>Stress level: " + level + "</p></article>";
    }).join("");
  }

  async function loadHistory() {
    const user = getUser();
    const response = await fetch("/api/self-analysis?days=30");
    if (!response.ok) {
      renderAllGrids([]);
      return;
    }

    const data = await response.json();
    renderAllGrids(data.records || []);
    renderFocusSessions(data.focus_sessions || []);
  }

  async function saveEntry(payload) {
    const response = await fetch("/api/self-analysis", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": (await fetch("/api/session").then(function (result) { return result.json(); })).csrf_token
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error("Save failed");
    }

    return response.json();
  }

  function parseNumber(id) {
    return Number(document.getElementById(id).value);
  }

  const today = new Date();
  analysisDate.value = toIsoDate(today);

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    selfError.textContent = "";

    const user = getUser();
    const payload = {
      log_date: analysisDate.value,
      study_hours: parseNumber("studyInput"),
      coding_hours: parseNumber("codingInput"),
      gaming_hours: parseNumber("gamingInput"),
      physical_activity_hours: parseNumber("physicalInput"),
      social_media_hours: parseNumber("socialInput")
    };

    const invalidNumber = [
      payload.study_hours,
      payload.coding_hours,
      payload.gaming_hours,
      payload.physical_activity_hours,
      payload.social_media_hours
    ].some(function (value) {
      return Number.isNaN(value) || value < 0 || value > 24;
    });

    if (!payload.log_date || invalidNumber) {
      selfError.textContent = "Please enter valid date and hours between 0 and 24.";
      return;
    }

    try {
      const saved = await saveEntry(payload);
      selfSaveStatus.textContent = "Saved for " + saved.log_date + ". Records kept for 30 days.";
      await loadHistory();
      form.reset();
      analysisDate.value = toIsoDate(today);
    } catch (error) {
      selfError.textContent = "Could not save data in database.";
    }
  });

  loadHistory();
})();
