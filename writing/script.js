/* ==========================================
   SLGTTI Writing Test (SCORM 1.2)
   Idempotent, resume-capable, safe lifecycle
   ========================================== */

(() => {
  // Per-frame guard to avoid re-running in the same SCO iframe
  if (window.__SLGTTI_WRITING_LOADED__) {
    console.warn("[WRITING] script already loaded in this frame — skipping re-register.");
    return;
  }
  window.__SLGTTI_WRITING_LOADED__ = true;

  // -------- Constants --------
  const PROGRAMS = [
    { key: "AT",  label: "Automobile Technology" },
    { key: "CT",  label: "Construction Technology" },
    { key: "ET",  label: "Electrical Technology" },
    { key: "FT",  label: "Food Technology" },
    { key: "ICT", label: "Information and Communication Technology" },
    { key: "MT",  label: "Mechanical Technology" },
  ];
  const PROGRAM_LABEL_LOOKUP = PROGRAMS.reduce((acc, p) => (acc[p.key] = p.label, acc), {});
  const TEST_DURATION = 25 * 60 * 1000; // 25 minutes
  const SHEETS_URL = "https://script.google.com/macros/s/AKfycbxZKrhA-wXc_7ymR1wOwX-W_GzyMZwXqj3ORdvJ84QCibx2gt9_D5FvicLJdrXj36nJOQ/exec";

  // -------- State --------
  let questionsData = null;
  let selectedProgram = null;
  let activeTasks = { task1: null, task2: null };
  let startTimestamp = null;
  let timerInterval = null;
  let testCompleted = false;

  let isScormMode = false;
  let scorm = null;

  let userAnswers   = {}; // { [questionId]: "text/sentence" }
  let scrambleState = {}; // { [questionId]: [tokenIds...] }
  let scrambleTokens = {}; // { [questionId]: [{id,word}, ...] }

  // -------- DOM --------
  const elements = {};
  function cacheDomElements() {
    elements.timer            = document.getElementById("timer");
    elements.timerContainer   = document.getElementById("timer-container");
    elements.timeRemaining    = document.getElementById("time-remaining");
    elements.timerBar         = document.getElementById("timer-bar");
    elements.programBanner    = document.getElementById("program-banner");
    elements.programName      = document.getElementById("selected-program-name");
    elements.programOverlay   = document.getElementById("program-selection");
    elements.programSelect    = document.getElementById("programme-select");
    elements.startButton      = document.getElementById("start-test");
    elements.writingContent   = document.getElementById("writing-content");
    elements.actions          = document.getElementById("actions");
    elements.submitButton     = document.getElementById("submit-test");
    elements.task1Instruction = document.getElementById("task-1-instruction");
    elements.task1Example     = document.getElementById("task-1-example");
    elements.task1Grid        = document.getElementById("task-1-grid");
    elements.task1Responses   = document.getElementById("task-1-responses");
    elements.task2Instruction = document.getElementById("task-2-instruction");
    elements.task2Questions   = document.getElementById("task-2-questions");
  }

  function populateProgramOptions() {
    if (!elements.programSelect) return;
    PROGRAMS.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.key;
      opt.textContent = `${p.key} - ${p.label}`;
      elements.programSelect.appendChild(opt);
    });
  }

  function attachEventListeners() {
    if (elements.startButton) {
      elements.startButton.addEventListener("click", handleProgrammeStart, { once: true });
    }
    if (elements.submitButton) {
      // Single final submit — once is OK
      elements.submitButton.addEventListener("click", () => endTest(false), { once: true });
    }
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

    if (scormActive()) return true;                 // already inited
    if (initScormOnce.__running) return scormActive();
    initScormOnce.__running = true;

    const ok = scorm.init();                        // LMSInitialize
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

  // -------- Boot --------
  document.addEventListener("DOMContentLoaded", async () => {
    cacheDomElements();
    populateProgramOptions();
    attachEventListeners();
    await initializeScormFlow();

    // Idempotent terminate
    window.addEventListener("beforeunload", quitScormOnce, { once: true });
    window.addEventListener("unload",       quitScormOnce, { once: true });
  }, { once: true });

  // -------- Flow --------
  async function initializeScormFlow() {
    await loadQuestions();

    if (!initScormOnce()) {
      showProgrammeOverlay();
      return;
    }

    const lessonStatus = scorm.get("cmi.core.lesson_status");
    if (lessonStatus === "completed" || lessonStatus === "passed" || lessonStatus === "failed") {
      showCompletedState();
      return;
    }

    const sdataRaw = scorm.get("cmi.suspend_data");
    if (sdataRaw) {
      try {
        const saved = JSON.parse(sdataRaw);
        if (saved?.program && saved?.startTime) {
          // Time expiry check
          if (Date.now() - Number(saved.startTime) >= TEST_DURATION) {
            endTest(true);
            return;
          }
          restoreFromSavedState(saved);
          return;
        }
      } catch (e) {
        console.error("[WRITING] Error parsing saved state:", e);
      }
    }

    showProgrammeOverlay();
  }

  async function loadQuestions() {
    if (questionsData) return;
    try {
      const res = await fetch("questions.json");
      questionsData = await res.json();
    } catch (err) {
      console.error("Failed to load writing questions:", err);
      if (elements.writingContent) {
        elements.writingContent.innerHTML = '<p class="error">Unable to load writing questions. Please try again later.</p>';
      }
    }
  }

  function handleProgrammeStart() {
    const programmeKey = elements.programSelect ? elements.programSelect.value : "";
    if (!programmeKey) {
      showNotification("Please select your training programme before starting.", "error");
      return;
    }
    if (!questionsData || !questionsData[programmeKey]) {
      showNotification("No writing questions found for the selected programme.", "error");
      return;
    }

    selectedProgram = programmeKey;
    activeTasks = {
      task1: questionsData[programmeKey].question_1,
      task2: questionsData[programmeKey].question_2,
    };

    // Reset state
    userAnswers = {};
    scrambleState = {};
    scrambleTokens = {};
    testCompleted = false;
    startTimestamp = Date.now();

    prepareInterface();
    renderTaskOne();
    renderTaskTwo();
    restoreUserAnswers();   // applies any default (none on fresh start)
    startTimer();
    saveProgressToScormInitial();
  }

  function showProgrammeOverlay() { elements.programOverlay?.classList.remove("hidden"); }
  function hideProgrammeOverlay() { elements.programOverlay?.classList.add("hidden"); }

  function prepareInterface() {
    hideProgrammeOverlay();

    if (elements.programBanner && elements.programName) {
      const label = PROGRAM_LABEL_LOOKUP[selectedProgram] || selectedProgram;
      elements.programBanner.classList.remove("hidden");
      elements.programName.textContent = `${selectedProgram} — ${label}`;
    }

    elements.timer?.classList.remove("hidden");
    elements.timerContainer?.classList.remove("hidden");
    elements.writingContent?.classList.remove("hidden");
    elements.actions?.classList.remove("hidden");
  }

  // -------- Render: Task 1 --------
  function renderTaskOne() {
    const task = activeTasks.task1;
    if (!task) {
      if (elements.task1Instruction) elements.task1Instruction.textContent = "Questions unavailable.";
      return;
    }

    elements.task1Instruction.textContent = task.instruction || "";
    elements.task1Example.innerHTML = "";
    elements.task1Grid.innerHTML = "";
    elements.task1Responses.innerHTML = "";

    const questions = task.question || [];
    if (!questions.length) return;

    // Example (row 0)
    const exampleEntry = questions[0];
    const exampleSentence = exampleEntry?.answers ? exampleEntry.answers[0] : "";
    const ex = document.createElement("div");
    ex.className = "example-content";
    ex.innerHTML = `
      <div class="example-label">Example</div>
      <p class="example-sentence"><strong>${exampleSentence || ""}</strong></p>
    `;
    elements.task1Example.appendChild(ex);

    renderSentenceGrid(questions);
    renderResponseCards(questions.slice(1)); // skip example row
  }

  function renderSentenceGrid(entries) {
    const table = document.createElement("table");
    table.innerHTML = `
      <thead>
        <tr>
          <th>Name</th>
          <th>Place of work</th>
          <th>Mode of transport to work</th>
          <th>Lunch time</th>
          <th>Emotional state</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody");

    entries.forEach((entry, index) => {
      const row = document.createElement("tr");
      (entry.question || []).forEach((cellValue) => {
        const td = document.createElement("td");
        if (index === 0) {
          td.innerHTML = `<strong>${cellValue}</strong>`;
        } else {
          td.textContent = cellValue;
        }
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });

    elements.task1Grid.appendChild(table);
  }

  function renderResponseCards(entries) {
    elements.task1Responses.innerHTML = "";
    entries.forEach((entry, idx) => {
      const card = document.createElement("div");
      card.className = "response-card";

      const title = document.createElement("h3");
      const name = entry.question ? entry.question[0] : `Question ${idx + 1}`;
      title.textContent = `Write about ${name}`;

      const textarea = document.createElement("textarea");
      textarea.placeholder = "Write your sentences here...";
      textarea.value = userAnswers[entry.id] || "";
      textarea.dataset.questionId = entry.id;

      // Allow continuous editing (no { once:true })
      textarea.addEventListener("input", (e) => {
        userAnswers[entry.id] = e.target.value;
        saveProgressToScorm(); // commit frequently but small payloads
      });

      card.appendChild(title);
      card.appendChild(textarea);
      elements.task1Responses.appendChild(card);
    });
  }

  // -------- Render: Task 2 (scramble sentences) --------
  function renderTaskTwo() {
    const task = activeTasks.task2;
    if (!task) {
      if (elements.task2Instruction) elements.task2Instruction.textContent = "Questions unavailable.";
      return;
    }
    elements.task2Instruction.textContent = task.instruction || "";
    elements.task2Questions.innerHTML = "";

    (task.question || []).forEach((question, index) => {
      renderScrambleQuestion(question, index);
    });
  }

  function renderScrambleQuestion(question, index) {
    const container = document.createElement("div");
    container.className = "scramble-question";
    container.dataset.questionId = question.id;

    const header = document.createElement("div");
    header.className = "scramble-header";
    header.innerHTML = `<span>Sentence ${index + 1}</span><span>Tap words to build the sentence.</span>`;

    const wordBank = document.createElement("div");
    wordBank.className = "word-bank";
    wordBank.dataset.questionId = question.id;

    const sentenceZone = document.createElement("div");
    sentenceZone.className = "sentence-dropzone";
    sentenceZone.dataset.questionId = question.id;

    const tokens = (question.question || []).map((word, idx) => ({ id: `${question.id}-${idx}`, word }));
    scrambleTokens[question.id] = tokens;

    const order = scrambleState[question.id] || [];
    const placed = new Set(order);

    // Bank tokens first
    tokens.forEach(token => {
      if (!placed.has(token.id)) {
        const chip = createWordChip(question.id, token, "bank");
        wordBank.appendChild(chip);
      }
    });
    // Then placed tokens in sentence order
    order.forEach(tokenId => {
      const token = tokens.find(t => t.id === tokenId);
      if (token) {
        const chip = createWordChip(question.id, token, "sentence");
        sentenceZone.appendChild(chip);
      }
    });

    const footer = document.createElement("div");
    footer.className = "scramble-footer";
    footer.textContent = "Tip: Click a word to add or remove it. Build the sentence in the correct order.";

    container.appendChild(header);
    container.appendChild(wordBank);
    container.appendChild(sentenceZone);
    container.appendChild(footer);

    elements.task2Questions.appendChild(container);

    updateScrambleAnswer(question.id);
  }

  function createWordChip(questionId, token, location) {
    const chip = document.createElement("span");
    chip.className = "word-chip";
    chip.textContent = token.word;
    chip.draggable = false;
    chip.dataset.tokenId = token.id;
    chip.dataset.questionId = questionId;
    chip.dataset.location = location;
    if (location === "sentence") chip.classList.add("in-sentence");

    // Allow repeated toggles (no { once:true })
    chip.addEventListener("click", () => {
      handleWordChipToggle(questionId, token.id);
    });

    return chip;
  }

  function handleWordChipToggle(questionId, tokenId) {
    const container = elements.task2Questions.querySelector(`.scramble-question[data-question-id="${questionId}"]`);
    if (!container) return;

    const wordBank    = container.querySelector(".word-bank");
    const sentenceDia = container.querySelector(".sentence-dropzone");
    const chip = container.querySelector(`.word-chip[data-token-id="${tokenId}"]`);
    if (!chip) return;

    const loc = chip.dataset.location;
    if (loc === "bank") {
      chip.dataset.location = "sentence";
      chip.classList.add("in-sentence");
      sentenceDia.appendChild(chip);
    } else {
      chip.dataset.location = "bank";
      chip.classList.remove("in-sentence");
      wordBank.appendChild(chip);
    }

    updateScrambleOrder(questionId, container);
    updateScrambleAnswer(questionId);
    saveProgressToScorm();
  }

  function updateScrambleOrder(questionId, container) {
    const sentenceDia = container.querySelector(".sentence-dropzone");
    const chips = sentenceDia.querySelectorAll(".word-chip");
    const order = Array.from(chips).map(ch => ch.dataset.tokenId);
    scrambleState[questionId] = order;
  }

  function updateScrambleAnswer(questionId) {
    const tokens = scrambleTokens[questionId] || [];
    const order  = scrambleState[questionId] || [];
    const words = order
      .map(id => tokens.find(t => t.id === id))
      .filter(Boolean)
      .map(t => t.word);
    const sentence = formatSentence(words);
    if (sentence) userAnswers[questionId] = sentence;
    else delete userAnswers[questionId];
  }

  function formatSentence(words) {
    if (!words.length) return "";
    const joined = words.join(" ").trim();
    if (!joined) return "";
    const cap = joined.charAt(0).toUpperCase() + joined.slice(1);
    return cap.endsWith(".") ? cap : `${cap}.`;
    // (Scoring uses normalizeText to ignore punctuation/spacing)
  }

  // -------- Timer --------
  function startTimer() {
    if (!startTimestamp) startTimestamp = Date.now();
    updateTimerDisplay();
    timerInterval = setInterval(updateTimerDisplay, 1000);
  }

  function updateTimerDisplay() {
    if (!startTimestamp) return;

    const elapsed   = Date.now() - startTimestamp;
    const remaining = Math.max(0, TEST_DURATION - elapsed);

    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);

    if (elements.timeRemaining) {
      elements.timeRemaining.textContent = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    }

    if (elements.timerBar) {
      const pct = (remaining / TEST_DURATION) * 100;
      elements.timerBar.style.width = `${pct}%`;
      elements.timerBar.style.backgroundColor = pct < 25 ? "var(--danger-color)"
                                             : pct < 50 ? "var(--warning-color)"
                                                        : "var(--primary-color)";
    }

    if (remaining <= 0) endTest(true);
  }

  // -------- Finish --------
  function endTest(isTimeout) {
    if (testCompleted) return;
    testCompleted = true;

    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

    elements.writingContent?.classList.add("hidden");
    elements.actions?.classList.add("hidden");
    elements.timer?.classList.add("hidden");
    elements.timerContainer?.classList.add("hidden");
    elements.programBanner?.classList.add("hidden");
    document.querySelector(".instructions")?.classList.add("hidden");

    const totalQuestions = getTotalQuestionCount();
    const correctAnswers = calculateScore();
    const marksAwarded   = correctAnswers;
    const maxMarks       = totalQuestions;

    const spent = Math.min(Date.now() - startTimestamp, TEST_DURATION);
    const mm = Math.floor(spent / 60000);
    const ss = Math.floor((spent % 60000) / 1000);
    const timeDisplay = `${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
    const completionDate = new Date();
    const completionTime = completionDate.toLocaleString();
    const completionIso  = completionDate.toISOString();

    const div = document.createElement("div");
    div.className = "completion-message";
    div.innerHTML = `
      <div class="tick-icon"></div>
      <h2>Test Completed!</h2>
      <p class="completion-info">Writing Test Completed Successfully</p>
      <div class="score-display">${correctAnswers}/${totalQuestions}</div>
      <p class="time-spent">Time Spent: ${timeDisplay}</p>
      <p class="completion-time">Completed at: ${completionTime}</p>
      <p class="programme-info">Training Programme: ${formatProgrammeLabel(selectedProgram)}</p>
    `;
    document.querySelector(".container")?.appendChild(div);

    if (isScormMode && scormActive()) {
      scorm.set("cmi.core.score.raw", String(marksAwarded));
      scorm.set("cmi.core.score.min", "0");
      scorm.set("cmi.core.score.max", String(maxMarks));
      scorm.set("cmi.core.lesson_status", "completed");

      const completionData = {
        completedAt: completionIso,
        timeSpent: timeDisplay,
        program: selectedProgram,
        programLabel: formatProgrammeLabel(selectedProgram),
      };
      scorm.set("cmi.suspend_data", JSON.stringify(completionData));
      commitScorm();
    }

    sendToGoogleSheets(correctAnswers, marksAwarded, totalQuestions, maxMarks, timeDisplay, completionIso);
    showNotification(isTimeout ? "Time's up! Test submitted." : "Test completed successfully!");
  }

  function getTotalQuestionCount() {
    const task1Count = activeTasks.task1?.question ? Math.max(activeTasks.task1.question.length - 1, 0) : 0; // minus example
    const task2Count = activeTasks.task2?.question ? activeTasks.task2.question.length : 0;
    return task1Count + task2Count;
  }

  function calculateScore() {
    let score = 0;

    // Task 1: free responses matched against accepted answers
    if (activeTasks.task1?.question) {
      activeTasks.task1.question.slice(1).forEach(entry => {
        const expected = entry.answers || [];
        const userVal  = userAnswers[entry.id];
        if (!userVal) return;
        const normU = normalizeText(userVal);
        const ok = expected.some(ans => normalizeText(ans) === normU);
        if (ok) score += 1;
      });
    }

    // Task 2: scramble sentences (built sentence compared to accepted answers)
    if (activeTasks.task2?.question) {
      activeTasks.task2.question.forEach(entry => {
        const userVal = userAnswers[entry.id];
        if (!userVal) return;
        const normU = normalizeText(userVal);
        const possible = Array.isArray(entry.answers) ? entry.answers
                        : entry.answer ? [entry.answer] : [];
        const ok = possible.map(a => normalizeText(a)).some(a => a === normU);
        if (ok) score += 1;
      });
    }

    return score;
  }

  // -------- Sheets --------
  async function sendToGoogleSheets(correctAnswers, marks, totalQuestions, totalMarks, timeSpent, completionIso) {
    let studentName = "Anonymous";
    let studentId   = "";
    if (isScormMode && scormActive()) {
      studentName = scorm.get("cmi.core.student_name") || "Anonymous";
      studentId   = scorm.get("cmi.core.student_id")   || "";
    }

    const payload = {
      testType: "Writing Test",
      name: studentName,
      studentId,
      program: formatProgrammeLabel(selectedProgram),
      correctAnswers,
      marks,
      totalQuestions,
      totalMarks,
      timeSpent,
      date: completionIso,
      answers: buildAnswersSummary(),
    };

    try {
      await fetch(SHEETS_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.error("Failed to send writing results:", e);
    }
  }

  function buildAnswersSummary() {
    const out = [];

    if (activeTasks.task1?.question) {
      activeTasks.task1.question.slice(1).forEach(entry => {
        const userVal = userAnswers[entry.id] || "N/A";
        let outcome = "✗";
        if (userVal !== "N/A" && entry.answers?.length) {
          const normU = normalizeText(userVal);
          const ok = entry.answers.some(a => normalizeText(a) === normU);
          outcome = ok ? "✓" : "✗";
        }
        out.push(`${entry.id}: ${userVal} (${outcome})`);
      });
    }

    if (activeTasks.task2?.question) {
      activeTasks.task2.question.forEach(entry => {
        const userVal = userAnswers[entry.id] || "N/A";
        let outcome = "✗";
        if (userVal !== "N/A") {
          const normU = normalizeText(userVal);
          const possible = Array.isArray(entry.answers) ? entry.answers
                          : entry.answer ? [entry.answer] : [];
          if (normU && possible.length) {
            const match = possible.map(a => normalizeText(a)).some(a => a === normU);
            outcome = match ? "✓" : "✗";
          }
        }
        out.push(`${entry.id}: ${userVal} (${outcome})`);
      });
    }

    return out.join(", ");
  }

  // -------- SCORM state (resume) --------
  function saveProgressToScormInitial() {
    if (!isScormMode || !selectedProgram || !startTimestamp || !scormActive()) return;
    scorm.set("cmi.core.lesson_status", "incomplete");
    const state = {
      startTime: startTimestamp,
      program: selectedProgram,
      answers: {},
      scrambleState: {},
    };
    scorm.set("cmi.suspend_data", JSON.stringify(state));
    commitScorm();
  }

  function saveProgressToScorm() {
    if (!isScormMode || !selectedProgram || !startTimestamp || !scormActive()) return;
    const state = {
      startTime: startTimestamp,
      program: selectedProgram,
      answers: userAnswers,
      scrambleState,
    };
    try {
      scorm.set("cmi.suspend_data", JSON.stringify(state));
      commitScorm();
    } catch (e) {
      console.error("Failed to save progress to SCORM:", e);
    }
  }

  function restoreFromSavedState(saved) {
    selectedProgram = saved.program;

    if (!questionsData[selectedProgram]) {
      // Fallback if bank changed
      showProgrammeOverlay();
      return;
    }
    activeTasks = {
      task1: questionsData[selectedProgram].question_1,
      task2: questionsData[selectedProgram].question_2,
    };

    startTimestamp = parseInt(saved.startTime, 10);
    if (Number.isNaN(startTimestamp)) startTimestamp = Date.now();

    userAnswers    = saved.answers || {};
    scrambleState  = saved.scrambleState || {};
    scrambleTokens = {};
    testCompleted  = false;

    prepareInterface();
    renderTaskOne();
    renderTaskTwo();
    restoreUserAnswers();
    startTimer();
    updateTimerDisplay();
  }

  function restoreUserAnswers() {
    // Restore Task 1 textareas
    if (activeTasks.task1?.question) {
      activeTasks.task1.question.slice(1).forEach(entry => {
        const ta = elements.task1Responses.querySelector(`textarea[data-question-id="${entry.id}"]`);
        if (ta) ta.value = userAnswers[entry.id] || "";
      });
    }
    // Task 2 sentences already reconstructed by renderScrambleQuestion using scrambleState
    if (activeTasks.task2?.question) {
      activeTasks.task2.question.forEach(entry => {
        // Ensure userAnswers up-to-date from current scrambleState
        updateScrambleAnswer(entry.id);
      });
    }
  }

  // -------- Helpers --------
  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "") // drop punctuation
      .replace(/\s+/g, "")              // ignore spaces for flexible matching
      .trim();
  }

  function formatProgrammeLabel(key) {
    if (!key) return "Not selected";
    return `${key} — ${(PROGRAM_LABEL_LOOKUP[key] || key)}`;
  }

  function showNotification(message, type = "success") {
    const n = document.createElement("div");
    n.className = `notification ${type}`;
    n.innerHTML = `<i class="fas fa-check-circle"></i>${message}`;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 5000);
  }

  function showCompletedState() {
    const score = scorm.get("cmi.core.score.raw");
    const sdata = scorm.get("cmi.suspend_data");

    let completedAtText = "Unavailable";
    let timeSpentText   = "Unavailable";
    let programmeText   = "Unavailable";

    if (sdata) {
      try {
        const parsed = JSON.parse(sdata);
        if (parsed.completedAt) {
          const dt = new Date(parsed.completedAt);
          if (!Number.isNaN(dt.getTime())) completedAtText = dt.toLocaleString();
        }
        if (parsed.timeSpent)   timeSpentText = parsed.timeSpent;
        if (parsed.programLabel) programmeText = parsed.programLabel;
      } catch (e) {
        console.error("Failed to parse completion data:", e);
      }
    }

    const maxScore = scorm.get("cmi.core.score.max") || String(getTotalQuestionCount());
    const scoreDisplay = `${score}/${maxScore}`;

    document.body.innerHTML = `
      <div class="container">
        <div class="completion-message">
          <div class="tick-icon"></div>
          <h2>Test Already Completed</h2>
          <p class="completion-info">Writing Test was completed in a previous session</p>
          <div class="score-display">${scoreDisplay}</div>
          <p class="programme-info">Training Programme: ${programmeText}</p>
          <p class="time-spent">Time Spent: ${timeSpentText}</p>
          <p class="completion-time">Completed at: ${completedAtText}</p>
        </div>
      </div>
    `;
  }

})();
