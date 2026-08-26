(function () {
  const cameraFeed = document.getElementById("cameraFeed");
  const cameraOverlay = document.getElementById("cameraOverlay");
  const startCameraBtn = document.getElementById("startCameraBtn");
  const stopCameraBtn = document.getElementById("stopCameraBtn");
  const focusError = document.getElementById("focusError");
  const sessionStatus = document.getElementById("sessionStatus");
  const focusPct = document.getElementById("focusPct");
  const distractedPct = document.getElementById("distractedPct");
  const sessionDuration = document.getElementById("sessionDuration");
  const finalFocus = document.getElementById("finalFocus");
  const finalDistracted = document.getElementById("finalDistracted");
  const frameCount = document.getElementById("frameCount");
  const processingStatus = document.getElementById("processingStatus");
  const faceStatus = document.getElementById("faceStatus");
  const blinkCount = document.getElementById("blinkCount");
  const saveStatus = document.getElementById("saveStatus");
  const focusWelcome = document.getElementById("focusWelcome");

  if (!cameraFeed || !cameraOverlay || !startCameraBtn || !stopCameraBtn) {
    return;
  }

  const ctx = cameraOverlay.getContext("2d");
  let faceMesh = null;
  let frameRequest = null;
  let processingFrame = false;
  let durationTimer = null;
  let processingTimer = null;
  const inputCanvas = document.createElement("canvas");
  const inputContext = inputCanvas.getContext("2d", { willReadFrequently: false });
  let running = false;
  let focusedFrames = 0;
  let distractedFrames = 0;
  let totalFrames = 0;
  let startedAt = null;
  let blinkTotal = 0;
  let eyesClosed = false;
  let csrfToken = "";

  async function getSession() {
    const response = await fetch("/api/session", { credentials: "same-origin" });
    if (!response.ok) {
      throw new Error("Unable to check login session.");
    }
    const data = await response.json();
    csrfToken = data.csrf_token || "";
    return data;
  }

  function getUser() {
    return "authenticated";
  }

  function updateTextMetrics() {
    const total = totalFrames || 1;
    const focusPercent = ((focusedFrames / total) * 100).toFixed(1);
    const distractedPercent = ((distractedFrames / total) * 100).toFixed(1);

    focusPct.textContent = focusPercent + "%";
    distractedPct.textContent = distractedPercent + "%";

    if (startedAt) {
      const sec = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      sessionDuration.textContent = String(sec) + "s";
    }
  }

  function markFocusedState(isFocused) {
    totalFrames += 1;
    if (isFocused) {
      focusedFrames += 1;
    } else {
      distractedFrames += 1;
    }
    updateTextMetrics();
  }

  function drawLandmarks(landmarks) {
    ctx.save();
    ctx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);
    if (!landmarks || !landmarks.length) {
      ctx.restore();
      return;
    }

    drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, {
      color: "#22c55e",
      lineWidth: 0.4
    });
    ctx.restore();
  }

  function faceLooksFocused(landmarks) {
    const leftEyeOuter = landmarks[33];
    const rightEyeOuter = landmarks[263];
    const noseTip = landmarks[1];

    const eyeDistance = Math.abs(rightEyeOuter.x - leftEyeOuter.x);
    const eyeMidX = (leftEyeOuter.x + rightEyeOuter.x) / 2;
    const horizontalOffset = Math.abs(noseTip.x - eyeMidX) / Math.max(eyeDistance, 0.0001);

    const looksForward = horizontalOffset < 0.20;
    const inFrame = noseTip.y > 0.20 && noseTip.y < 0.80;

    return looksForward && inFrame;
  }

  async function saveResultToDatabase(result) {
    const payload = {
      focused_percentage: result.focusedPercentage,
      distracted_percentage: result.distractedPercentage,
      focused_seconds: result.focusedSeconds,
      distracted_seconds: result.distractedSeconds,
      total_seconds: result.totalSeconds,
      session_started_at: result.sessionStartedAt,
      session_ended_at: result.sessionEndedAt
    };

    const response = await fetch("/api/focus-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error("Failed to save session result.");
    }

    return response.json();
  }

  function resetSessionStats() {
    focusedFrames = 0;
    distractedFrames = 0;
    totalFrames = 0;
    startedAt = Date.now();
    if (durationTimer) {
      clearInterval(durationTimer);
    }
    durationTimer = setInterval(function () {
      if (startedAt && running) {
        sessionDuration.textContent = String(Math.max(0, Math.round((Date.now() - startedAt) / 1000))) + "s";
      }
    }, 250);
    focusPct.textContent = "0%";
    distractedPct.textContent = "0%";
    sessionDuration.textContent = "0s";
    finalFocus.textContent = "-";
    finalDistracted.textContent = "-";
    saveStatus.textContent = "Not saved yet";
    frameCount.textContent = "0";
    processingStatus.textContent = "Starting";
    faceStatus.textContent = "Looking for face";
    blinkTotal = 0;
    eyesClosed = false;
    blinkCount.textContent = "0";
  }

  function stopTracks() {
    const stream = cameraFeed.srcObject;
    if (stream && stream.getTracks) {
      stream.getTracks().forEach(function (track) {
        track.stop();
      });
    }
    cameraFeed.srcObject = null;
  }

  async function startCameraSession() {
    focusError.textContent = "";

    try {
      const session = await getSession();
      if (!session.authenticated) {
        window.location.href = "login.html";
        return;
      }

      if (typeof FaceMesh === "undefined" || typeof drawConnectors === "undefined") {
        throw new Error("MediaPipe libraries did not load. Check the internet connection and reload.");
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("This browser does not support camera access.");
      }

      if (focusWelcome) {
        focusWelcome.textContent = "Live tracking for " + session.username + ". Keep your face visible and centered.";
      }

      resetSessionStats();
      sessionStatus.textContent = "Running";
      running = true;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: "user" },
        audio: false
      });
      cameraFeed.srcObject = stream;
      await cameraFeed.play();
      if (cameraFeed.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await new Promise(function (resolve, reject) {
          cameraFeed.addEventListener("loadeddata", resolve, { once: true });
          cameraFeed.addEventListener("error", reject, { once: true });
        });
      }
      if (!cameraFeed.videoWidth || !cameraFeed.videoHeight) {
        throw new Error("Camera opened but no video frame is available. Check camera permission and close other camera apps.");
      }
      inputCanvas.width = 640;
      inputCanvas.height = 360;

      if (!faceMesh) {
        processingStatus.textContent = "Loading model";
        faceMesh = new FaceMesh({
          locateFile: function (file) {
            return "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/" + file;
          }
        });

        const setup = faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
          });
        await Promise.race([
          setup,
          new Promise(function (_, reject) {
            setTimeout(function () { reject(new Error("MediaPipe model timed out. Check internet access and reload.")); }, 15000);
          })
        ]);
        processingStatus.textContent = "Detector ready";

        faceMesh.onResults(function (results) {
          if (!running) {
            return;
          }

          const vw = results.image.width || 640;
          const vh = results.image.height || 360;
          if (cameraOverlay.width !== vw || cameraOverlay.height !== vh) {
            cameraOverlay.width = vw;
            cameraOverlay.height = vh;
          }

          drawLandmarks((results.multiFaceLandmarks && results.multiFaceLandmarks[0]) || null);
          frameCount.textContent = String(Number(frameCount.textContent) + 1);
          processingStatus.textContent = "Receiving frames";

          if (!results.multiFaceLandmarks || !results.multiFaceLandmarks.length) {
            faceStatus.textContent = "No face detected";
            markFocusedState(false);
            return;
          }

          const landmarks = results.multiFaceLandmarks[0];
          faceStatus.textContent = "Face detected";
          const leftEyeOpen = Math.abs(landmarks[159].y - landmarks[145].y);
          const rightEyeOpen = Math.abs(landmarks[386].y - landmarks[374].y);
          const currentlyClosed = leftEyeOpen < 0.012 && rightEyeOpen < 0.012;
          if (currentlyClosed && !eyesClosed) {
            blinkTotal += 1;
            blinkCount.textContent = String(blinkTotal);
          }
          eyesClosed = currentlyClosed;
          markFocusedState(faceLooksFocused(landmarks));
        });
      }

      async function processFrame() {
        if (!running || !faceMesh) {
          return;
        }
        if (!processingFrame) {
          processingFrame = true;
          processingStatus.textContent = "Sending frame";
          try {
            inputContext.drawImage(cameraFeed, 0, 0, inputCanvas.width, inputCanvas.height);
            await faceMesh.send({ image: inputCanvas });
          } catch (error) {
            running = false;
            sessionStatus.textContent = "Error";
            faceStatus.textContent = "Detector error";
            focusError.textContent = "MediaPipe error: " + (error.message || "could not process the camera frame.");
          } finally {
            processingFrame = false;
          }
        }
        processingTimer = setTimeout(processFrame, 100);
      }
      processFrame();
      if (!cameraFeed.srcObject) {
        throw new Error("Camera did not start. Allow camera permission and use HTTPS or localhost.");
      }
    } catch (error) {
      if (frameRequest) cancelAnimationFrame(frameRequest);
      if (processingTimer) clearTimeout(processingTimer);
      if (durationTimer) clearInterval(durationTimer);
      stopTracks();
      running = false;
      sessionStatus.textContent = "Idle";
      focusError.textContent = error.message || "Camera access denied or unavailable. Please allow camera access and retry.";
    }
  }

  async function stopCameraSession() {
    if (!running) {
      return;
    }

    running = false;
    sessionStatus.textContent = "Stopped";

    try {
      if (frameRequest) cancelAnimationFrame(frameRequest);
      frameRequest = null;
      if (processingTimer) {
        clearTimeout(processingTimer);
        processingTimer = null;
      }
      if (durationTimer) {
        clearInterval(durationTimer);
        durationTimer = null;
      }
      stopTracks();

      const endedAt = Date.now();
      const totalSeconds = Math.max(1, Math.round((endedAt - startedAt) / 1000));
      const focusPercent = Math.round((focusedFrames / Math.max(totalFrames, 1)) * 1000) / 10;
      const distractedPercent = Math.round((distractedFrames / Math.max(totalFrames, 1)) * 1000) / 10;
      const focusedSeconds = Math.round((focusPercent / 100) * totalSeconds);
      const distractedSeconds = Math.max(0, totalSeconds - focusedSeconds);

      finalFocus.textContent = String(focusPercent) + "%";
      finalDistracted.textContent = String(distractedPercent) + "%";

      const resultPayload = {
        focusedPercentage: focusPercent,
        distractedPercentage: distractedPercent,
        focusedSeconds: focusedSeconds,
        distractedSeconds: distractedSeconds,
        totalSeconds: totalSeconds,
        sessionStartedAt: new Date(startedAt).toISOString(),
        sessionEndedAt: new Date(endedAt).toISOString()
      };

      const saveResponse = await saveResultToDatabase(resultPayload);
      saveStatus.textContent = "Saved in database. Session ID: " + saveResponse.session_id;
    } catch (error) {
      saveStatus.textContent = "Result generated but save failed.";
      focusError.textContent = "Could not save session result to database.";
    }
  }

  startCameraBtn.addEventListener("click", function () {
    if (running) {
      return;
    }
    startCameraSession();
  });

  stopCameraBtn.addEventListener("click", function () {
    stopCameraSession();
  });
})();
