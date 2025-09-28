// Writing placement test script
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

const TEST_DURATION = 20 * 60 * 1000; // 20 minutes

let questionsData = null;
let selectedProgram = null;
let activeTasks = { task1: null, task2: null };
let startTimestamp = null;
let timerInterval = null;
let testCompleted = false;
let isScormMode = false;
let scorm = null;

let userAnswers = {};
let scrambleState = {};
let scrambleTokens = {};

const elements = {};

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
  elements.writingContent = document.getElementById("writing-content");
  elements.actions = document.getElementById("actions");
  elements.submitButton = document.getElementById("submit-test");
  elements.task1Instruction = document.getElementById("task-1-instruction");
  elements.task1Example = document.getElementById("task-1-example");
  elements.task1Grid = document.getElementById("task-1-grid");
  elements.task1Responses = document.getElementById("task-1-responses");
  elements.task2Instruction = document.getElementById("task-2-instruction");
  elements.task2Questions = document.getElementById("task-2-questions");
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
    console.error("Failed to load writing questions:", error);
    if (elements.writingContent) {
      elements.writingContent.innerHTML =
        '<p class="error">Unable to load writing questions. Please try again later.</p>';
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

  userAnswers = {};
  scrambleState = {};
  scrambleTokens = {};
  testCompleted = false;
  startTimestamp = Date.now();

  prepareInterface();
  renderTaskOne();
  renderTaskTwo();
  restoreUserAnswers();
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
  if (elements.writingContent) {
    elements.writingContent.classList.remove("hidden");
  }
  if (elements.actions) {
    elements.actions.classList.remove("hidden");
  }
}

function renderTaskOne() {
  const task = activeTasks.task1;
  if (!task) {
    elements.task1Instruction.textContent = "Questions unavailable.";
    return;
  }

  elements.task1Instruction.textContent = task.instruction || "";
  elements.task1Example.innerHTML = "";
  elements.task1Grid.innerHTML = "";
  elements.task1Responses.innerHTML = "";

  const questions = task.question || [];
  if (!questions.length) {
    return;
  }

  const exampleEntry = questions[0];
  const exampleSentence = exampleEntry.answers ? exampleEntry.answers[0] : "";

  const exampleContainer = document.createElement("div");
  exampleContainer.className = "example-content";
  exampleContainer.innerHTML = `
    <div class="example-label">Example</div>
    <p class="example-sentence"><strong>${exampleSentence || ""}</strong></p>
  `;
  elements.task1Example.appendChild(exampleContainer);

  renderSentenceGrid(questions);
  renderResponseCards(questions.slice(1));
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
    entry.question.forEach((cellValue) => {
      const cell = document.createElement("td");
      if (index === 0) {
        cell.innerHTML = `<strong>${cellValue}</strong>`;
      } else {
        cell.textContent = cellValue;
      }
      row.appendChild(cell);
    });
    tbody.appendChild(row);
  });

  elements.task1Grid.appendChild(table);
}

function renderResponseCards(entries) {
  elements.task1Responses.innerHTML = "";

  entries.forEach((entry, index) => {
    const card = document.createElement("div");
    card.className = "response-card";

    const title = document.createElement("h3");
    const name = entry.question ? entry.question[0] : `Question ${index + 1}`;
    title.textContent = `Write about ${name}`;

    const textarea = document.createElement("textarea");
    textarea.placeholder = "Write your sentences here...";
    textarea.value = userAnswers[entry.id] || "";
    textarea.dataset.questionId = entry.id;

    textarea.addEventListener("input", (event) => {
      const value = event.target.value;
      userAnswers[entry.id] = value;
      saveProgressToScorm();
    });

    card.appendChild(title);
    card.appendChild(textarea);
    elements.task1Responses.appendChild(card);
  });
}

function renderTaskTwo() {
  const task = activeTasks.task2;
  if (!task) {
    elements.task2Instruction.textContent = "Questions unavailable.";
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

  const tokens = (question.question || []).map((word, idx) => ({
    id: `${question.id}-${idx}`,
    word,
  }));
  scrambleTokens[question.id] = tokens;

  const sentenceOrder = scrambleState[question.id] || [];

  const tokensInSentence = new Set(sentenceOrder);

  tokens.forEach((token) => {
    if (!tokensInSentence.has(token.id)) {
      const chip = createWordChip(question.id, token, "bank");
      wordBank.appendChild(chip);
    }
  });

  sentenceOrder.forEach((tokenId) => {
    const token = tokens.find((item) => item.id === tokenId);
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

  if (location === "sentence") {
    chip.classList.add("in-sentence");
  }

  chip.addEventListener("click", () => {
    handleWordChipToggle(questionId, token.id);
  });

  return chip;
}

function handleWordChipToggle(questionId, tokenId) {
  const container = elements.task2Questions.querySelector(
    `.scramble-question[data-question-id="${questionId}"]`
  );
  if (!container) {
    return;
  }

  const wordBank = container.querySelector(".word-bank");
  const sentenceZone = container.querySelector(".sentence-dropzone");

  const chip = container.querySelector(`.word-chip[data-token-id="${tokenId}"]`);
  if (!chip) {
    return;
  }

  const currentLocation = chip.dataset.location;

  if (currentLocation === "bank") {
    chip.dataset.location = "sentence";
    chip.classList.add("in-sentence");
    sentenceZone.appendChild(chip);
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
  const sentenceZone = container.querySelector(".sentence-dropzone");
  const chips = sentenceZone.querySelectorAll(".word-chip");
  const order = Array.from(chips).map((chip) => chip.dataset.tokenId);
  scrambleState[questionId] = order;
}

function updateScrambleAnswer(questionId) {
  const tokens = scrambleTokens[questionId] || [];
  const order = scrambleState[questionId] || [];

  const words = order
    .map((tokenId) => tokens.find((token) => token.id === tokenId))
    .filter(Boolean)
    .map((token) => token.word);

  const sentence = formatSentence(words);
  if (sentence) {
    userAnswers[questionId] = sentence;
  } else {
    delete userAnswers[questionId];
  }
}

function formatSentence(words) {
  if (!words.length) {
    return "";
  }

  const joined = words.join(" ");
  const trimmed = joined.trim();
  if (!trimmed) {
    return "";
  }

  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return capitalized.endsWith(".") ? capitalized : `${capitalized}.`;
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

  if (elements.writingContent) {
    elements.writingContent.classList.add("hidden");
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
  const correctAnswers = calculateScore();
  const marksAwarded = correctAnswers;
  const maxMarks = totalQuestions;

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
    <p class="completion-info">Writing Test Completed Successfully</p>
    <div class="score-display">${correctAnswers}/${totalQuestions}</div>
    <p class="time-spent">Time Spent: ${timeDisplay}</p>
    <p class="completion-time">Completed at: ${completionTime}</p>
    <p class="programme-info">Training Programme: ${formatProgrammeLabel(selectedProgram)}</p>
  `;

  const container = document.querySelector(".container");
  if (container) {
    container.appendChild(completionDiv);
  }

  if (isScormMode) {
    scorm.set("cmi.core.score.raw", marksAwarded);
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
    scorm.save();
  }

  sendToGoogleSheets(correctAnswers, marksAwarded, totalQuestions, maxMarks, timeDisplay, completionIso);
  showNotification(isTimeout ? "Time's up! Test submitted." : "Test completed successfully!");
}

function getTotalQuestionCount() {
  const task1Count = activeTasks.task1 && activeTasks.task1.question
    ? Math.max(activeTasks.task1.question.length - 1, 0)
    : 0;
  const task2Count = activeTasks.task2 && activeTasks.task2.question
    ? activeTasks.task2.question.length
    : 0;
  return task1Count + task2Count;
}

function calculateScore() {
  let score = 0;

  if (activeTasks.task1 && activeTasks.task1.question) {
    activeTasks.task1.question.slice(1).forEach((entry) => {
      const expected = entry.answers || [];
      const userValue = userAnswers[entry.id];
      if (!userValue) {
        return;
      }
      const normalizedUser = normalizeText(userValue);
      const isCorrect = expected.some((answer) => normalizeText(answer) === normalizedUser);
      if (isCorrect) {
        score += 1;
      }
    });
  }

  if (activeTasks.task2 && activeTasks.task2.question) {
    activeTasks.task2.question.forEach((entry) => {
      const userValue = userAnswers[entry.id];
      if (!userValue) {
        return;
      }
      const normalizedUser = normalizeText(userValue);
      const normalizedAnswer = normalizeText(entry.answer || "");
      if (normalizedUser === normalizedAnswer) {
        score += 1;
      }
    });
  }

  return score;
}

async function sendToGoogleSheets(correctAnswers, marks, totalQuestions, totalMarks, timeSpent, completionIso) {
  const SHEETS_URL =
    "https://script.google.com/macros/s/AKfycbxZKrhA-wXc_7ymR1wOwX-W_GzyMZwXqj3ORdvJ84QCibx2gt9_D5FvicLJdrXj36nJOQ/exec";

  let studentName = "Anonymous";
  let studentId = "";

  if (isScormMode) {
    studentName = scorm.get("cmi.core.student_name") || "Anonymous";
    studentId = scorm.get("cmi.core.student_id") || "";
  }

  const payload = {
    testType: "Writing Test",
    name: studentName,
    studentId,
    program: formatProgrammeLabel(selectedProgram),
    correctAnswers: correctAnswers,
    marks: marks,
    totalQuestions,
    totalMarks: totalMarks,
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
    console.error("Failed to send writing results:", error);
  }
}

function buildAnswersSummary() {
  const entries = [];

  if (activeTasks.task1 && activeTasks.task1.question) {
    activeTasks.task1.question.slice(1).forEach((entry) => {
      const userValue = userAnswers[entry.id] || "N/A";
      let outcome = '✗';
      if (userValue !== "N/A" && entry.answers && entry.answers.length) {
        const normalizedUser = normalizeText(userValue);
        const isCorrect = entry.answers.some((answer) => normalizeText(answer) === normalizedUser);
        outcome = isCorrect ? '✓' : '✗';
      }
      entries.push(`${entry.id}: ${userValue} (${outcome})`);
    });
  }

  if (activeTasks.task2 && activeTasks.task2.question) {
    activeTasks.task2.question.forEach((entry) => {
      const userValue = userAnswers[entry.id] || "N/A";
      let outcome = '✗';
      if (userValue !== "N/A") {
        const normalizedUser = normalizeText(userValue);
        const normalizedAnswer = normalizeText(entry.answer || "");
        if (normalizedUser && normalizedAnswer) {
          outcome = normalizedUser === normalizedAnswer ? '✓' : '✗';
        }
      }
      entries.push(`${entry.id}: ${userValue} (${outcome})`);
    });
  }

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
    answers: userAnswers,
    scrambleState,
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
  activeTasks = {
    task1: questionsData[selectedProgram].question_1,
    task2: questionsData[selectedProgram].question_2,
  };

  startTimestamp = parseInt(savedState.startTime, 10);
  if (Number.isNaN(startTimestamp)) {
    startTimestamp = Date.now();
  }

  userAnswers = savedState.answers || {};
  scrambleState = savedState.scrambleState || {};
  scrambleTokens = {};
  testCompleted = false;

  prepareInterface();
  renderTaskOne();
  renderTaskTwo();
  restoreUserAnswers();
  startTimer();
  updateTimerDisplay();
}

function restoreUserAnswers() {
  if (!activeTasks.task1 || !activeTasks.task1.question) {
    return;
  }

  activeTasks.task1.question.slice(1).forEach((entry, index) => {
    const textarea = elements.task1Responses.querySelector(
      `textarea[data-question-id="${entry.id}"]`
    );
    if (textarea) {
      textarea.value = userAnswers[entry.id] || "";
    }
  });

  if (activeTasks.task2 && activeTasks.task2.question) {
    activeTasks.task2.question.forEach((entry) => {
      const container = elements.task2Questions.querySelector(
        `.scramble-question[data-question-id="${entry.id}"]`
      );
      if (!container) {
        return;
      }
      updateScrambleOrder(entry.id, container);
      updateScrambleAnswer(entry.id);
    });
  }
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
        <p class="completion-info">Writing Test was completed in a previous session</p>
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
