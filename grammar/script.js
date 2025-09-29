/* ============================
   SLGTTI Grammar Test (SCORM 1.2)
   Robust, idempotent, resume-capable
   ============================ */

(() => {
  // ---- Per-frame guard: never run this file twice in the same content iframe ----
  if (window.__SLGTTI_GRAMMAR_LOADED__) {
    console.warn("[GRAMMAR] script already loaded in this frame — skipping re-register.");
    return;
  }
  window.__SLGTTI_GRAMMAR_LOADED__ = true;

  // ---------------- Config ----------------
  const TOTAL_QUESTIONS = 50;
  const TEST_DURATION_MS = 40 * 60 * 1000; // 40 minutes
  const SHEETS_URL = "https://script.google.com/macros/s/AKfycbxZKrhA-wXc_7ymR1wOwX-W_GzyMZwXqj3ORdvJ84QCibx2gt9_D5FvicLJdrXj36nJOQ/exec";

  // ---------------- State ----------------
  let bank = {};                 // { set1:[], set2:[], set3:[], set4:[] }
  let selectedQuestions = [];    // array of questions (with .id, .question, .options, .answer)
  let userAnswers = {};          // { [questionIndex]: "selectedOption" }
  let startTimestamp = null;     // ms since epoch
  let timerInterval = null;
  let finished = false;

  // SCORM
  let isScormMode = false;
  let scorm = null;

  // ---------------- DOM ----------------
  const elQuestions = document.getElementById("questions-container");
  const elCheckBtn  = document.getElementById("check-answers");
  const elActions   = document.querySelector(".actions");
  const elTime      = document.getElementById("time-remaining");
  const elTimerBar  = document.getElementById("timer-bar");

  const elInstructions  = document.querySelector(".instructions");
  const elTimer         = document.querySelector(".timer");
  const elTimerWrap     = document.querySelector(".timer-container");
  const elContainer     = document.querySelector(".container");

  // ---------------- Utilities ----------------
  function shuffleArray(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function showNotification(message, type = "success") {
    const n = document.createElement("div");
    n.className = `notification ${type}`;
    n.innerHTML = `<i class="fas fa-check-circle"></i>${message}`;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 5000);
  }

  function msToMMSS(ms) {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }

  function safeJsonParse(str, fallback = null) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  // ---------------- Questions ----------------
  async function loadQuestionBank() {
    const res = await fetch("questions.json");
    const data = await res.json();
    bank = {
      set1: data.question_set_1 || [],
      set2: data.question_set_2 || [],
      set3: data.question_set_3 || [],
      set4: data.question_set_4 || []
    };
  }

  // Unique sample of TOTAL_QUESTIONS from all sets combined
  function pickQuestionsFresh() {
    const pool = [
      ...(bank.set1 || []),
      ...(bank.set2 || []),
      ...(bank.set3 || []),
      ...(bank.set4 || []),
    ].map(q => ({ ...q })); // shallow copy

    if (pool.length < TOTAL_QUESTIONS) {
      console.warn(`[GRAMMAR] Question pool smaller (${pool.length}) than required (${TOTAL_QUESTIONS}).`);
    }

    shuffleArray(pool);
    selectedQuestions = pool.slice(0, TOTAL_QUESTIONS).map(q => {
      // shuffle options per question
      return { ...q, options: shuffleArray([...(q.options || [])]) };
    });
  }

  function renderQuestions() {
    elQuestions.innerHTML = "";

    selectedQuestions.forEach((question, index) => {
      const item = document.createElement("div");
      item.className = "question-item";
      item.dataset.index = index;

      const optsHtml = (question.options || [])
        .map(opt => `<li class="option" data-value="${String(opt)}">${opt}</li>`)
        .join("");

      item.innerHTML = `
        <div class="question-number">${index + 1}</div>
        <div class="question-content">
          <p class="question-text">${question.question}</p>
          <ul class="options">${optsHtml}</ul>
        </div>
      `;

      item.querySelectorAll(".option").forEach(optEl => {
        optEl.addEventListener("click", () => {
          // visual selection
          item.querySelectorAll(".option").forEach(o => o.classList.remove("selected"));
          optEl.classList.add("selected");

          // record
          const val = optEl.dataset.value;
          userAnswers[index] = val;

          // persist partial answers to SCORM (resume)
          if (isScormMode) {
            const state = {
              startTime: startTimestamp,
              questionIds: selectedQuestions.map(q => q.id),
              answers: userAnswers
            };
            scorm.set("cmi.suspend_data", JSON.stringify(state));
            scorm.save();
          }
        });
      });

      elQuestions.appendChild(item);
    });
  }

  function restoreSelectionsFromState() {
    Object.keys(userAnswers).forEach(idx => {
      const item = elQuestions.querySelector(`.question-item[data-index="${idx}"]`);
      if (!item) return;
      const value = userAnswers[idx];
      const match = [...item.querySelectorAll(".option")].find(o => o.dataset.value === value);
      if (match) match.classList.add("selected");
    });
  }

  // ---------------- Timer ----------------
  function startTimer() {
    if (!startTimestamp) startTimestamp = Date.now();
    updateTimerDisplay(); // immediate tick
    timerInterval = setInterval(updateTimerDisplay, 1000);
  }

  function updateTimerDisplay() {
    const now = Date.now();
    const elapsed = now - startTimestamp;
    const remaining = Math.max(0, TEST_DURATION_MS - elapsed);

    elTime.textContent = msToMMSS(remaining);

    const pct = (remaining / TEST_DURATION_MS) * 100;
    elTimerBar.style.width = `${pct}%`;
    elTimerBar.style.backgroundColor = pct < 25 ? "var(--danger-color)" :
                                       pct < 50 ? "var(--warning-color)" :
                                                  "var(--primary-color)";

    if (remaining <= 0) {
      endTest(true);
    }
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  // ---------------- SCORM Lifecycle ----------------
  function scormActive() {
    return scorm && scorm.connection && scorm.connection.isActive;
  }

  function initScormOnce() {
    if (!window.pipwerks || !window.pipwerks.SCORM) return false;

    scorm = window.pipwerks.SCORM;
    // Already active?
    if (scormActive()) return true;

    if (initScormOnce.__running) return scormActive();
    initScormOnce.__running = true;

    const ok = scorm.init(); // LMSInitialize
    initScormOnce.__running = false;

    if (ok) {
      isScormMode = true;
      return true;
    }
    return false;
  }

  function commitScorm() {
    if (scormActive()) scorm.save();
  }

  function quitScormOnce() {
    if (!scormActive()) return;
    if (quitScormOnce.__done) return;
    quitScormOnce.__done = true;
    try { scorm.save(); } catch {}
    try { scorm.quit(); } catch {}
  }

  // ---------------- Completion / Scoring ----------------
  async function endTest(isTimeout = false) {
    if (finished) return;
    finished = true;

    stopTimer();

    // Hide test UI
    if (elQuestions) elQuestions.style.display = "none";
    if (elActions) elActions.style.display = "none";
    if (elInstructions) elInstructions.style.display = "none";
    if (elTimer) elTimer.style.display = "none";
    if (elTimerWrap) elTimerWrap.style.display = "none";

    // Score
    const correct = Object.keys(userAnswers).reduce((sum, idx) => {
      const i = Number(idx);
      const ua = userAnswers[i];
      const ans = selectedQuestions[i]?.answer;
      return sum + (ua === ans ? 1 : 0);
    }, 0);
    const maxMarks = TOTAL_QUESTIONS;

    // Time spent
    const spentMs = Math.min(Date.now() - startTimestamp, TEST_DURATION_MS);
    const timeDisplay = msToMMSS(spentMs);
    const completionIso = new Date().toISOString();

    // Completion message
    const wrap = document.createElement("div");
    wrap.className = "completion-message";
    wrap.innerHTML = `
      <div class="tick-icon"></div>
      <h2>Test Completed!</h2>
      <p class="completion-info">Grammar Test Completed Successfully</p>
      <div class="score-display">${correct}/${maxMarks}</div>
      <p class="time-spent">Time Spent: ${timeDisplay}</p>
      <p class="completion-time">Completed at: ${new Date(completionIso).toLocaleString()}</p>
    `;
    if (elContainer) elContainer.appendChild(wrap);

    // SCORM submit
    if (isScormMode && scormActive()) {
      scorm.set("cmi.core.score.raw", String(correct));
      scorm.set("cmi.core.score.min", "0");
      scorm.set("cmi.core.score.max", String(maxMarks));
      scorm.set("cmi.core.lesson_status", "completed");

      const completionData = { completedAt: completionIso, timeSpent: timeDisplay };
      scorm.set("cmi.suspend_data", JSON.stringify(completionData));
      commitScorm();
    }

    // Send to Google Sheets
    await sendToGoogleSheets(correct, correct, timeDisplay);

    showNotification(isTimeout ? "Time's up! Test submitted." : "Test completed successfully!", "success");
  }

  function showCompletedStateFromScorm() {
    const scoreRaw = scorm.get("cmi.core.score.raw");
    const scoreMax = scorm.get("cmi.core.score.max") || "50";
    const sdata = safeJsonParse(scorm.get("cmi.suspend_data"), {});
    const completedAt = sdata.completedAt ? new Date(sdata.completedAt).toLocaleString() : "Unavailable";
    const timeSpent = sdata.timeSpent || "Unavailable";

    document.body.innerHTML = `
      <div class="container">
        <div class="completion-message">
          <div class="tick-icon"></div>
          <h2>Test Already Completed</h2>
          <p class="completion-info">Grammar Test was completed in a previous session</p>
          <div class="score-display">${scoreRaw}/${scoreMax}</div>
          <p class="time-spent">Time Spent: ${timeSpent}</p>
          <p class="completion-time">Completed at: ${completedAt}</p>
        </div>
      </div>
    `;
  }

  // ---------------- Sheets ----------------
  async function sendToGoogleSheets(correctAnswers, marks, timeSpent) {
    // Build compact answers listing
    let answersString = "";
    selectedQuestions.forEach((q, idx) => {
      const ua = userAnswers[idx] ?? "N/A";
      const ok = ua === q.answer ? "✓" : "✗";
      answersString += `${q.id}: ${ua} (${ok}), `;
    });
    answersString = answersString.replace(/, $/, "");

    let studentName = "Anonymous";
    let studentId = "";
    if (isScormMode && scormActive()) {
      studentName = scorm.get("cmi.core.student_name") || "Anonymous";
      studentId   = scorm.get("cmi.core.student_id") || "";
    }

    const payload = {
      testType: "Grammar Test",
      name: studentName,
      studentId,
      correctAnswers,
      marks,
      totalQuestions: TOTAL_QUESTIONS,
      totalMarks: TOTAL_QUESTIONS,
      timeSpent,
      date: new Date().toISOString(),
      answers: answersString
    };

    try {
      console.log("Sending to Google Sheets:", payload);
      await fetch(SHEETS_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error("[GRAMMAR] Error sending to Google Sheets:", e);
    }
  }

  // ---------------- Boot ----------------
  async function boot() {
    console.log("Page loaded, initializing SCORM...");

    // Try SCORM
    if (initScormOnce()) {
      // Already completed?
      const status = scorm.get("cmi.core.lesson_status");
      if (status === "completed" || status === "passed" || status === "failed") {
        showCompletedStateFromScorm();
        return;
      }
    }

    // Load bank
    await loadQuestionBank();

    // If SCORM & suspend_data available, try resume; else fresh test
    if (isScormMode && scormActive()) {
      const suspendDataRaw = scorm.get("cmi.suspend_data");
      const s = safeJsonParse(suspendDataRaw, null);

      if (s && s.startTime && Array.isArray(s.questionIds)) {
        // Resume path
        startTimestamp = parseInt(s.startTime, 10);
        userAnswers = s.answers || {};

        // Build selectedQuestions from saved IDs
        const idToQuestion = {};
        // index questions by id across all sets
        ["set1","set2","set3","set4"].forEach(setKey => {
          (bank[setKey] || []).forEach(q => { idToQuestion[String(q.id)] = q; });
        });
        selectedQuestions = s.questionIds
          .map(id => idToQuestion[String(id)])
          .filter(Boolean)
          .map(q => ({ ...q, options: shuffleArray([...(q.options || [])]) })); // reshuffle options for display

        // If time elapsed is already over, end immediately
        const elapsed = Date.now() - startTimestamp;
        if (Number.isFinite(startTimestamp) && elapsed >= TEST_DURATION_MS) {
          await endTest(true);
          return;
        }

        renderQuestions();
        restoreSelectionsFromState();
        startTimer();
        return;
      }
    }

    // Fresh test
    pickQuestionsFresh();
    renderQuestions();

    // Initialize and persist initial state if SCORM
    startTimestamp = Date.now();
    userAnswers = {};
    if (isScormMode && scormActive()) {
      const initialState = {
        startTime: startTimestamp,
        questionIds: selectedQuestions.map(q => q.id),
        answers: {}
      };
      scorm.set("cmi.core.lesson_status", "incomplete");
      scorm.set("cmi.suspend_data", JSON.stringify(initialState));
      commitScorm();
    }

    startTimer();
  }

  // Attach once
  document.addEventListener("DOMContentLoaded", boot, { once: true });

  // End test on button (guarded)
  if (elCheckBtn) {
    elCheckBtn.addEventListener("click", () => endTest(false), { once: true });
  }

  // SCORM terminate on unload (idempotent)
  window.addEventListener("beforeunload", quitScormOnce, { once: true });
  window.addEventListener("unload",       quitScormOnce, { once: true });
})();
