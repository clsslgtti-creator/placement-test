/* ============================
   SLGTTI Vocabulary Test (SCORM 1.2)
   Idempotent, resume-capable, safe lifecycle
   ============================ */

// ----- Per-frame guard: never run this file twice in the same content iframe -----
if (window.__SLGTTI_VOCAB_LOADED__) {
  console.warn("[VOCAB] script already loaded in this frame — skipping re-register.");
} else {
  window.__SLGTTI_VOCAB_LOADED__ = true;

// ---------------- Constants ----------------
const PROGRAMS = [
  { key: "AT",  label: "Automobile Technology" },
  { key: "CT",  label: "Construction Technology" },
  { key: "ET",  label: "Electrical Technology" },
  { key: "FT",  label: "Food Technology" },
  { key: "ICT", label: "Information and Communication Technology" },
  { key: "MT",  label: "Mechanical Technology" },
];

const PROGRAM_LABEL_LOOKUP = PROGRAMS.reduce((acc, p) => (acc[p.key] = p.label, acc), {});
const TEST_DURATION = 5 * 60 * 1000; // 5 minutes
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbxZKrhA-wXc_7ymR1wOwX-W_GzyMZwXqj3ORdvJ84QCibx2gt9_D5FvicLJdrXj36nJOQ/exec";

// ---------------- State ----------------
let questionsData = null;
let selectedProgram = null;
let selectedSetKey = null;
let selectedQuestions = [];
let startTimestamp = null;
let timerInterval = null;
let testCompleted = false;

let isScormMode = false;
let scorm = null;

let userAnswers = {};       // { [questionId]: "word" }
let matchAssignments = {};  // { [questionId]: tokenId|null }
let tokenAssignments = {};  // { [tokenId]: questionId }
let tokens = [];            // [{ id, word }]
let tokenMap = {};          // tokenId -> token
let tokenElements = {};     // tokenId -> element
let selectedTokenId = null;

const elements = {};

// ---------------- Boot ----------------
document.addEventListener("DOMContentLoaded", async () => {
  cacheDomElements();
  populateProgramOptions();
  attachEventListeners();
  await initializeScormFlow();

  // Idempotent terminate
  window.addEventListener("beforeunload", quitScormOnce, { once: true });
  window.addEventListener("unload",       quitScormOnce, { once: true });
}, { once: true });

// ---------------- DOM cache ----------------
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
  elements.vocabularyContent= document.getElementById("vocabulary-content");
  elements.wordBank         = document.getElementById("word-bank");
  elements.matchingGrid     = document.getElementById("matching-grid");
  elements.actions          = document.getElementById("actions");
  elements.submitButton     = document.getElementById("submit-test");
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
    elements.submitButton.addEventListener("click", () => endTest(false), { once: true });
  }
}

// ---------------- SCORM guards ----------------
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

// ---------------- Flow ----------------
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

  const suspendData = scorm.get("cmi.suspend_data");
  if (suspendData) {
    try {
      const saved = JSON.parse(suspendData);
      if (saved && saved.program && saved.startTime) {
        restoreFromSavedState(saved);
        return;
      }
    } catch (e) {
      console.error("Error parsing saved state:", e);
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
    console.error("Failed to load vocabulary questions:", err);
    if (elements.vocabularyContent) {
      elements.vocabularyContent.innerHTML = '<p class="error">Unable to load vocabulary questions. Please try again later.</p>';
    }
  }
}

function handleProgrammeStart() {
  const programmeKey = elements.programSelect ? elements.programSelect.value : "";
  if (!programmeKey) {
    showNotification("Please select your training programme before starting.", "error");
    return;
  }

  const programmeSets = questionsData ? questionsData[programmeKey] : null;
  if (!programmeSets) {
    showNotification("No vocabulary questions found for the selected programme.", "error");
    return;
  }

  const setKeys = Object.keys(programmeSets);
  if (!setKeys.length) {
    showNotification("No vocabulary question sets available.", "error");
    return;
  }

  selectedProgram = programmeKey;
  selectedSetKey  = setKeys[Math.floor(Math.random() * setKeys.length)];
  selectedQuestions = JSON.parse(JSON.stringify(programmeSets[selectedSetKey] || []));

  // Reset state
  startTimestamp = Date.now();
  testCompleted  = false;
  userAnswers = {};
  matchAssignments = {};
  tokenAssignments = {};
  tokens = [];
  tokenMap = {};
  tokenElements = {};
  selectedTokenId = null;

  prepareInterface();
  renderVocabularyTask();
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
  elements.vocabularyContent?.classList.remove("hidden");
  elements.actions?.classList.remove("hidden");
}

// ---------------- Render task ----------------
function renderVocabularyTask() {
  if (!elements.wordBank || !elements.matchingGrid) return;

  elements.wordBank.innerHTML = "";
  elements.matchingGrid.innerHTML = "";
  tokens = [];
  tokenMap = {};
  tokenElements = {};
  tokenAssignments = {};

  // Build tokens from answers
  selectedQuestions.forEach((entry, idx) => {
    const tokenId = `token_${idx}`;
    const token = { id: tokenId, word: entry.answer };
    tokens.push(token);
    tokenMap[tokenId] = token;
    if (!(entry.id in matchAssignments)) matchAssignments[entry.id] = null;
  });

  // Word bank
  shuffleArray([...tokens]).forEach(token => {
    const chip = createWordChip(token, "bank");
    tokenElements[token.id] = chip;
    elements.wordBank.appendChild(chip);
  });

  // Cards / dropzones
  selectedQuestions.forEach(entry => {
    const card = document.createElement("div");
    card.className = "match-card";
    card.dataset.questionId = entry.id;

    const definition = document.createElement("div");
    definition.className = "definition";
    definition.textContent = entry.question;

    const dropzone = document.createElement("div");
    dropzone.className = "match-dropzone";
    dropzone.dataset.questionId = entry.id;
    // Allow multiple interactions -> NO { once:true }
    dropzone.addEventListener("click", () => handleDropZoneClick(entry.id));

    const placeholder = document.createElement("span");
    placeholder.className = "dropzone-placeholder";
    placeholder.textContent = "Tap to place word";
    dropzone.appendChild(placeholder);

    card.appendChild(definition);
    card.appendChild(dropzone);
    elements.matchingGrid.appendChild(card);
  });

  // Re-apply any existing assignments (resume)
  Object.entries(matchAssignments).forEach(([questionId, tokenId]) => {
    if (tokenId && tokenElements[tokenId]) {
      assignTokenToQuestion(tokenId, questionId, { suppressSelection: true });
    }
  });
}

function createWordChip(token, location) {
  const chip = document.createElement("span");
  chip.className = "word-chip";
  chip.textContent = token.word;
  chip.dataset.tokenId = token.id;
  chip.dataset.location = location;

  // Allow re-clicks -> NO { once:true }
  chip.addEventListener("click", () => handleChipClick(token.id));
  return chip;
}

// ---------------- Interactions ----------------
function handleChipClick(tokenId) {
  const chip = tokenElements[tokenId];
  if (!chip) return;

  const location = chip.dataset.location;
  if (location === "bank") {
    if (selectedTokenId === tokenId) {
      selectedTokenId = null;
      chip.classList.remove("selected");
      return;
    }
    clearSelection();
    selectedTokenId = tokenId;
    chip.classList.add("selected");
  } else if (location === "dropzone") {
    const assignedQuestionId = tokenAssignments[tokenId];
    if (assignedQuestionId) removeAssignment(assignedQuestionId, { selectToken: true });
  }
}

function handleDropZoneClick(questionId) {
  if (selectedTokenId) {
    assignTokenToQuestion(selectedTokenId, questionId);
    return;
  }

  if (matchAssignments[questionId]) {
    removeAssignment(questionId, { selectToken: false });
    return;
  }

  flashDropzone(questionId);
}

function assignTokenToQuestion(tokenId, questionId, options = {}) {
  const token = tokenMap[tokenId];
  const chip = tokenElements[tokenId];
  const dropzone = elements.matchingGrid.querySelector(`.match-dropzone[data-question-id="${questionId}"]`);
  if (!token || !chip || !dropzone) return;

  if (matchAssignments[questionId] === tokenId) return;

  // Remove existing assignment on this question
  removeAssignment(questionId, { skipSelectionClear: true });

  // If token already placed elsewhere, free it
  const existingQuestion = tokenAssignments[tokenId];
  if (existingQuestion) removeAssignment(existingQuestion, { skipSelectionClear: true });

  dropzone.innerHTML = "";
  chip.classList.add("assigned");
  chip.classList.remove("selected");
  chip.dataset.location = "dropzone";
  dropzone.appendChild(chip);

  matchAssignments[questionId] = tokenId;
  tokenAssignments[tokenId] = questionId;
  userAnswers[questionId] = token.word;

  if (!options.suppressSelection) selectedTokenId = null;
  clearSelection();
  saveProgressToScorm();
}

function removeAssignment(questionId, options = {}) {
  const tokenId = matchAssignments[questionId];
  if (!tokenId) return;

  const chip = tokenElements[tokenId];
  if (!chip) return;

  const dropzone = elements.matchingGrid.querySelector(`.match-dropzone[data-question-id="${questionId}"]`);
  if (dropzone) {
    dropzone.innerHTML = "";
    const ph = document.createElement("span");
    ph.className = "dropzone-placeholder";
    ph.textContent = "Tap to place word";
    dropzone.appendChild(ph);
  }

  chip.dataset.location = "bank";
  chip.classList.remove("assigned");
  if (!options.skipSelectionClear) chip.classList.remove("selected");
  elements.wordBank.appendChild(chip);

  matchAssignments[questionId] = null;
  delete tokenAssignments[tokenId];
  delete userAnswers[questionId];

  if (options.selectToken) {
    clearSelection();
    selectedTokenId = tokenId;
    chip.classList.add("selected");
  } else if (!options.skipSelectionClear) {
    clearSelection();
  }

  saveProgressToScorm();
}

function clearSelection() {
  Object.values(tokenElements).forEach(chip => chip.classList.remove("selected"));
  selectedTokenId = null;
}

function flashDropzone(questionId) {
  const dropzone = elements.matchingGrid.querySelector(`.match-dropzone[data-question-id="${questionId}"]`);
  if (!dropzone) return;
  dropzone.classList.add("active");
  setTimeout(() => dropzone.classList.remove("active"), 400);
}

// ---------------- Timer ----------------
function startTimer() {
  if (!startTimestamp) startTimestamp = Date.now();
  updateTimerDisplay();
  timerInterval = setInterval(updateTimerDisplay, 1000);
}

function updateTimerDisplay() {
  if (!startTimestamp) return;

  const elapsed = Date.now() - startTimestamp;
  const remaining = Math.max(0, TEST_DURATION - elapsed);

  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  elements.timeRemaining && (elements.timeRemaining.textContent = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`);

  if (elements.timerBar) {
    const pct = (remaining / TEST_DURATION) * 100;
    elements.timerBar.style.width = `${pct}%`;
    elements.timerBar.style.backgroundColor = pct < 25 ? "var(--danger-color)"
                                           : pct < 50 ? "var(--warning-color)"
                                                      : "var(--primary-color)";
  }

  if (remaining <= 0) endTest(true);
}

// ---------------- Finish ----------------
function endTest(isTimeout) {
  if (testCompleted) return;
  testCompleted = true;

  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

  elements.vocabularyContent?.classList.add("hidden");
  elements.actions?.classList.add("hidden");
  elements.timer?.classList.add("hidden");
  elements.timerContainer?.classList.add("hidden");
  elements.programBanner?.classList.add("hidden");
  document.querySelector(".instructions")?.classList.add("hidden");

  const correctAnswers = calculateScore();
  const totalQuestions = getTotalQuestionCount();
  const marksAwarded = correctAnswers;
  const maxMarks = totalQuestions;

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
    <p class="completion-info">Vocabulary Test Completed Successfully</p>
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

function getTotalQuestionCount() { return selectedQuestions.length; }

function calculateScore() {
  let score = 0;
  selectedQuestions.forEach(entry => {
    const userValue = userAnswers[entry.id];
    if (!userValue) return;
    const u = normalizeText(userValue);
    const a = normalizeText(entry.answer || "");
    if (u && u === a) score += 1;
  });
  return score;
}

// ---------------- Sheets ----------------
async function sendToGoogleSheets(correctAnswers, marks, totalQuestions, totalMarks, timeSpent, completionIso) {
  let studentName = "Anonymous";
  let studentId   = "";
  if (isScormMode && scormActive()) {
    studentName = scorm.get("cmi.core.student_name") || "Anonymous";
    studentId   = scorm.get("cmi.core.student_id")   || "";
  }

  const payload = {
    testType: "Vocabulary Test",
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
    console.error("Failed to send vocabulary results:", e);
  }
}

function buildAnswersSummary() {
  const entries = [];
  selectedQuestions.forEach(entry => {
    const userValue = userAnswers[entry.id] || "N/A";
    let outcome = "—";
    if (userValue !== "N/A") {
      const u = normalizeText(userValue);
      const a = normalizeText(entry.answer || "");
      if (u && a) outcome = (u === a) ? "✓" : "✗";
    }
    entries.push(`${entry.id}: ${userValue} (${outcome})`);
  });
  return entries.join(", ");
}

// ---------------- SCORM state (resume) ----------------
function saveProgressToScormInitial() {
  if (!isScormMode || !selectedProgram || !startTimestamp || !scormActive()) return;
  scorm.set("cmi.core.lesson_status", "incomplete");
  const state = {
    startTime: startTimestamp,
    program: selectedProgram,
    setKey: selectedSetKey,
    answers: {},
    matchAssignments: {},
  };
  scorm.set("cmi.suspend_data", JSON.stringify(state));
  commitScorm();
}

function saveProgressToScorm() {
  if (!isScormMode || !selectedProgram || !startTimestamp || !scormActive()) return;
  const state = {
    startTime: startTimestamp,
    program: selectedProgram,
    setKey: selectedSetKey,
    answers: userAnswers,
    matchAssignments,
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
  const programmeSets = questionsData[selectedProgram] || {};
  selectedSetKey = (saved.setKey && programmeSets[saved.setKey]) ? saved.setKey : Object.keys(programmeSets)[0];

  selectedQuestions = JSON.parse(JSON.stringify(programmeSets[selectedSetKey] || []));
  startTimestamp = parseInt(saved.startTime, 10);
  if (Number.isNaN(startTimestamp)) startTimestamp = Date.now();

  userAnswers = saved.answers || {};
  matchAssignments = saved.matchAssignments || {};
  tokenAssignments = {};
  tokens = [];
  tokenMap = {};
  tokenElements = {};
  selectedTokenId = null;
  testCompleted = false;

  prepareInterface();
  renderVocabularyTask();
  startTimer();
  updateTimerDisplay();
}

// ---------------- Helpers ----------------
function normalizeText(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatProgrammeLabel(key) {
  if (!key) return "Not selected";
  return `${key} — ${(PROGRAM_LABEL_LOOKUP[key] || key)}`;
}

function showProgrammeOverlay() { elements.programOverlay?.classList.remove("hidden"); }
function hideProgrammeOverlay() { elements.programOverlay?.classList.add("hidden"); }

function showCompletedState() {
  const score = scorm.get("cmi.core.score.raw");
  const maxScore = scorm.get("cmi.core.score.max") || "5";
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
      if (parsed.timeSpent)  timeSpentText = parsed.timeSpent;
      if (parsed.programLabel) programmeText = parsed.programLabel;
    } catch (e) {
      console.error("Failed to parse completion data:", e);
    }
  }

  document.body.innerHTML = `
    <div class="container">
      <div class="completion-message">
        <div class="tick-icon"></div>
        <h2>Test Already Completed</h2>
        <p class="completion-info">Vocabulary Test was completed in a previous session</p>
        <div class="score-display">${score}/${maxScore}</div>
        <p class="programme-info">Training Programme: ${programmeText}</p>
        <p class="time-spent">Time Spent: ${timeSpentText}</p>
        <p class="completion-time">Completed at: ${completedAtText}</p>
      </div>
    </div>
  `;
}

function showNotification(message, type = "success") {
  const n = document.createElement("div");
  n.className = `notification ${type}`;
  n.innerHTML = `<i class="fas fa-check-circle"></i>${message}`;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 5000);
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

} // end per-frame guard
