/* ============================
   SLGTTI Listening Placement Test (SCORM 1.2)
   Idempotent + robust media/event handling
   ============================ */

// ----- Per-frame guard: never run this file twice in the same content iframe -----
if (window.__SLGTTI_LISTENING_LOADED__) {
  console.warn("[LISTENING] script already loaded in this frame — skipping re-register.");
} else {
  window.__SLGTTI_LISTENING_LOADED__ = true;

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
const TEST_DURATION = 20 * 60 * 1000; // 20 minutes

// ---------------- State ----------------
let questionsData = null;
let selectedProgram = null;
let selectedQuestions = { general: null, specific: null };
let startTimestamp = null;
let timerInterval = null;
let testCompleted = false;
let userAnswers = {};
let audioControllers = {};
let audioState = createDefaultAudioState();

// SCORM
let isScormMode = false;
let scorm = null;

// ---------------- DOM cache ----------------
const elements = {};
function cacheDomElements() {
  elements.timer           = document.getElementById("timer");
  elements.timerContainer  = document.getElementById("timer-container");
  elements.timeRemaining   = document.getElementById("time-remaining");
  elements.timerBar        = document.getElementById("timer-bar");
  elements.listeningContent= document.getElementById("listening-content");
  elements.actions         = document.getElementById("actions");
  elements.submitButton    = document.getElementById("submit-test");
  elements.programOverlay  = document.getElementById("program-selection");
  elements.programSelect   = document.getElementById("programme-select");
  elements.startButton     = document.getElementById("start-test");
  elements.programBanner   = document.getElementById("program-banner");
  elements.programName     = document.getElementById("selected-program-name");
  elements.generalQuestions= document.getElementById("general-questions");
  elements.specificQuestions= document.getElementById("specific-questions");
  elements.generalStatus   = document.getElementById("general-audio-status");
  elements.specificStatus  = document.getElementById("specific-audio-status");
  elements.generalSection  = document.getElementById("listening-general");
  elements.specificSection = document.getElementById("listening-specific");
}

// ---------------- Boot ----------------
document.addEventListener("DOMContentLoaded", async () => {
  cacheDomElements();
  populateProgramOptions();
  attachEventListeners();
  await initializeScormFlow();

  // Idempotent unload (we also add unload below)
  window.addEventListener("beforeunload", handleBeforeUnload, { once: true });
}, { once: true });

// ---------------- UI wiring ----------------
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
    // single start button click is fine to use once:true
    elements.startButton.addEventListener("click", handleProgrammeStart, { once: true });
  }
  if (elements.submitButton) {
    elements.submitButton.addEventListener("click", () => endTest(false), { once: true });
  }
}

// ---------------- SCORM init (guarded) ----------------
function scormActive() {
  return scorm && scorm.connection && scorm.connection.isActive;
}
function initScormOnce() {
  try {
    scorm = (window.pipwerks && window.pipwerks.SCORM) ? window.pipwerks.SCORM : null;
  } catch {
    scorm = null;
  }
  if (!scorm) return false;

  if (scormActive()) return true;            // already active
  if (initScormOnce.__running) return scormActive();
  initScormOnce.__running = true;

  const ok = scorm.init();                   // LMSInitialize
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

  // If completed already, show completion card
  const lessonStatus = scorm.get("cmi.core.lesson_status");
  if (lessonStatus === "completed" || lessonStatus === "passed" || lessonStatus === "failed") {
    showCompletedState();
    return;
  }

  // Try resume
  const suspendDataRaw = scorm.get("cmi.suspend_data");
  if (suspendDataRaw) {
    try {
      const saved = JSON.parse(suspendDataRaw);
      if (saved && saved.program && saved.startTime) {
        restoreFromSavedState(saved);
        return;
      }
    } catch (e) {
      console.error("Error parsing saved state:", e);
    }
  }

  // Else start fresh selection
  showProgrammeOverlay();
}

async function loadQuestions() {
  if (questionsData) return;
  try {
    const res = await fetch("questions.json");
    questionsData = await res.json();
  } catch (err) {
    console.error("Failed to load listening questions:", err);
    if (elements.listeningContent) {
      elements.listeningContent.innerHTML = '<p class="error">Unable to load listening questions. Please try again later.</p>';
    }
  }
}

function handleProgrammeStart() {
  const programmeKey = elements.programSelect ? elements.programSelect.value : "";
  if (!programmeKey) {
    showNotification("Please select your training programme before starting.", "error");
    return;
  }

  selectedProgram   = programmeKey;
  userAnswers       = {};
  audioControllers  = {};
  audioState        = createDefaultAudioState();
  selectedQuestions = selectQuestionSets(programmeKey);
  startTimestamp    = Date.now();
  testCompleted     = false;

  prepareInterface();
  renderQuestions();
  initialiseAudioControllers();
  restoreUserAnswers();
  startTimer();
  saveProgressToScorm();
}

function showProgrammeOverlay()  { elements.programOverlay?.classList.remove("hidden"); }
function hideProgrammeOverlay()  { elements.programOverlay?.classList.add("hidden"); }

function prepareInterface() {
  hideProgrammeOverlay();
  if (elements.programBanner && elements.programName) {
    elements.programBanner.classList.remove("hidden");
    const label = PROGRAM_LABEL_LOOKUP[selectedProgram] || selectedProgram;
    elements.programName.textContent = `${selectedProgram} - ${label}`;
  }
  elements.timer?.classList.remove("hidden");
  elements.timerContainer?.classList.remove("hidden");
  elements.listeningContent?.classList.remove("hidden");
  elements.actions?.classList.remove("hidden");
}

// ---------------- Selecting/rendering questions ----------------
function selectQuestionSets(programmeKey) {
  const result = { general: null, specific: null };
  if (!questionsData || !questionsData.General || !questionsData[programmeKey]) return result;

  const gKeys = Object.keys(questionsData.General);
  const sKeys = Object.keys(questionsData[programmeKey]);
  const gId   = gKeys[Math.floor(Math.random() * gKeys.length)];
  const sId   = sKeys[Math.floor(Math.random() * sKeys.length)];

  result.general  = normaliseQuestionSet(questionsData.General[gId], gId);
  result.specific = normaliseQuestionSet(questionsData[programmeKey][sId], sId);
  return result;
}

function normaliseQuestionSet(rawSet, id) {
  if (!rawSet) return null;
  return {
    id,
    audio: rawSet.audio,
    questions: (rawSet.question || []).map(item => ({
      id: item.id,
      question: item.question,
      options: [...(item.options || [])],
      answer: item.answer,
    })),
  };
}

function renderQuestions() {
  renderSection(selectedQuestions.general,  elements.generalQuestions);
  renderSection(selectedQuestions.specific, elements.specificQuestions);
}

function renderSection(sectionData, container) {
  if (!container) return;
  container.innerHTML = "";

  if (!sectionData || !sectionData.questions?.length) {
    container.innerHTML = '<p class="error">Questions unavailable for this section.</p>';
    return;
  }

  sectionData.questions.forEach((question, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "question-item";
    wrapper.dataset.questionId = question.id;

    const number = document.createElement("div");
    number.className = "question-number";
    number.textContent = index + 1;

    const content = document.createElement("div");
    content.className = "question-content";

    const questionText = document.createElement("p");
    questionText.className = "question-text";
    questionText.textContent = question.question;

    const optionsList = document.createElement("ul");
    optionsList.className = "options";

    question.options.forEach((option) => {
      const li = document.createElement("li");
      li.className = "option";
      li.dataset.value = option;
      li.textContent = option;

      // IMPORTANT: allow multiple clicks (change answers) -> NO {once:true}
      li.addEventListener("click", () => selectOption(question.id, option, li));
      optionsList.appendChild(li);
    });

    content.appendChild(questionText);
    content.appendChild(optionsList);
    wrapper.appendChild(number);
    wrapper.appendChild(content);
    container.appendChild(wrapper);
  });
}

function selectOption(questionId, optionValue, optionElement) {
  const item = optionElement.closest(".question-item");
  if (!item) return;

  item.querySelectorAll(".option").forEach(n => n.classList.remove("selected"));
  optionElement.classList.add("selected");

  userAnswers[questionId] = optionValue;
  saveProgressToScorm();
}

function restoreUserAnswers() {
  Object.keys(userAnswers).forEach((qid) => {
    const item = document.querySelector(`.question-item[data-question-id="${qid}"]`);
    if (!item) return;
    const saved = userAnswers[qid];
    const target = [...item.querySelectorAll(".option")].find(o => o.dataset.value === saved);
    if (target) target.classList.add("selected");
  });
}

// ---------------- Audio controllers ----------------
function initialiseAudioControllers() {
  audioControllers = {};
  if (selectedQuestions.general) {
    audioControllers.general = createAudioController("general",  selectedQuestions.general.audio,  audioState.general);
  }
  if (selectedQuestions.specific) {
    audioControllers.specific = createAudioController("specific", selectedQuestions.specific.audio, audioState.specific);
  }
  updateSectionAvailability();
}

function createAudioController(sectionKey, audioSrc, initialState = {}) {
  const button = document.querySelector(`.audio-play-button[data-section="${sectionKey}"]`);
  const statusElement = (sectionKey === "general") ? elements.generalStatus : elements.specificStatus;

  const controller = {
    key: sectionKey,
    audio: new Audio(audioSrc),
    button,
    label: button ? button.querySelector(".label") : null,
    status: statusElement,
    playsUsed: 0,
    awaitingSecondPlay: false,
    isPlaying: false,
  };

  controller.audio.preload = "auto";

  // IMPORTANT: these events must NOT be once:true — we need them for both plays
  controller.audio.addEventListener("play", () => {
    controller.isPlaying = true;
    if (controller.button) {
      controller.button.classList.add("playing");
      controller.button.disabled = true;
    }
    updateAudioStatus(controller, "Playing...");
  });

  controller.audio.addEventListener("ended", () => {
    controller.isPlaying = false;
    if (controller.button) {
      controller.button.classList.remove("playing");
      controller.button.disabled = false;
    }
    handleAudioEnded(controller);
    updateAudioStateFromController(controller);
    saveProgressToScorm();
    if (controller.key === "general") updateSectionAvailability();
  });

  controller.audio.addEventListener("error", (event) => {
    handlePlaybackFailure(controller, event, controller.playsUsed > 0 ? controller.playsUsed - 1 : 0);
    updateAudioStateFromController(controller);
    saveProgressToScorm();
    if (controller.key === "general") updateSectionAvailability();
  });

  if (controller.button) {
    // DO NOT use once:true — button must be clickable twice
    controller.button.addEventListener("click", () => handleAudioButtonClick(controller));
  }

  applyInitialAudioState(controller, initialState);
  updateAudioStateFromController(controller);
  return controller;
}

function handleAudioButtonClick(controller) {
  if (controller.isPlaying || controller.playsUsed >= 2) return;

  // Gate specific until general completed
  if (controller.key === "specific" &&
      audioControllers.general &&
      audioControllers.general.playsUsed < 2) {
    return;
  }
  if (controller.awaitingSecondPlay) controller.awaitingSecondPlay = false;
  startAudioPlayback(controller);
}

function startAudioPlayback(controller) {
  if (controller.playsUsed >= 2) return;

  const prevPlays = controller.playsUsed;
  controller.playsUsed += 1;

  if (controller.button) {
    controller.button.disabled = true;
    controller.button.classList.remove("completed");
    if (controller.label) {
      controller.label.textContent = (controller.playsUsed === 1)
        ? "Playing (First Time)" : "Playing (Second Time)";
    }
  }

  updateAudioStatus(controller);

  try {
    controller.audio.currentTime = 0;
    const p = controller.audio.play();
    if (p && typeof p.catch === "function") {
      p.catch(err => handlePlaybackFailure(controller, err, prevPlays));
    }
  } catch (err) {
    handlePlaybackFailure(controller, err, prevPlays);
    return;
  }

  updateAudioStateFromController(controller);
  saveProgressToScorm();
}

function handlePlaybackFailure(controller, error, previousPlays) {
  console.error("Audio playback failed:", error);
  controller.isPlaying = false;
  controller.playsUsed = previousPlays;

  if (previousPlays === 1) controller.awaitingSecondPlay = true;

  if (controller.button) {
    controller.button.disabled = false;
    controller.button.classList.remove("playing");
    if (controller.label) {
      controller.label.textContent = (controller.playsUsed === 0) ? "Play Recording" : "Play Second Time";
    }
  }

  const statusMessage = (previousPlays === 1)
    ? "Second play ready. Tap to play the final time."
    : "Playback failed. Please try again.";

  updateAudioStatus(controller, statusMessage);
}

function handleAudioEnded(controller) {
  if (controller.playsUsed === 1) {
    controller.awaitingSecondPlay = true;
    if (controller.button) {
      controller.button.disabled = false;
      if (controller.label) controller.label.textContent = "Play Second Time";
    }
    updateAudioStatus(controller, "Second play ready. Tap to play the final time.");
  } else if (controller.playsUsed >= 2) {
    finaliseAudioPlayback(controller);
  }
}

function finaliseAudioPlayback(controller) {
  controller.awaitingSecondPlay = false;
  if (controller.button) {
    controller.button.disabled = true;
    controller.button.classList.add("completed");
    if (controller.label) controller.label.textContent = "Playback Completed";
  }
  updateAudioStatus(controller, "Playback completed. You have used both plays.");
  if (controller.key === "general") updateSectionAvailability();
}

function updateAudioStatus(controller, overrideText) {
  if (!controller.status) return;
  if (overrideText) { controller.status.textContent = overrideText; return; }
  if (controller.isPlaying) { controller.status.textContent = "Playing..."; return; }
  if (controller.playsUsed >= 2) { controller.status.textContent = "Playback completed."; return; }
  if (controller.awaitingSecondPlay) { controller.status.textContent = "Second play ready."; return; }
  const remaining = 2 - controller.playsUsed;
  controller.status.textContent = `Plays remaining: ${remaining}`;
}

function updateSectionAvailability() {
  const sCtrl = audioControllers.specific;
  const gCtrl = audioControllers.general;
  const generalComplete = !gCtrl || gCtrl.playsUsed >= 2;
  const lockSpecific = !generalComplete;

  elements.specificSection?.classList.toggle("locked", lockSpecific);

  if (sCtrl?.button) {
    const isSpecificDone = sCtrl.playsUsed >= 2;
    const disable = lockSpecific || isSpecificDone;
    sCtrl.button.disabled = disable;
    sCtrl.button.setAttribute("aria-disabled", String(disable));
  }
  if (sCtrl?.status) {
    if (lockSpecific) {
      sCtrl.status.textContent = "Complete Listening 1 to unlock.";
    } else if (!sCtrl.isPlaying) {
      updateAudioStatus(sCtrl);
    }
  }
}

function applyInitialAudioState(controller, initialState) {
  controller.playsUsed = (initialState && initialState.playsUsed) ? initialState.playsUsed : 0;
  controller.awaitingSecondPlay = !!(initialState && initialState.awaitingSecondPlay && controller.playsUsed < 2);

  if (controller.playsUsed >= 2) {
    controller.playsUsed = 2;
    finaliseAudioPlayback(controller);
    return;
  }
  if (controller.awaitingSecondPlay) {
    if (controller.button) {
      controller.button.disabled = false;
      if (controller.label) controller.label.textContent = "Play Second Time";
    }
    updateAudioStatus(controller, "Second play ready. Tap to play the final time.");
    return;
  }
  if (controller.button) {
    controller.button.disabled = false;
    if (controller.label) {
      controller.label.textContent = (controller.playsUsed === 0) ? "Play Recording" : "Play Second Time";
    }
  }
  updateAudioStatus(controller);
}

function updateAudioStateFromController(controller) {
  audioState[controller.key] = {
    playsUsed: controller.playsUsed,
    awaitingSecondPlay: controller.awaitingSecondPlay && controller.playsUsed < 2,
  };
}

function createDefaultAudioState() {
  return {
    general:  { playsUsed: 0, awaitingSecondPlay: false },
    specific: { playsUsed: 0, awaitingSecondPlay: false },
  };
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

  if (elements.timeRemaining) {
    elements.timeRemaining.textContent = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }
  const pct = (remaining / TEST_DURATION) * 100;
  if (elements.timerBar) {
    elements.timerBar.style.width = `${pct}%`;
    elements.timerBar.style.backgroundColor = pct < 25 ? "var(--danger-color)" :
                                              pct < 50 ? "var(--warning-color)" :
                                                         "var(--primary-color)";
  }
  if (remaining <= 0) endTest(true);
}

// ---------------- Finish ----------------
function endTest(isTimeout) {
  if (testCompleted) return;
  testCompleted = true;

  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

  // Stop media and disable buttons
  Object.values(audioControllers).forEach(c => {
    if (!c) return;
    try { c.audio?.pause(); } catch {}
    if (c.button) c.button.disabled = true;
  });

  // Hide working UI
  elements.listeningContent?.classList.add("hidden");
  elements.actions?.classList.add("hidden");
  elements.timer?.classList.add("hidden");
  elements.timerContainer?.classList.add("hidden");
  elements.programBanner?.classList.add("hidden");
  document.querySelector(".instructions")?.classList.add("hidden");

  const totalQuestions = getTotalQuestionCount();
  const correctAnswers = calculateScore();
  const marksAwarded = correctAnswers;
  const maxMarks = totalQuestions;

  const spentMs = Math.min(Date.now() - startTimestamp, TEST_DURATION);
  const m = Math.floor(spentMs / 60000);
  const s = Math.floor((spentMs % 60000) / 1000);
  const timeDisplay = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  const completionDate = new Date();
  const completionTime = completionDate.toLocaleString();
  const completionIso  = completionDate.toISOString();

  const div = document.createElement("div");
  div.className = "completion-message";
  div.innerHTML = `
    <div class="tick-icon"></div>
    <h2>Test Completed!</h2>
    <p class="completion-info">Listening Test Completed Successfully</p>
    <div class="score-display">${correctAnswers}/${totalQuestions}</div>
    <p class="time-spent">Time Spent: ${timeDisplay}</p>
    <p class="completion-time">Completed at: ${completionTime}</p>
    <p class="programme-info">Training Programme: ${formatProgrammeLabel(selectedProgram)}</p>
  `;
  document.querySelector(".container")?.appendChild(div);

  // SCORM submit
  if (isScormMode && scormActive()) {
    scorm.set("cmi.core.score.raw", String(marksAwarded));
    scorm.set("cmi.core.score.min", "0");
    scorm.set("cmi.core.score.max", String(maxMarks));
    scorm.set("cmi.core.lesson_status", "completed");

    const completionData = {
      completedAt: completionIso,
      timeSpent:   timeDisplay,
      program:     selectedProgram,
      programLabel: formatProgrammeLabel(selectedProgram),
      audioUsage: {
        general:  audioControllers.general  ? audioControllers.general.playsUsed  : 0,
        specific: audioControllers.specific ? audioControllers.specific.playsUsed : 0,
      },
    };
    scorm.set("cmi.suspend_data", JSON.stringify(completionData));
    commitScorm();
  }

  // Sheets
  sendToGoogleSheets(
    correctAnswers, marksAwarded, totalQuestions, maxMarks, timeDisplay, completionIso
  );

  showNotification(isTimeout ? "Time's up! Test submitted." : "Test completed successfully!");
}

function getTotalQuestionCount() {
  const g = selectedQuestions.general  ? selectedQuestions.general.questions.length  : 0;
  const s = selectedQuestions.specific ? selectedQuestions.specific.questions.length : 0;
  return g + s;
}

function calculateScore() {
  let score = 0;
  const evalSec = (sec) => {
    if (!sec?.questions) return;
    sec.questions.forEach(q => {
      const ua = userAnswers[q.id];
      if (ua && ua === q.answer) score += 1;
    });
  };
  evalSec(selectedQuestions.general);
  evalSec(selectedQuestions.specific);
  return score;
}

// ---------------- Sheets ----------------
async function sendToGoogleSheets(correctAnswers, marks, totalQuestions, totalMarks, timeSpent, completionIso) {
  const SHEETS_URL = "https://script.google.com/macros/s/AKfycbxZKrhA-wXc_7ymR1wOwX-W_GzyMZwXqj3ORdvJ84QCibx2gt9_D5FvicLJdrXj36nJOQ/exec";
  let studentName = "Anonymous";
  let studentId   = "";
  if (isScormMode && scormActive()) {
    studentName = scorm.get("cmi.core.student_name") || "Anonymous";
    studentId   = scorm.get("cmi.core.student_id")   || "";
  }

  const payload = {
    testType: "Listening Test",
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
    audioUsage: buildAudioSummary(),
  };

  try {
    await fetch(SHEETS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("Failed to send listening results:", error);
  }
}

function buildAnswersSummary() {
  const entries = [];
  const collect = (sec) => {
    if (!sec?.questions) return;
    sec.questions.forEach(q => {
      const ua = userAnswers[q.id] || "N/A";
      const ok = ua === q.answer ? "✓" : "✗";
      entries.push(`${q.id}: ${ua} (${ok})`);
    });
  };
  collect(selectedQuestions.general);
  collect(selectedQuestions.specific);
  return entries.join(", ");
}

function buildAudioSummary() {
  const gp = audioControllers.general  ? audioControllers.general.playsUsed  : 0;
  const sp = audioControllers.specific ? audioControllers.specific.playsUsed : 0;
  return `Listening 1 plays: ${gp}/2, Listening 2 plays: ${sp}/2`;
}

// ---------------- SCORM state (resume) ----------------
function saveProgressToScorm() {
  if (!isScormMode || !selectedProgram || !startTimestamp || !scormActive()) return;
  const state = {
    startTime: startTimestamp,
    program: selectedProgram,
    generalSetId:  selectedQuestions.general  ? selectedQuestions.general.id  : null,
    specificSetId: selectedQuestions.specific ? selectedQuestions.specific.id : null,
    answers: userAnswers,
    audioState,
  };
  try {
    scorm.set("cmi.suspend_data", JSON.stringify(state));
    commitScorm();
  } catch (error) {
    console.error("Failed to save progress to SCORM:", error);
  }
}

function restoreFromSavedState(saved) {
  selectedProgram = saved.program;
  startTimestamp  = parseInt(saved.startTime, 10);
  if (Number.isNaN(startTimestamp)) startTimestamp = Date.now();

  userAnswers = saved.answers || {};
  audioState = {
    general:  saved.audioState?.general  ?? { playsUsed: 0, awaitingSecondPlay: false },
    specific: saved.audioState?.specific ?? { playsUsed: 0, awaitingSecondPlay: false },
  };

  selectedQuestions = {
    general:  normaliseQuestionSet(questionsData.General[saved.generalSetId], saved.generalSetId),
    specific: normaliseQuestionSet(questionsData[selectedProgram]?.[saved.specificSetId], saved.specificSetId),
  };

  // If referenced sets missing (bank changed), re-roll fresh
  if (!selectedQuestions.general || !selectedQuestions.specific) {
    selectedQuestions = selectQuestionSets(selectedProgram);
    startTimestamp = Date.now();
    userAnswers = {};
    audioState = createDefaultAudioState();
  }

  testCompleted = false;
  prepareInterface();
  renderQuestions();
  initialiseAudioControllers();
  restoreUserAnswers();
  startTimer();
  updateTimerDisplay();
}

function showCompletedState() {
  const score = scorm.get("cmi.core.score.raw");
  const maxScore = scorm.get("cmi.core.score.max") || "20";
  const suspendData = scorm.get("cmi.suspend_data");

  let completedAtText = "Unavailable";
  let timeSpentText   = "Unavailable";
  let programmeText   = "Unavailable";

  if (suspendData) {
    try {
      const parsed = JSON.parse(suspendData);
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

  document.body.innerHTML = `
    <div class="container">
      <div class="completion-message">
        <div class="tick-icon"></div>
        <h2>Test Already Completed</h2>
        <p class="completion-info">Listening Test was completed in a previous session</p>
        <div class="score-display">${score}/${maxScore}</div>
        <p class="programme-info">Training Programme: ${programmeText}</p>
        <p class="time-spent">Time Spent: ${timeSpentText}</p>
        <p class="completion-time">Completed at: ${completedAtText}</p>
      </div>
    </div>
  `;
}

// ---------------- Helpers ----------------
function formatProgrammeLabel(key) {
  if (!key) return "Not selected";
  return `${key} - ${(PROGRAM_LABEL_LOOKUP[key] || key)}`;
}

function showNotification(message, type = "success") {
  const n = document.createElement("div");
  n.className = `notification ${type}`;
  n.innerHTML = `<i class="fas fa-check-circle"></i>${message}`;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 5000);
}

function handleBeforeUnload() {
  quitScormOnce();
}
// Add unload too, some browsers only fire one of them
window.addEventListener("unload", handleBeforeUnload, { once: true });

} // end per-frame guard
