// Vocabulary placement test script
const PROGRAMS = [
  { key: "AT", label: "Automobile Technology" },
  { key: "CT", label: "Construction Technology" },
  { key: "ET", label: "Electrical Technology" },
  { key: "FT", label: "Food Technology" },
  { key: "ICT", label: "Information and Communication Technology" },
  { key: "MT", label: "Mechanical Technology" }
];

const PROGRAM_LABEL_LOOKUP = PROGRAMS.reduce((acc, programme) => {
  acc[programme.key] = programme.label;
  return acc;
}, {});

const TEST_DURATION = 5 * 60 * 1000; // 5 minutes

let questionsData = null;
let selectedProgram = null;
let selectedSetKey = null;
let selectedQuestions = [];
let startTimestamp = null;
let timerInterval = null;
let testCompleted = false;
let isScormMode = false;
let scorm = null;

let userAnswers = {};
let matchAssignments = {};
let tokenAssignments = {};
let tokens = [];
let tokenMap = {};
let tokenElements = {};
let selectedTokenId = null;

const elements = {};

const SHEETS_URL =
  "https://script.google.com/macros/s/AKfycbxZKrhA-wXc_7ymR1wOwX-W_GzyMZwXqj3ORdvJ84QCibx2gt9_D5FvicLJdrXj36nJOQ/exec";

document.addEventListener("DOMContentLoaded", async () => {
  cacheDomElements();
  populateProgramOptions();
  attachEventListeners();
  await initializeScormFlow();
  window.addEventListener("beforeunload", handleBeforeUnload);
});

function cacheDomElements() {
  elements.timer = document.getElementById("timer");
  elements.timerContainer = document.getElementById("timer-container");
  elements.timeRemaining = document.getElementById("time-remaining");
  elements.timerBar = document.getElementById("timer-bar");
  elements.programBanner = document.getElementById("program-banner");
  elements.programName = document.getElementById("selected-program-name");
  elements.programOverlay = document.getElementById("program-selection");
  elements.programSelect = document.getElementById("programme-select");
  elements.startButton = document.getElementById("start-test");
  elements.vocabularyContent = document.getElementById("vocabulary-content");
  elements.wordBank = document.getElementById("word-bank");
  elements.matchingGrid = document.getElementById("matching-grid");
  elements.actions = document.getElementById("actions");
  elements.submitButton = document.getElementById("submit-test");
}

function populateProgramOptions() {
  if (!elements.programSelect) {
    return;
  }

  PROGRAMS.forEach((programme) => {
    const option = document.createElement("option");
    option.value = programme.key;
    option.textContent = `${programme.key} - ${programme.label}`;
    elements.programSelect.appendChild(option);
  });
}

function attachEventListeners() {
  if (elements.startButton) {
    elements.startButton.addEventListener("click", handleProgrammeStart);
  }

  if (elements.submitButton) {
    elements.submitButton.addEventListener("click", () => endTest(false));
  }
}

async function initializeScormFlow() {
  await loadQuestions();

  try {
    scorm = pipwerks ? pipwerks.SCORM : null;
  } catch (error) {
    console.error("SCORM API not available:", error);
    scorm = null;
  }

  if (!scorm) {
    showProgrammeOverlay();
    return;
  }

  try {
    const connected = scorm.init();
    if (!connected) {
      showProgrammeOverlay();
      return;
    }

    isScormMode = true;

    const lessonStatus = scorm.get("cmi.core.lesson_status");
    if (lessonStatus === "completed") {
      showCompletedState();
      return;
    }

    const suspendData = scorm.get("cmi.suspend_data");
    if (suspendData) {
      try {
        const savedState = JSON.parse(suspendData);
        if (savedState && savedState.program && savedState.startTime) {
          restoreFromSavedState(savedState);
          return;
        }
      } catch (error) {
        console.error("Error parsing saved state:", error);
      }
    }

    showProgrammeOverlay();
  } catch (error) {
    console.error("SCORM initialisation error:", error);
    showProgrammeOverlay();
  }
}

async function loadQuestions() {
  if (questionsData) {
    return;
  }

  try {
    const response = await fetch("questions.json");
    questionsData = await response.json();
  } catch (error) {
    console.error("Failed to load vocabulary questions:", error);
    if (elements.vocabularyContent) {
      elements.vocabularyContent.innerHTML =
        '<p class="error">Unable to load vocabulary questions. Please try again later.</p>';
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
  selectedSetKey = setKeys[Math.floor(Math.random() * setKeys.length)];
  selectedQuestions = JSON.parse(JSON.stringify(programmeSets[selectedSetKey])) || [];

  startTimestamp = Date.now();
  testCompleted = false;
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
  saveProgressToScorm();
}

function prepareInterface() {
  hideProgrammeOverlay();

  if (elements.programBanner && elements.programName) {
    const label = PROGRAM_LABEL_LOOKUP[selectedProgram] || selectedProgram;
    elements.programBanner.classList.remove("hidden");
    elements.programName.textContent = `${selectedProgram} — ${label}`;
  }

  if (elements.timer) {
    elements.timer.classList.remove("hidden");
  }
  if (elements.timerContainer) {
    elements.timerContainer.classList.remove("hidden");
  }
  if (elements.vocabularyContent) {
    elements.vocabularyContent.classList.remove("hidden");
  }
  if (elements.actions) {
    elements.actions.classList.remove("hidden");
  }
}

function renderVocabularyTask() {
  if (!elements.wordBank || !elements.matchingGrid) {
    return;
  }

  elements.wordBank.innerHTML = "";
  elements.matchingGrid.innerHTML = "";
  tokens = [];
  tokenMap = {};
  tokenElements = {};
  tokenAssignments = {};

  selectedQuestions.forEach((entry, index) => {
    const tokenId = `token_${index}`;
    const token = { id: tokenId, word: entry.answer };
    tokens.push(token);
    tokenMap[tokenId] = token;
    if (!(entry.id in matchAssignments)) {
      matchAssignments[entry.id] = null;
    }
  });

  const shuffledTokens = shuffleArray([...tokens]);

  shuffledTokens.forEach((token) => {
    const chip = createWordChip(token, "bank");
    tokenElements[token.id] = chip;
    elements.wordBank.appendChild(chip);
  });

  selectedQuestions.forEach((entry) => {
    const card = document.createElement("div");
    card.className = "match-card";
    card.dataset.questionId = entry.id;

    const definition = document.createElement("div");
    definition.className = "definition";
    definition.textContent = entry.question;

    const dropzone = document.createElement("div");
    dropzone.className = "match-dropzone";
    dropzone.dataset.questionId = entry.id;
    dropzone.addEventListener("click", () => handleDropZoneClick(entry.id));

    const placeholder = document.createElement("span");
    placeholder.className = "dropzone-placeholder";
    placeholder.textContent = "Tap to place word";
    dropzone.appendChild(placeholder);

    card.appendChild(definition);
    card.appendChild(dropzone);
    elements.matchingGrid.appendChild(card);
  });

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

  chip.addEventListener("click", () => handleChipClick(token.id));

  return chip;
}

function handleChipClick(tokenId) {
  const chip = tokenElements[tokenId];
  if (!chip) {
    return;
  }

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
    if (assignedQuestionId) {
      removeAssignment(assignedQuestionId, { selectToken: true });
    }
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
  const dropzone = elements.matchingGrid.querySelector(
    `.match-dropzone[data-question-id="${questionId}"]`
  );
  if (!token || !chip || !dropzone) {
    return;
  }

  if (matchAssignments[questionId] === tokenId) {
    return;
  }

  removeAssignment(questionId, { skipSelectionClear: true });

  const existingQuestion = tokenAssignments[tokenId];
  if (existingQuestion) {
    removeAssignment(existingQuestion, { skipSelectionClear: true });
  }

  dropzone.innerHTML = "";
  chip.classList.add("assigned");
  chip.classList.remove("selected");
  chip.dataset.location = "dropzone";
  dropzone.appendChild(chip);

  matchAssignments[questionId] = tokenId;
  tokenAssignments[tokenId] = questionId;
  userAnswers[questionId] = token.word;

  if (!options.suppressSelection) {
    selectedTokenId = null;
  }
  clearSelection();
  saveProgressToScorm();
}

function removeAssignment(questionId, options = {}) {
  const tokenId = matchAssignments[questionId];
  if (!tokenId) {
    return;
  }

  const chip = tokenElements[tokenId];
  if (!chip) {
    return;
  }

  const dropzone = elements.matchingGrid.querySelector(
    `.match-dropzone[data-question-id="${questionId}"]`
  );
  if (dropzone) {
    dropzone.innerHTML = "";
    const placeholder = document.createElement("span");
    placeholder.className = "dropzone-placeholder";
    placeholder.textContent = "Tap to place word";
    dropzone.appendChild(placeholder);
  }

  chip.dataset.location = "bank";
  chip.classList.remove("assigned");
  if (!options.skipSelectionClear) {
    chip.classList.remove("selected");
  }
  elements.wordBank.appendChild(chip);

  matchAssignments[questionId] = null;
  delete tokenAssignments[tokenId];
  delete userAnswers[questionId];

  if (options.selectToken) {
    clearSelection();
    selectedTokenId = tokenId;
    chip.classList.add("selected");
  }

  if (!options.skipSelectionClear && !options.selectToken) {
    clearSelection();
  }

  saveProgressToScorm();
}

function clearSelection() {
  Object.values(tokenElements).forEach((chip) => {
    chip.classList.remove("selected");
  });
  selectedTokenId = null;
}

function flashDropzone(questionId) {
  const dropzone = elements.matchingGrid.querySelector(
    `.match-dropzone[data-question-id="${questionId}"]`
  );
  if (!dropzone) {
    return;
  }
  dropzone.classList.add("active");
  setTimeout(() => dropzone.classList.remove("active"), 400);
}

function startTimer() {
  if (!startTimestamp) {
    startTimestamp = Date.now();
  }

  updateTimerDisplay();
  timerInterval = setInterval(updateTimerDisplay, 1000);
}

function updateTimerDisplay() {
  if (!startTimestamp) {
    return;
  }

  const elapsed = Date.now() - startTimestamp;
  const remaining = Math.max(0, TEST_DURATION - elapsed);

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  if (elements.timeRemaining) {
    elements.timeRemaining.textContent = `${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  if (elements.timerBar) {
    const percentage = (remaining / TEST_DURATION) * 100;
    elements.timerBar.style.width = `${percentage}%`;
    if (percentage < 25) {
      elements.timerBar.style.backgroundColor = "var(--danger-color)";
    } else if (percentage < 50) {
      elements.timerBar.style.backgroundColor = "var(--warning-color)";
    } else {
      elements.timerBar.style.backgroundColor = "var(--primary-color)";
    }
  }

  if (remaining <= 0) {
    endTest(true);
  }
}

function endTest(isTimeout) {
  if (testCompleted) {
    return;
  }

  testCompleted = true;
  clearInterval(timerInterval);
  timerInterval = null;

  if (elements.vocabularyContent) {
    elements.vocabularyContent.classList.add("hidden");
  }
  if (elements.actions) {
    elements.actions.classList.add("hidden");
  }
  if (elements.timer) {
    elements.timer.classList.add("hidden");
  }
  if (elements.timerContainer) {
    elements.timerContainer.classList.add("hidden");
  }
  if (elements.programBanner) {
    elements.programBanner.classList.add("hidden");
  }
  const instructionElement = document.querySelector(".instructions");
  if (instructionElement) {
    instructionElement.classList.add("hidden");
  }

  const totalQuestions = getTotalQuestionCount();
  const finalScore = calculateScore();

  const testTimeSpent = Math.min(Date.now() - startTimestamp, TEST_DURATION);
  const minutesSpent = Math.floor(testTimeSpent / 60000);
  const secondsSpent = Math.floor((testTimeSpent % 60000) / 1000);
  const timeDisplay = `${minutesSpent.toString().padStart(2, "0")}:${secondsSpent
    .toString()
    .padStart(2, "0")}`;
  const completionDate = new Date();
  const completionTime = completionDate.toLocaleString();
  const completionIso = completionDate.toISOString();

  const completionDiv = document.createElement("div");
  completionDiv.className = "completion-message";
  completionDiv.innerHTML = `
    <div class="tick-icon"></div>
    <h2>Test Completed!</h2>
    <p class="completion-info">Vocabulary Test Completed Successfully</p>
    <div class="score-display">${finalScore}/${totalQuestions}</div>
    <p class="time-spent">Time Spent: ${timeDisplay}</p>
    <p class="completion-time">Completed at: ${completionTime}</p>
    <p class="programme-info">Training Programme: ${formatProgrammeLabel(selectedProgram)}</p>
  `;

  const container = document.querySelector(".container");
  if (container) {
    container.appendChild(completionDiv);
  }

  if (isScormMode) {
    scorm.set("cmi.core.score.raw", finalScore);
    scorm.set("cmi.core.score.min", "0");
    scorm.set("cmi.core.score.max", String(totalQuestions));
    scorm.set("cmi.core.lesson_status", "completed");

    const completionData = {
      completedAt: completionIso,
      timeSpent: timeDisplay,
      program: selectedProgram,
      programLabel: formatProgrammeLabel(selectedProgram),
    };

    scorm.set("cmi.suspend_data", JSON.stringify(completionData));
    scorm.save();
  }

  sendToGoogleSheets(finalScore, totalQuestions, timeDisplay, completionIso);
  showNotification(isTimeout ? "Time's up! Test submitted." : "Test completed successfully!");
}

function getTotalQuestionCount() {
  return selectedQuestions.length;
}

function calculateScore() {
  let score = 0;

  selectedQuestions.forEach((entry) => {
    const userValue = userAnswers[entry.id];
    if (!userValue) {
      return;
    }
    const normalizedUser = normalizeText(userValue);
    const normalizedAnswer = normalizeText(entry.answer || "");
    if (normalizedUser && normalizedUser === normalizedAnswer) {
      score += 1;
    }
  });

  return score;
}

async function sendToGoogleSheets(score, totalQuestions, timeSpent, completionIso) {
  let studentName = "Anonymous";
  let studentId = "";

  if (isScormMode) {
    studentName = scorm.get("cmi.core.student_name") || "Anonymous";
    studentId = scorm.get("cmi.core.student_id") || "";
  }

  const payload = {
    testType: "Vocabulary Test",
    name: studentName,
    studentId,
    program: formatProgrammeLabel(selectedProgram),
    score,
    totalQuestions,
    scorePercentage: totalQuestions ? Math.round((score / totalQuestions) * 100) : 0,
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
  } catch (error) {
    console.error("Failed to send vocabulary results:", error);
  }
}

function buildAnswersSummary() {
  const entries = [];

  selectedQuestions.forEach((entry) => {
    const userValue = userAnswers[entry.id] || "N/A";
    let outcome = "—";
    if (userValue !== "N/A") {
      const normalizedUser = normalizeText(userValue);
      const normalizedAnswer = normalizeText(entry.answer || "");
      if (normalizedUser && normalizedAnswer) {
        outcome = normalizedUser === normalizedAnswer ? "✓" : "✗";
      }
    }
    entries.push(`${entry.id}: ${userValue} (${outcome})`);
  });

  return entries.join(", ");
}

function normalizeText(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function saveProgressToScorm() {
  if (!isScormMode || !selectedProgram || !startTimestamp) {
    return;
  }

  const state = {
    startTime: startTimestamp,
    program: selectedProgram,
    setKey: selectedSetKey,
    answers: userAnswers,
    matchAssignments,
  };

  try {
    scorm.set("cmi.suspend_data", JSON.stringify(state));
    scorm.save();
  } catch (error) {
    console.error("Failed to save progress to SCORM:", error);
  }
}

function restoreFromSavedState(savedState) {
  selectedProgram = savedState.program;
  const programmeSets = questionsData[selectedProgram] || {};
  selectedSetKey = savedState.setKey && programmeSets[savedState.setKey]
    ? savedState.setKey
    : Object.keys(programmeSets)[0];

  selectedQuestions = JSON.parse(JSON.stringify(programmeSets[selectedSetKey] || []));
  startTimestamp = parseInt(savedState.startTime, 10);
  if (Number.isNaN(startTimestamp)) {
    startTimestamp = Date.now();
  }

  userAnswers = savedState.answers || {};
  matchAssignments = savedState.matchAssignments || {};
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

function showProgrammeOverlay() {
  if (elements.programOverlay) {
    elements.programOverlay.classList.remove("hidden");
  }
}

function hideProgrammeOverlay() {
  if (elements.programOverlay) {
    elements.programOverlay.classList.add("hidden");
  }
}

function showCompletedState() {
  const score = scorm.get("cmi.core.score.raw");
  const suspendData = scorm.get("cmi.suspend_data");

  let completedAtText = "Unavailable";
  let timeSpentText = "Unavailable";
  let programmeText = "Unavailable";

  if (suspendData) {
    try {
      const parsed = JSON.parse(suspendData);
      if (parsed.completedAt) {
        const parsedDate = new Date(parsed.completedAt);
        if (!Number.isNaN(parsedDate.getTime())) {
          completedAtText = parsedDate.toLocaleString();
        }
      }
      if (parsed.timeSpent) {
        timeSpentText = parsed.timeSpent;
      }
      if (parsed.programLabel) {
        programmeText = parsed.programLabel;
      }
    } catch (error) {
      console.error("Failed to parse completion data:", error);
    }
  }

  const maxScore = scorm.get("cmi.core.score.max") || "5";
  const scoreDisplay = `${score}/${maxScore}`;

  document.body.innerHTML = `
    <div class="container">
      <div class="completion-message">
        <div class="tick-icon"></div>
        <h2>Test Already Completed</h2>
        <p class="completion-info">Vocabulary Test was completed in a previous session</p>
        <div class="score-display">${scoreDisplay}</div>
        <p class="programme-info">Training Programme: ${programmeText}</p>
        <p class="time-spent">Time Spent: ${timeSpentText}</p>
        <p class="completion-time">Completed at: ${completedAtText}</p>
      </div>
    </div>
  `;
}

function formatProgrammeLabel(programmeKey) {
  if (!programmeKey) {
    return "Not selected";
  }
  return `${programmeKey} — ${PROGRAM_LABEL_LOOKUP[programmeKey] || programmeKey}`;
}

function handleBeforeUnload() {
  if (scorm && scorm.connection && scorm.connection.isActive) {
    scorm.quit();
  }
}

function showNotification(message, type = "success") {
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.innerHTML = `<i class="fas fa-check-circle"></i>${message}`;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 5000);
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
