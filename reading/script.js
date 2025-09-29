/* ============================
   SLGTTI Reading Test (SCORM 1.2)
   Idempotent, resume-capable, safe lifecycle
   ============================ */

(() => {
  // --- Per-frame guard to prevent double-loading ---
  if (window.__SLGTTI_READING_LOADED__) {
    console.warn("[READING] script already loaded in this frame — skipping re-register.");
    return;
  }
  window.__SLGTTI_READING_LOADED__ = true;

  // -------- State --------
  let questions = {};                 // JSON bank
  let selectedSet = null;             // question_set_1 .. question_set_4
  const testDuration = 15 * 60 * 1000; // 15 minutes
  let startTimestamp = null;
  let timerInterval = null;
  let userAnswers = {};               // { [originalIndex]: "option" }
  let isScormMode = false;
  let scorm = null;

  // -------- DOM --------
  const passageTitle        = document.getElementById("passage-title");
  const passageText         = document.getElementById("passage-text");
  const questionsContainer  = document.getElementById("questions-container");
  const checkAnswersBtn     = document.getElementById("check-answers");
  const actionsSection      = document.querySelector(".actions");
  const timeRemainingEl     = document.getElementById("time-remaining");
  const timerBar            = document.getElementById("timer-bar");
  const readingContainer    = document.querySelector(".reading-container");
  const instructionsEl      = document.querySelector(".instructions");
  const timerEl             = document.querySelector(".timer");
  const timerWrapEl         = document.querySelector(".timer-container");
  const containerEl         = document.querySelector(".container");

  // -------- Utils --------
  function shuffleArray(arr) {
    const a = [...arr];
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

  // -------- SCORM guards --------
  function scormActive() {
    return scorm && scorm.connection && scorm.connection.isActive;
  }

  function initScormOnce() {
    try {
      scorm = (window.pipwerks && window.pipwerks.SCORM) ? window.pipwerks.SCORM : null;
    } catch { scorm = null; }
    if (!scorm) return false;

    if (scormActive()) return true;             // already inited
    if (initScormOnce.__running) return scormActive();
    initScormOnce.__running = true;

    const ok = scorm.init();                    // LMSInitialize
    initScormOnce.__running = false;
    if (ok) { isScormMode = true; return true; }
    return false;
  }

  function commitScorm() { if (scormActive()) scorm.save(); }

  function quitScormOnce() {
    if (!scormActive()) return;
    if (quitScormOnce.__done) return;
    quitScormOnce.__done = true;
    try { scorm.save(); } catch {}
    try { scorm.quit(); } catch {}
  }

  // -------- Load bank & start flow --------
  async function fetchReadingTestFresh() {
    try {
      const res = await fetch("questions.json");
      questions = await res.json();

      selectRandomSet();
      initializeTest();
      displayReadingTest();
      startTimer();
    } catch (err) {
      console.error("Error loading reading test:", err);
      if (questionsContainer) {
        questionsContainer.innerHTML = '<p class="error">Failed to load reading test.</p>';
      }
    }
  }

  async function initScormFlow() {
    console.log("Page loaded, initializing SCORM...");

    // Try SCORM
    if (!initScormOnce()) {
      await fetchReadingTestFresh(); // non-SCORM fallback
      return;
    }
    console.log("SCORM connection established");

    // Completed already?
    const status = scorm.get("cmi.core.lesson_status");
    if (status === "completed" || status === "passed" || status === "failed") {
      showCompletedState();
      return;
    }

    // Try resume from suspend_data
    const sdataRaw = scorm.get("cmi.suspend_data");
    if (sdataRaw) {
      try {
        const saved = JSON.parse(sdataRaw);
        // time expiry?
        const now = Date.now();
        if (saved?.startTime && (now - saved.startTime) >= testDuration) {
          await endTest(true);
          return;
        }

        // restore state path
        console.log("Restoring saved state:", saved);
        startTimestamp = parseInt(saved.startTime, 10) || Date.now();
        userAnswers   = saved.answers || {};
        selectedSet   = saved.selectedSet;

        const res = await fetch("questions.json");
        questions = await res.json();

        // Rebuild shuffled list using saved order (indexes in original set.question)
        const set = questions[selectedSet];
        if (!set) {
          // bank changed; start fresh
          await fetchReadingTestFresh();
          return;
        }

        if (Array.isArray(saved.questionOrder)) {
          set.shuffledQuestions = saved.questionOrder.map(idx => ({
            ...set.question[idx],
            originalIndex: idx
          }));
        } else {
          // no order saved; fall back to original order
          set.shuffledQuestions = set.question.map((q, idx) => ({ ...q, originalIndex: idx }));
        }

        displayReadingTest();
        restoreUserAnswers();
        startTimer();
        return;

      } catch (e) {
        console.error("Error restoring state:", e);
      }
    }

    // Else, start fresh
    await fetchReadingTestFresh();
  }

  // -------- Test setup --------
  function initializeTest() {
    startTimestamp = Date.now();
    userAnswers = {};

    if (isScormMode && scormActive()) {
      const set = questions[selectedSet];
      const initialState = {
        startTime: startTimestamp,
        selectedSet,
        answers: {},
        questionOrder: getQuestionOrder(set),
      };
      scorm.set("cmi.core.lesson_status", "incomplete");
      scorm.set("cmi.suspend_data", JSON.stringify(initialState));
      commitScorm();
    }
  }

  function selectRandomSet() {
    const sets = ["question_set_1", "question_set_2", "question_set_3", "question_set_4"];
    selectedSet = sets[Math.floor(Math.random() * sets.length)];

    const set = questions[selectedSet];
    const base = set.question.map((q, idx) => ({ ...q, originalIndex: idx }));
    set.shuffledQuestions = shuffleArray(base);
  }

  function getQuestionOrder(set) {
    if (!set) return [];
    if (set.shuffledQuestions?.length) return set.shuffledQuestions.map(q => q.originalIndex);
    return set.question.map((_, idx) => idx);
  }

  // -------- Render --------
  function displayReadingTest() {
    const set = questions[selectedSet];
    if (!set) {
      questionsContainer.innerHTML = '<p class="error">No question set found.</p>';
      return;
    }

    passageTitle.textContent = set.title || "Reading";
    passageText.innerHTML = (set.passage || "").replace(/\n/g, "<br>");

    if (!set.shuffledQuestions) {
      set.shuffledQuestions = set.question.map((q, idx) => ({ ...q, originalIndex: idx }));
    }

    questionsContainer.innerHTML = "";
    set.shuffledQuestions.forEach((q, displayIndex) => {
      const el = document.createElement("div");
      el.className = "question-item";
      // Store the ORIGINAL question index for answer mapping and restore
      el.dataset.index = q.originalIndex;

      const optionsHtml = shuffleArray(q.options || []).map(opt =>
        `<li class="option" data-value="${String(opt)}">${opt}</li>`
      ).join("");

      el.innerHTML = `
        <div class="question-number">${displayIndex + 1}</div>
        <div class="question-content">
          <p class="question-text">${q.question}</p>
          <ul class="options">${optionsHtml}</ul>
        </div>
      `;

      // Allow changing answers => NO { once:true }
      el.querySelectorAll(".option").forEach(optEl => {
        optEl.addEventListener("click", () =>
          selectOption(q.originalIndex, optEl.dataset.value, optEl)
        );
      });

      questionsContainer.appendChild(el);
    });
  }

  // -------- Answer selection --------
  function selectOption(originalIndex, option, optionElement) {
    const item = optionElement.closest(".question-item");
    if (!item) return;

    item.querySelectorAll(".option").forEach(o => o.classList.remove("selected"));
    optionElement.classList.add("selected");

    userAnswers[originalIndex] = option;

    if (isScormMode && scormActive()) {
      const set = questions[selectedSet];
      const state = {
        startTime: startTimestamp,
        selectedSet,
        answers: userAnswers,
        questionOrder: getQuestionOrder(set),
      };
      scorm.set("cmi.suspend_data", JSON.stringify(state));
      commitScorm();
    }
  }

  function restoreUserAnswers() {
    Object.keys(userAnswers).forEach((idx) => {
      const val = userAnswers[idx];
      const el = document.querySelector(`.question-item[data-index="${idx}"]`);
      if (!el) return;
      const target = [...el.querySelectorAll(".option")].find(o => o.dataset.value === val);
      if (target) target.classList.add("selected");
    });
  }

  // -------- Timer --------
  function startTimer() {
    updateTimerDisplay();
    timerInterval = setInterval(updateTimerDisplay, 1000);
  }

  function updateTimerDisplay() {
    const now = Date.now();
    const remaining = Math.max(0, testDuration - (now - startTimestamp));

    if (remaining <= 0) {
      endTest(true);
      return;
    }

    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    timeRemainingEl.textContent = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;

    const pct = (remaining / testDuration) * 100;
    timerBar.style.width = `${pct}%`;
    timerBar.style.backgroundColor = pct < 25 ? "var(--danger-color)"
                                : pct < 50 ? "var(--warning-color)"
                                           : "var(--primary-color)";
  }

  // -------- Finish --------
  async function endTest(isTimeout = false) {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

    // Hide UI
    if (questionsContainer) questionsContainer.style.display = "none";
    if (actionsSection)     actionsSection.style.display = "none";
    readingContainer?.style.setProperty("display", "none");
    instructionsEl?.style.setProperty("display", "none");
    timerEl?.style.setProperty("display", "none");
    timerWrapEl?.style.setProperty("display", "none");

    // Score
    const set = questions[selectedSet];
    const correctAnswers = Object.keys(userAnswers).reduce((total, idx) => {
      const i = Number(idx);
      return total + (userAnswers[i] === set.question[i].answer ? 1 : 0);
    }, 0);
    const questionCount    = set.question.length;
    const marksPerQuestion = 2;
    const marksAwarded     = correctAnswers * marksPerQuestion;
    const maxMarks         = questionCount * marksPerQuestion;

    // Time spent
    const spent = Math.min(Date.now() - startTimestamp, testDuration);
    const mm = Math.floor(spent / 60000);
    const ss = Math.floor((spent % 60000) / 1000);
    const timeDisplay = `${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
    const completionDate = new Date();
    const completionIso  = completionDate.toISOString();

    // Completion card
    const div = document.createElement("div");
    div.className = "completion-message";
    div.innerHTML = `
      <div class="tick-icon"></div>
      <h2>Test Completed!</h2>
      <p class="completion-info">Reading Test Completed Successfully</p>
      <div class="score-display">${correctAnswers}/${questionCount}</div>
      <p class="time-spent">Time Spent: ${timeDisplay}</p>
      <p class="completion-time">Completed at: ${completionDate.toLocaleString()}</p>
    `;
    containerEl?.appendChild(div);

    // SCORM submit
    if (isScormMode && scormActive()) {
      scorm.set("cmi.core.score.raw", String(marksAwarded));
      scorm.set("cmi.core.score.min", "0");
      scorm.set("cmi.core.score.max", String(maxMarks));
      scorm.set("cmi.core.lesson_status", "completed");

      const completionData = { completedAt: completionIso, timeSpent: timeDisplay };
      scorm.set("cmi.suspend_data", JSON.stringify(completionData));
      commitScorm();
    }

    await sendToGoogleSheets(correctAnswers, marksAwarded, maxMarks, timeDisplay);

    showNotification(isTimeout ? "Time's up! Test submitted." : "Test completed successfully!");
  }

  // -------- Completed view (re-entry) --------
  function showCompletedState() {
    const score = scorm.get("cmi.core.score.raw");
    const maxScore = scorm.get("cmi.core.score.max") || "10"; // your original default
    const sdata = scorm.get("cmi.suspend_data");

    let completedAt = "Unavailable";
    let timeSpent   = "Unavailable";

    if (sdata) {
      try {
        const parsed = JSON.parse(sdata);
        if (parsed.completedAt) {
          const dt = new Date(parsed.completedAt);
          if (!Number.isNaN(dt.getTime())) completedAt = dt.toLocaleString();
        }
        if (parsed.timeSpent) timeSpent = parsed.timeSpent;
      } catch (e) {
        console.error("Error parsing completion data:", e);
      }
    }

    document.body.innerHTML = `
      <div class="container">
        <div class="completion-message">
          <div class="tick-icon"></div>
          <h2>Test Already Completed</h2>
          <p class="completion-info">Reading Test was completed in a previous session</p>
          <div class="score-display">${score}/${maxScore}</div>
          <p class="time-spent">Time Spent: ${timeSpent}</p>
          <p class="completion-time">Completed at: ${completedAt}</p>
        </div>
      </div>
    `;
  }

  // -------- Sheets --------
  async function sendToGoogleSheets(correctAnswers, marks, totalMarks, timeSpent) {
    const SHEETS_URL = "https://script.google.com/macros/s/AKfycbxZKrhA-wXc_7ymR1wOwX-W_GzyMZwXqj3ORdvJ84QCibx2gt9_D5FvicLJdrXj36nJOQ/exec";

    let studentName = "Anonymous";
    let studentId   = "";
    if (isScormMode && scormActive()) {
      studentName = scorm.get("cmi.core.student_name") || "Anonymous";
      studentId   = scorm.get("cmi.core.student_id")   || "";
    }

    const set = questions[selectedSet];
    // answersString uses ORIGINAL index to align with scoring
    let answersString = "";
    set.question.forEach((q, idx) => {
      const ua = userAnswers[idx] ?? "N/A";
      const ok = ua === q.answer;
      answersString += `${q.id}: ${ua} (${ok ? "✓" : "✗"}), `;
    });
    answersString = answersString.replace(/, $/, "");

    const payload = {
      testType: "Reading Test",
      name: studentName,
      studentId,
      correctAnswers,
      marks,
      totalQuestions: set.question.length,
      totalMarks,
      timeSpent,
      date: new Date().toISOString(),
      answers: answersString,
      passageTitle: set.title,
    };

    try {
      console.log("Sending to Google Sheets:", payload);
      await fetch(SHEETS_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.error("Error sending to Google Sheets:", e);
    }
  }

  // -------- Boot --------
  document.addEventListener("DOMContentLoaded", () => {
    initScormFlow();

    if (checkAnswersBtn) {
      // single final submit is OK to be once:true
      checkAnswersBtn.addEventListener("click", () => endTest(false), { once: true });
    }

    // Idempotent terminate
    window.addEventListener("beforeunload", quitScormOnce, { once: true });
    window.addEventListener("unload",       quitScormOnce, { once: true });
  }, { once: true });

})();
