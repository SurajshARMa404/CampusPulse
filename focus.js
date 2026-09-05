(function () {
  const cameraFeed = document.getElementById("cameraFeed");
  const cameraOverlay = document.getElementById("cameraOverlay");
  const startCameraBtn = document.getElementById("startCameraBtn");
  const stopCameraBtn = document.getElementById("stopCameraBtn");
  const focusError = document.getElementById("focusError");
  const sessionStatus = document.getElementById("sessionStatus");
  const focusPct = document.getElementById("focusPct");
  const distractedPct = document.getElementById("distractedPct");
  const confusedPct = document.getElementById("confusedPct");
  const sessionDuration = document.getElementById("sessionDuration");
  const finalFocus = document.getElementById("finalFocus");
  const finalDistracted = document.getElementById("finalDistracted");
  const finalConfused = document.getElementById("finalConfused");
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
  let faceLandmarker = null;
  let frameRequest = null;
  let processingFrame = false;
  let durationTimer = null;
  let processingTimer = null;
  const inputCanvas = document.createElement("canvas");
  const inputContext = inputCanvas.getContext("2d", { willReadFrequently: false });
  let running = false;
  let focusedFrames = 0;
  let distractedFrames = 0;
  let confusedFrames = 0;
  let totalFrames = 0;
  let totalFocusedTime = 0;
  let totalDistractedTime = 0;
  let totalConfusedTime = 0;
  let activeState = null;
  let activeStateAt = null;
  let startedAt = null;
  let blinkTotal = 0;
  let eyesClosed = false;
  let noFaceFrames = 0;
  let neutralPose = null;
  let poseCalibrationSamples = [];
  let alarmContext = null;
  let alarmInterval = null;

  async function getSession() {
    const response = await fetch("/api/session", { credentials: "same-origin" });
    if (!response.ok) {
      throw new Error("Unable to check login session.");
    }
    const data = await response.json();
    return data;
  }

  const LOCAL_STORAGE_KEY = "local_focus_sessions";

  function calculatePercentages() {
    const timeTotals = getTimeTotals(Date.now());
    const total = timeTotals.focused + timeTotals.distracted + timeTotals.confused;
    if (!total) {
      return { focused: 0, distracted: 0, confused: 0 };
    }

    const values = [
      { key: "focused", count: timeTotals.focused },
      { key: "distracted", count: timeTotals.distracted },
      { key: "confused", count: timeTotals.confused }
    ].map(function (item) {
      const exact = (item.count / total) * 100;
      return { key: item.key, value: Math.round(exact), remainder: exact - Math.floor(exact) };
    });

    const roundedTotal = values.reduce(function (sum, item) { return sum + item.value; }, 0);
    const correction = 100 - roundedTotal;
    if (correction !== 0) {
      values.sort(function (first, second) {
        return correction > 0 ? second.remainder - first.remainder : first.remainder - second.remainder;
      });
      values[0].value += correction;
    }

    return values.reduce(function (result, item) {
      result[item.key] = item.value;
      return result;
    }, {});
  }

  function getTimeTotals(now) {
    const totals = {
      focused: totalFocusedTime,
      distracted: totalDistractedTime,
      confused: totalConfusedTime
    };
    if (activeState && activeStateAt !== null) {
      totals[activeState] += Math.max(0, (now - activeStateAt) / 1000);
    }
    return totals;
  }

  function updateTextMetrics() {
    const percentages = calculatePercentages();
    const focusPercent = percentages.focused;
    const distractedPercent = percentages.distracted;
    const confusedPercent = percentages.confused;

    focusPct.textContent = focusPercent + "%";
    distractedPct.textContent = distractedPercent + "%";
    confusedPct.textContent = confusedPercent + "%";
    updateAlarm(distractedPercent);

    if (startedAt) {
      const sec = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      sessionDuration.textContent = String(sec) + "s";
    }
  }

  function markState(state) {
    const now = Date.now();
    if (activeState && activeStateAt !== null) {
      const elapsedSeconds = Math.max(0, (now - activeStateAt) / 1000);
      if (activeState === "focused") {
        totalFocusedTime += elapsedSeconds;
      } else if (activeState === "distracted") {
        totalDistractedTime += elapsedSeconds;
      } else {
        totalConfusedTime += elapsedSeconds;
      }
    }
    activeState = state;
    activeStateAt = now;
    totalFrames += 1;
    if (state === "focused") {
      focusedFrames += 1;
    } else if (state === "confused") {
      confusedFrames += 1;
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

    const overlayWidth = cameraOverlay.clientWidth || cameraOverlay.width;
    const overlayHeight = cameraOverlay.clientHeight || cameraOverlay.height;
    const videoWidth = cameraFeed.videoWidth || cameraOverlay.width;
    const videoHeight = cameraFeed.videoHeight || cameraOverlay.height;
    const videoAspect = videoWidth / Math.max(videoHeight, 1);
    const overlayAspect = overlayWidth / Math.max(overlayHeight, 1);
    const displayedWidth = overlayAspect > videoAspect ? overlayHeight * videoAspect : overlayWidth;
    const displayedHeight = overlayAspect > videoAspect ? overlayHeight : overlayWidth / videoAspect;
    const displayedLeft = (overlayWidth - displayedWidth) / 2;
    const displayedTop = (overlayHeight - displayedHeight) / 2;
    const canvasScaleX = cameraOverlay.width / Math.max(overlayWidth, 1);
    const canvasScaleY = cameraOverlay.height / Math.max(overlayHeight, 1);

    function pointFor(landmark) {
      return {
        x: (displayedLeft + landmark.x * displayedWidth) * canvasScaleX,
        y: (displayedTop + landmark.y * displayedHeight) * canvasScaleY
      };
    }

    ctx.strokeStyle = "#00ff41";
    ctx.lineWidth = 1.1;
    ctx.shadowColor = "#00ff41";
    ctx.shadowBlur = 5;
    ctx.lineCap = "round";

    const tessellation = typeof FACEMESH_TESSELATION !== "undefined"
      ? FACEMESH_TESSELATION
      : (window.FACEMESH_TESSELATION || null);
    let connectorsDrawn = false;
    if (typeof drawConnectors === "function" && tessellation) {
      try {
        ctx.save();
        ctx.translate(displayedLeft * canvasScaleX, displayedTop * canvasScaleY);
        ctx.scale(displayedWidth * canvasScaleX, displayedHeight * canvasScaleY);
        drawConnectors(ctx, landmarks, tessellation, {
          color: "#00ff41",
          lineWidth: 1.1 / Math.max(canvasScaleX, canvasScaleY)
        });
        ctx.restore();
        connectorsDrawn = true;
      } catch (error) {
        ctx.restore();
        console.warn("MediaPipe connector drawing failed; using canvas fallback.", error);
      }
    }

    if (!connectorsDrawn) {
      for (let firstIndex = 0; firstIndex < landmarks.length; firstIndex += 1) {
        const first = landmarks[firstIndex];
        const nearest = [];
        for (let secondIndex = 0; secondIndex < landmarks.length; secondIndex += 1) {
          if (firstIndex === secondIndex) {
            continue;
          }
          const second = landmarks[secondIndex];
          const dx = first.x - second.x;
          const dy = first.y - second.y;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared < 0.0064) {
            nearest.push({ index: secondIndex, distance: distanceSquared });
          }
        }
        nearest.sort(function (left, right) { return left.distance - right.distance; });
        nearest.slice(0, 3).forEach(function (connection) {
          if (firstIndex < connection.index) {
            const second = landmarks[connection.index];
            const firstPoint = pointFor(first);
            const secondPoint = pointFor(second);
            ctx.beginPath();
            ctx.moveTo(firstPoint.x, firstPoint.y);
            ctx.lineTo(secondPoint.x, secondPoint.y);
            ctx.stroke();
          }
        });
      }
    }

    ctx.fillStyle = "#33ff33";
    ctx.shadowBlur = 4;
    landmarks.forEach(function (landmark) {
      const point = pointFor(landmark);
      ctx.beginPath();
      ctx.arc(point.x, point.y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function distance(first, second) {
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  function getBlendshapeScore(blendshapes, name) {
    const category = blendshapes.find(function (item) {
      return item.categoryName === name;
    });
    return category ? category.score : 0;
  }

  function calculateHeadPose(landmarks) {
    const leftEyeOuter = landmarks[33];
    const rightEyeOuter = landmarks[263];
    const noseTip = landmarks[1];
    const eyeDistance = distance(leftEyeOuter, rightEyeOuter);
    const eyeMidX = (leftEyeOuter.x + rightEyeOuter.x) / 2;
    const yaw = Math.atan2(noseTip.x - eyeMidX, Math.max(eyeDistance, 0.0001)) * 180 / Math.PI;
    const rawPitch = Math.atan2(noseTip.y - ((landmarks[159].y + landmarks[386].y) / 2), Math.max(eyeDistance, 0.0001)) * 180 / Math.PI;
    const pitch = (rawPitch - 20) * 1.5;
    const roll = Math.atan2(rightEyeOuter.y - leftEyeOuter.y, rightEyeOuter.x - leftEyeOuter.x) * 180 / Math.PI;
    return { yaw: yaw, pitch: pitch, roll: roll };
  }

  function getCalibratedPose(pose) {
    if (!neutralPose) {
      poseCalibrationSamples.push(pose);
      if (poseCalibrationSamples.length >= 8) {
        neutralPose = poseCalibrationSamples.reduce(function (average, sample) {
          average.yaw += sample.yaw;
          average.pitch += sample.pitch;
          average.roll += sample.roll;
          return average;
        }, { yaw: 0, pitch: 0, roll: 0 });
        neutralPose.yaw /= poseCalibrationSamples.length;
        neutralPose.pitch /= poseCalibrationSamples.length;
        neutralPose.roll /= poseCalibrationSamples.length;
      }
    }

    if (!neutralPose) {
      return { yaw: 0, pitch: 0, roll: 0 };
    }
    return {
      yaw: pose.yaw - neutralPose.yaw,
      pitch: pose.pitch - neutralPose.pitch,
      roll: pose.roll - neutralPose.roll
    };
  }

  function hasCenteredGaze(landmarks) {
    const leftIris = landmarks[468];
    const rightIris = landmarks[473];
    if (!leftIris || !rightIris) {
      return true;
    }

    const leftEyeWidth = Math.max(Math.abs(landmarks[33].x - landmarks[133].x), 0.0001);
    const rightEyeWidth = Math.max(Math.abs(landmarks[263].x - landmarks[362].x), 0.0001);
    const leftRatio = (leftIris.x - Math.min(landmarks[33].x, landmarks[133].x)) / leftEyeWidth;
    const rightRatio = (rightIris.x - Math.min(landmarks[263].x, landmarks[362].x)) / rightEyeWidth;
    return leftRatio > 0.15 && leftRatio < 0.85 && rightRatio > 0.15 && rightRatio < 0.85;
  }

  function classifyFace(landmarks, blendshapes) {
    const pose = getCalibratedPose(calculateHeadPose(landmarks));
    const browDown = getBlendshapeScore(blendshapes, "browDownLeft") + getBlendshapeScore(blendshapes, "browDownRight");
    const browInnerUp = getBlendshapeScore(blendshapes, "browInnerUp");
    const blinkLeft = getBlendshapeScore(blendshapes, "eyeBlinkLeft");
    const blinkRight = getBlendshapeScore(blendshapes, "eyeBlinkRight");
    const gazeCentered = hasCenteredGaze(landmarks);
    const squinting = blinkLeft >= 0.25 && blinkLeft <= 0.65 && blinkRight >= 0.25 && blinkRight <= 0.65;
    const slightHeadTilt = Math.abs(pose.roll) > 8 || Math.abs(pose.yaw) > 8 || Math.abs(pose.pitch) > 8;
    const distracted = Math.abs(pose.yaw) > 20 || Math.abs(pose.pitch) > 18 || !gazeCentered;
    const confused = browDown > 0.40 || browInnerUp > 0.35 || (squinting && slightHeadTilt);

    if (distracted) {
      return "distracted";
    }
    if (confused) {
      return "confused";
    }
    return "focused";
  }

  function saveResultLocally(result) {
    let savedSessions = [];
    try {
      savedSessions = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "[]");
    } catch (error) {
      savedSessions = [];
    }
    if (!Array.isArray(savedSessions)) {
      savedSessions = [];
    }
    savedSessions.unshift(result);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(savedSessions.slice(0, 30)));
  }

  function playAlarmTone() {
    if (!alarmContext) {
      return;
    }
    const oscillator = alarmContext.createOscillator();
    const gain = alarmContext.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, alarmContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, alarmContext.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, alarmContext.currentTime + 0.22);
    oscillator.connect(gain);
    gain.connect(alarmContext.destination);
    oscillator.start();
    oscillator.stop(alarmContext.currentTime + 0.24);
  }

  function updateAlarm(distractedPercent) {
    if (running && distractedPercent > 40) {
      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextConstructor) {
        return;
      }
      if (!alarmContext) {
        alarmContext = new AudioContextConstructor();
      }
      if (alarmContext.state === "suspended") {
        alarmContext.resume();
      }
      if (!alarmInterval) {
        playAlarmTone();
        alarmInterval = setInterval(playAlarmTone, 700);
      }
      return;
    }
    stopAlarm();
  }

  function stopAlarm() {
    if (alarmInterval) {
      clearInterval(alarmInterval);
      alarmInterval = null;
    }
    if (alarmContext) {
      alarmContext.close();
      alarmContext = null;
    }
  }

  function resetSessionStats() {
    focusedFrames = 0;
    distractedFrames = 0;
    confusedFrames = 0;
    totalFrames = 0;
    totalFocusedTime = 0;
    totalDistractedTime = 0;
    totalConfusedTime = 0;
    activeState = null;
    activeStateAt = null;
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
    confusedPct.textContent = "0%";
    sessionDuration.textContent = "0s";
    finalFocus.textContent = "-";
    finalDistracted.textContent = "-";
    finalConfused.textContent = "-";
    saveStatus.textContent = "Not saved yet";
    frameCount.textContent = "0";
    processingStatus.textContent = "Starting";
    faceStatus.textContent = "Looking for face";
    blinkTotal = 0;
    eyesClosed = false;
    noFaceFrames = 0;
    neutralPose = null;
    poseCalibrationSamples = [];
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

  async function createFaceLandmarker() {
    const version = "0.10.35";
    const moduleUrls = [
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + version + "/vision_bundle.mjs",
      "https://unpkg.com/@mediapipe/tasks-vision@" + version + "/vision_bundle.mjs"
    ];
    const wasmUrls = [
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + version + "/wasm",
      "https://unpkg.com/@mediapipe/tasks-vision@" + version + "/wasm"
    ];

    let vision;
    let moduleError;
    for (const moduleUrl of moduleUrls) {
      try {
        vision = await import(moduleUrl);
        break;
      } catch (error) {
        moduleError = error;
      }
    }
    if (!vision) {
      throw new Error("MediaPipe tasks-vision module could not be loaded: " + (moduleError && moduleError.message ? moduleError.message : "network error"));
    }

    let filesetResolver;
    let wasmError;
    for (const wasmUrl of wasmUrls) {
      try {
        filesetResolver = await vision.FilesetResolver.forVisionTasks(wasmUrl);
        break;
      } catch (error) {
        wasmError = error;
      }
    }
    if (!filesetResolver) {
      throw new Error("MediaPipe WASM files could not be loaded: " + (wasmError && wasmError.message ? wasmError.message : "network error"));
    }

    const modelUrls = [
      "/face_landmarker.task",
      "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
    ];
    let modelAssetBuffer;
    let modelError;
    for (const modelUrl of modelUrls) {
      try {
        const response = await fetch(modelUrl, { mode: "cors", cache: "force-cache" });
        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }
        modelAssetBuffer = new Uint8Array(await response.arrayBuffer());
        if (!modelAssetBuffer.byteLength) {
          throw new Error("empty model response");
        }
        break;
      } catch (error) {
        modelError = error;
        console.warn("MediaPipe model fetch failed; trying the next model source.", modelUrl, error);
      }
    }
    if (!modelAssetBuffer) {
      throw new Error("MediaPipe face model could not be fetched: " + (modelError && modelError.message ? modelError.message : "network error"));
    }

    const options = {
      baseOptions: {
        modelAssetBuffer: modelAssetBuffer,
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    };
    try {
      return await vision.FaceLandmarker.createFromOptions(filesetResolver, options);
    } catch (error) {
      options.baseOptions.delegate = "CPU";
      return vision.FaceLandmarker.createFromOptions(filesetResolver, options);
    }
  }

  async function startCameraSession() {
    focusError.textContent = "";

    try {
      const session = await getSession();
      if (typeof drawConnectors === "undefined") {
        throw new Error("MediaPipe drawing utilities did not load. Check the internet connection and reload.");
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("This browser does not support camera access.");
      }

      if (focusWelcome) {
        focusWelcome.textContent = "Live tracking for " + session.username + ". Keep your face visible and centered.";
      }

      if (!faceLandmarker) {
        processingStatus.textContent = "Loading model";
        try {
          faceLandmarker = await Promise.race([
            createFaceLandmarker(),
            new Promise(function (_, reject) {
              setTimeout(function () { reject(new Error("MediaPipe model timed out. Check internet access and reload.")); }, 15000);
            })
          ]);
        } catch (error) {
          faceLandmarker = null;
          processingStatus.textContent = "Detector error";
          console.error("MediaPipe Face Landmarker initialization failed.", error);
          throw error;
        }
        processingStatus.textContent = "Detector ready";
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
      inputCanvas.width = cameraFeed.videoWidth;
      inputCanvas.height = cameraFeed.videoHeight;
      cameraOverlay.width = cameraFeed.videoWidth;
      cameraOverlay.height = cameraFeed.videoHeight;

      async function processFrame() {
        if (!running || !faceLandmarker) {
          return;
        }
        if (!processingFrame) {
          processingFrame = true;
          processingStatus.textContent = "Sending frame";
          try {
            inputContext.drawImage(cameraFeed, 0, 0, inputCanvas.width, inputCanvas.height);
            const results = faceLandmarker.detectForVideo(inputCanvas, Math.round(performance.now()));
            const landmarks = results.faceLandmarks && results.faceLandmarks[0];
            const vw = cameraFeed.videoWidth || inputCanvas.width;
            const vh = cameraFeed.videoHeight || inputCanvas.height;
            if (cameraOverlay.width !== vw || cameraOverlay.height !== vh) {
              cameraOverlay.width = vw;
              cameraOverlay.height = vh;
            }

            drawLandmarks(landmarks || null);
            frameCount.textContent = String(Number(frameCount.textContent) + 1);
            processingStatus.textContent = "Receiving frames";

            if (!landmarks) {
              noFaceFrames += 1;
              faceStatus.textContent = "No face detected";
              eyesClosed = false;
              markState("distracted");
            } else {
              noFaceFrames = 0;
              faceStatus.textContent = "Face detected";
              const leftEyeOpen = Math.abs(landmarks[159].y - landmarks[145].y);
              const rightEyeOpen = Math.abs(landmarks[386].y - landmarks[374].y);
              const currentlyClosed = leftEyeOpen < 0.012 && rightEyeOpen < 0.012;
              if (currentlyClosed && !eyesClosed) {
                blinkTotal += 1;
                blinkCount.textContent = String(blinkTotal);
              }
              eyesClosed = currentlyClosed;
              const blendshapes = results.faceBlendshapes && results.faceBlendshapes[0] ? results.faceBlendshapes[0].categories : [];
              markState(classifyFace(landmarks, blendshapes));
            }
          } catch (error) {
            running = false;
            stopAlarm();
            stopTracks();
            if (processingTimer) {
              clearTimeout(processingTimer);
              processingTimer = null;
            }
            if (durationTimer) {
              clearInterval(durationTimer);
              durationTimer = null;
            }
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
      stopAlarm();
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
    stopAlarm();

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
      const percentages = calculatePercentages();
      const focusPercent = percentages.focused;
      const distractedPercent = percentages.distracted;
      const confusedPercent = percentages.confused;
      finalFocus.textContent = String(focusPercent) + "%";
      finalDistracted.textContent = String(distractedPercent) + "%";
      finalConfused.textContent = String(confusedPercent) + "%";

      const resultPayload = {
        sessionId: (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : String(Date.now()),
        timestamp: new Date(endedAt).toISOString(),
        duration: totalSeconds,
        focusedPct: focusPercent,
        distractedPct: distractedPercent,
        confusedPct: confusedPercent
      };

      saveResultLocally(resultPayload);
      saveStatus.textContent = "Saved locally on this device.";
    } catch (error) {
      saveStatus.textContent = "Result generated but local save failed.";
      focusError.textContent = "Could not save session result on this device.";
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
