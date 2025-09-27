// Listening placement test script

const PROGRAMS = [
  { key: "AT", label: "Automobile Technology" },

  { key: "CT", label: "Construction Technology" },

  { key: "ET", label: "Electrical Technology" },

  { key: "FT", label: "Food Technology" },

  { key: "ICT", label: "Information and Communication Technology" },

  { key: "MT", label: "Mechanical Technology" },
];

const PROGRAM_LABEL_LOOKUP = PROGRAMS.reduce((acc, programme) => {
  acc[programme.key] = programme.label;

  return acc;
}, {});

const TEST_DURATION = 20 * 60 * 1000; // 20 minutes in milliseconds

const SECOND_PLAY_DELAY = 30 * 1000; // 30 seconds between plays

let questionsData = null;

let selectedProgram = null;

let selectedQuestions = { general: null, specific: null };

let startTimestamp = null;

let timerInterval = null;

let testCompleted = false;

let userAnswers = {};

let audioControllers = {};

let audioState = createDefaultAudioState();

let isScormMode = false;

let scorm = null;

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

  elements.listeningContent = document.getElementById("listening-content");

  elements.actions = document.getElementById("actions");

  elements.submitButton = document.getElementById("submit-test");

  elements.programOverlay = document.getElementById("program-selection");

  elements.programSelect = document.getElementById("programme-select");

  elements.startButton = document.getElementById("start-test");

  elements.programBanner = document.getElementById("program-banner");

  elements.programName = document.getElementById("selected-program-name");

  elements.generalQuestions = document.getElementById("general-questions");

  elements.specificQuestions = document.getElementById("specific-questions");

  elements.generalStatus = document.getElementById("general-audio-status");

  elements.specificStatus = document.getElementById("specific-audio-status");
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
    console.error("Failed to load listening questions:", error);

    if (elements.listeningContent) {
      elements.listeningContent.innerHTML =
        '<p class="error">Unable to load listening questions. Please try again later.</p>';
    }
  }
}

function handleProgrammeStart() {
  const programmeKey = elements.programSelect
    ? elements.programSelect.value
    : "";

  if (!programmeKey) {
    showNotification(
      "Please select your training programme before starting.",
      "error"
    );

    return;
  }

  selectedProgram = programmeKey;

  userAnswers = {};

  audioControllers = {};

  audioState = createDefaultAudioState();

  selectedQuestions = selectQuestionSets(programmeKey);

  startTimestamp = Date.now();

  testCompleted = false;

  prepareInterface();

  renderQuestions();

  initialiseAudioControllers();

  restoreUserAnswers();

  startTimer();

  saveProgressToScorm();
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

function prepareInterface() {
  hideProgrammeOverlay();

  if (elements.programBanner && elements.programName) {
    elements.programBanner.classList.remove("hidden");

    const label = PROGRAM_LABEL_LOOKUP[selectedProgram] || selectedProgram;

    elements.programName.textContent = `${selectedProgram} - ${label}`;
  }

  if (elements.timer) {
    elements.timer.classList.remove("hidden");
  }

  if (elements.timerContainer) {
    elements.timerContainer.classList.remove("hidden");
  }

  if (elements.listeningContent) {
    elements.listeningContent.classList.remove("hidden");
  }

  if (elements.actions) {
    elements.actions.classList.remove("hidden");
  }
}

function selectQuestionSets(programmeKey) {
  const result = { general: null, specific: null };

  if (
    !questionsData ||
    !questionsData.General ||
    !questionsData[programmeKey]
  ) {
    return result;
  }

  const generalKeys = Object.keys(questionsData.General);

  const generalId = generalKeys[Math.floor(Math.random() * generalKeys.length)];

  const programmeKeys = Object.keys(questionsData[programmeKey]);

  const specificId =
    programmeKeys[Math.floor(Math.random() * programmeKeys.length)];

  result.general = normaliseQuestionSet(
    questionsData.General[generalId],
    generalId
  );

  result.specific = normaliseQuestionSet(
    questionsData[programmeKey][specificId],
    specificId
  );

  return result;
}

function normaliseQuestionSet(rawSet, id) {
  if (!rawSet) {
    return null;
  }

  return {
    id,

    audio: rawSet.audio,

    questions: (rawSet.question || []).map((item) => ({
      id: item.id,

      question: item.question,

      options: [...(item.options || [])],

      answer: item.answer,
    })),
  };
}

function renderQuestions() {
  renderSection(selectedQuestions.general, elements.generalQuestions);

  renderSection(selectedQuestions.specific, elements.specificQuestions);
}

function renderSection(sectionData, container) {
  if (!container) {
    return;
  }

  container.innerHTML = "";

  if (!sectionData || !sectionData.questions || !sectionData.questions.length) {
    container.innerHTML =
      '<p class="error">Questions unavailable for this section.</p>';

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
      const optionItem = document.createElement("li");

      optionItem.className = "option";

      optionItem.dataset.value = option;

      optionItem.textContent = option;

      optionItem.addEventListener("click", () =>
        selectOption(question.id, option, optionItem)
      );

      optionsList.appendChild(optionItem);
    });

    content.appendChild(questionText);

    content.appendChild(optionsList);

    wrapper.appendChild(number);

    wrapper.appendChild(content);

    container.appendChild(wrapper);
  });
}

function selectOption(questionId, optionValue, optionElement) {
  const questionElement = optionElement.closest(".question-item");

  if (!questionElement) {
    return;
  }

  questionElement

    .querySelectorAll(".option")

    .forEach((optionNode) => optionNode.classList.remove("selected"));

  optionElement.classList.add("selected");

  userAnswers[questionId] = optionValue;

  saveProgressToScorm();
}

function restoreUserAnswers() {
  Object.keys(userAnswers).forEach((questionId) => {
    const questionElement = document.querySelector(
      `.question-item[data-question-id="${questionId}"]`
    );

    if (!questionElement) {
      return;
    }

    const savedAnswer = userAnswers[questionId];

    const target = Array.from(questionElement.querySelectorAll(".option")).find(
      (option) => option.dataset.value === savedAnswer
    );

    if (target) {
      target.classList.add("selected");
    }
  });
}

function initialiseAudioControllers() {
  audioControllers = {};

  if (selectedQuestions.general) {
    audioControllers.general = createAudioController(
      "general",

      selectedQuestions.general.audio,

      audioState.general
    );
  }

  if (selectedQuestions.specific) {
    audioControllers.specific = createAudioController(
      "specific",

      selectedQuestions.specific.audio,

      audioState.specific
    );
  }
}

function createAudioController(sectionKey, audioSrc, initialState = {}) {
  const button = document.querySelector(
    `.audio-play-button[data-section="${sectionKey}"]`
  );

  const statusElement =
    sectionKey === "general" ? elements.generalStatus : elements.specificStatus;

  const controller = {
    key: sectionKey,

    audio: new Audio(audioSrc),

    button,

    label: button ? button.querySelector(".label") : null,

    status: statusElement,

    playsUsed: 0,

    awaitingSecondPlay: false,

    cooldownEnd: null,

    autoTimeout: null,

    countdownInterval: null,

    isPlaying: false,
  };

  controller.audio.preload = "auto";

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
  });

  controller.audio.addEventListener("error", (event) => {
    handlePlaybackFailure(
      controller,
      event,
      controller.playsUsed > 0 ? controller.playsUsed - 1 : 0
    );
  });

  if (controller.button) {
    controller.button.addEventListener("click", () =>
      handleAudioButtonClick(controller)
    );
  }

  applyInitialAudioState(controller, initialState);

  updateAudioStateFromController(controller);

  return controller;
}

function handleAudioButtonClick(controller) {
  if (controller.isPlaying || controller.playsUsed >= 2) {
    return;
  }

  if (controller.awaitingSecondPlay) {
    clearSecondPlayCountdown(controller);

    controller.awaitingSecondPlay = false;

    controller.cooldownEnd = null;
  }

  startAudioPlayback(controller);
}

function startAudioPlayback(controller) {
  if (controller.playsUsed >= 2) {
    return;
  }

  const previousPlays = controller.playsUsed;

  controller.playsUsed += 1;

  if (controller.button) {
    controller.button.disabled = true;

    controller.button.classList.remove("countdown", "completed");

    if (controller.label) {
      controller.label.textContent =
        controller.playsUsed === 1
          ? "Playing (First Time)"
          : "Playing (Second Time)";
    }
  }

  updateAudioStatus(controller);

  try {
    controller.audio.currentTime = 0;

    const playPromise = controller.audio.play();

    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch((error) =>
        handlePlaybackFailure(controller, error, previousPlays)
      );
    }
  } catch (error) {
    handlePlaybackFailure(controller, error, previousPlays);

    return;
  }

  updateAudioStateFromController(controller);

  saveProgressToScorm();
}

function handlePlaybackFailure(controller, error, previousPlays) {
  console.error("Audio playback failed:", error);

  controller.isPlaying = false;

  controller.playsUsed = previousPlays;

  if (previousPlays === 1) {
    controller.awaitingSecondPlay = true;

    controller.cooldownEnd = null;
  }

  if (controller.button) {
    controller.button.disabled = false;

    controller.button.classList.remove("playing");

    if (controller.label) {
      controller.label.textContent =
        controller.playsUsed === 0 ? "Play Recording" : "Play Second Time";
    }
  }

  const statusMessage =
    previousPlays === 1
      ? "Second play ready. Tap to play the final time."
      : "Playback failed. Please try again.";

  updateAudioStatus(controller, statusMessage);

  updateAudioStateFromController(controller);

  saveProgressToScorm();
}

function handleAudioEnded(controller) {
  if (controller.playsUsed === 1) {
    controller.awaitingSecondPlay = true;

    startSecondPlayCountdown(controller);
  } else if (controller.playsUsed >= 2) {
    finaliseAudioPlayback(controller);
  }

  updateAudioStateFromController(controller);

  saveProgressToScorm();
}

function startSecondPlayCountdown(controller, remaining = SECOND_PLAY_DELAY) {
  clearSecondPlayCountdown(controller);

  controller.awaitingSecondPlay = true;

  controller.cooldownEnd = Date.now() + remaining;

  if (controller.button) {
    controller.button.disabled = false;

    controller.button.classList.add("countdown");
  }

  const updateCountdown = () => {
    const msRemaining = controller.cooldownEnd - Date.now();

    if (msRemaining <= 0) {
      clearSecondPlayCountdown(controller);

      if (controller.playsUsed < 2 && !controller.isPlaying) {
        controller.awaitingSecondPlay = false;

        controller.cooldownEnd = null;

        startAudioPlayback(controller);
      }

      return;
    }

    if (controller.label) {
      controller.label.textContent = `Play Second Time (${formatCountdown(
        msRemaining
      )})`;
    }

    updateAudioStatus(
      controller,

      `Second play will start automatically in ${formatCountdown(msRemaining)}`
    );
  };

  updateCountdown();

  controller.countdownInterval = setInterval(updateCountdown, 1000);

  controller.autoTimeout = setTimeout(() => {
    clearSecondPlayCountdown(controller);

    if (controller.playsUsed < 2 && !controller.isPlaying) {
      controller.awaitingSecondPlay = false;

      controller.cooldownEnd = null;

      startAudioPlayback(controller);
    }
  }, remaining);

  updateAudioStateFromController(controller);

  saveProgressToScorm();
}

function clearSecondPlayCountdown(controller) {
  if (controller.autoTimeout) {
    clearTimeout(controller.autoTimeout);

    controller.autoTimeout = null;
  }

  if (controller.countdownInterval) {
    clearInterval(controller.countdownInterval);

    controller.countdownInterval = null;
  }

  if (controller.button) {
    controller.button.classList.remove("countdown");
  }
}

function finaliseAudioPlayback(controller) {
  clearSecondPlayCountdown(controller);

  controller.awaitingSecondPlay = false;

  controller.cooldownEnd = null;

  if (controller.button) {
    controller.button.disabled = true;

    controller.button.classList.add("completed");

    if (controller.label) {
      controller.label.textContent = "Playback Completed";
    }
  }

  updateAudioStatus(
    controller,
    "Playback completed. You have used both plays."
  );
}

function updateAudioStatus(controller, overrideText) {
  if (!controller.status) {
    return;
  }

  if (overrideText) {
    controller.status.textContent = overrideText;

    return;
  }

  if (controller.isPlaying) {
    controller.status.textContent = "Playing...";

    return;
  }

  if (controller.playsUsed >= 2) {
    controller.status.textContent = "Playback completed.";

    return;
  }

  if (controller.awaitingSecondPlay) {
    if (controller.cooldownEnd) {
      const remaining = controller.cooldownEnd - Date.now();

      controller.status.textContent =
        remaining > 0
          ? `Second play available in ${formatCountdown(remaining)}`
          : "Second play ready.";
    } else {
      controller.status.textContent = "Second play ready.";
    }

    return;
  }

  const playsRemaining = 2 - controller.playsUsed;

  controller.status.textContent = `Plays remaining: ${playsRemaining}`;
}

function applyInitialAudioState(controller, initialState) {
  controller.playsUsed =
    initialState && initialState.playsUsed ? initialState.playsUsed : 0;

  controller.awaitingSecondPlay =
    initialState && initialState.awaitingSecondPlay && controller.playsUsed < 2;

  controller.cooldownEnd = null;

  if (
    controller.awaitingSecondPlay &&
    initialState &&
    initialState.cooldownEnd
  ) {
    const parsedCooldown = parseInt(initialState.cooldownEnd, 10);

    if (!Number.isNaN(parsedCooldown)) {
      controller.cooldownEnd = parsedCooldown;
    }
  }

  if (controller.playsUsed >= 2) {
    controller.playsUsed = 2;

    finaliseAudioPlayback(controller);

    return;
  }

  if (controller.awaitingSecondPlay) {
    const remaining = controller.cooldownEnd
      ? controller.cooldownEnd - Date.now()
      : 0;

    if (remaining > 0) {
      startSecondPlayCountdown(controller, remaining);
    } else {
      controller.cooldownEnd = null;

      controller.awaitingSecondPlay = true;

      if (controller.button) {
        controller.button.disabled = false;

        controller.button.classList.add("countdown");

        if (controller.label) {
          controller.label.textContent = "Play Second Time";
        }
      }

      updateAudioStatus(
        controller,
        "Second play ready. Tap to play the final time."
      );
    }

    return;
  }

  if (controller.button) {
    controller.button.disabled = false;

    if (controller.label) {
      controller.label.textContent =
        controller.playsUsed === 0 ? "Play Recording" : "Play Second Time";
    }
  }

  updateAudioStatus(controller);
}

function formatCountdown(milliseconds) {
  const totalSeconds = Math.ceil(milliseconds / 1000);

  const safeSeconds = totalSeconds < 0 ? 0 : totalSeconds;

  const minutes = Math.floor(safeSeconds / 60);

  const seconds = safeSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function updateAudioStateFromController(controller) {
  const state = {
    playsUsed: controller.playsUsed,

    awaitingSecondPlay:
      controller.awaitingSecondPlay && controller.playsUsed < 2,

    cooldownEnd:
      controller.awaitingSecondPlay && controller.cooldownEnd
        ? controller.cooldownEnd
        : null,
  };

  audioState[controller.key] = state;
}

function createDefaultAudioState() {
  return {
    general: { playsUsed: 0, awaitingSecondPlay: false, cooldownEnd: null },

    specific: { playsUsed: 0, awaitingSecondPlay: false, cooldownEnd: null },
  };
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

  const percentage = (remaining / TEST_DURATION) * 100;

  if (elements.timerBar) {
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

  Object.values(audioControllers).forEach((controller) => {
    if (!controller) {
      return;
    }

    if (controller.audio) {
      controller.audio.pause();
    }

    clearSecondPlayCountdown(controller);

    if (controller.button) {
      controller.button.disabled = true;
    }
  });

  if (elements.listeningContent) {
    elements.listeningContent.classList.add("hidden");
  }

  if (elements.actions) {
    elements.actions.classList.add("hidden");
  }

  const totalQuestions = getTotalQuestionCount();

  const finalScore = calculateScore();

  const testTimeSpent = Math.min(Date.now() - startTimestamp, TEST_DURATION);

  const minutesSpent = Math.floor(testTimeSpent / 60000);

  const secondsSpent = Math.floor((testTimeSpent % 60000) / 1000);

  const timeDisplay = `${minutesSpent
    .toString()
    .padStart(2, "0")}:${secondsSpent

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

    <p class="completion-info">Listening Test Completed Successfully</p>

    <div class="score-display">${finalScore}/${totalQuestions}</div>

    <p class="time-spent">Time Spent: ${timeDisplay}</p>

    <p class="completion-time">Completed at: ${completionTime}</p>

    <p class="programme-info">Training Programme: ${formatProgrammeLabel(
      selectedProgram
    )}</p>
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

      audioUsage: {
        general: audioControllers.general
          ? audioControllers.general.playsUsed
          : 0,

        specific: audioControllers.specific
          ? audioControllers.specific.playsUsed
          : 0,
      },
    };

    scorm.set("cmi.suspend_data", JSON.stringify(completionData));

    scorm.save();
  }

  sendToGoogleSheets(finalScore, totalQuestions, timeDisplay, completionIso);

  showNotification(
    isTimeout ? "Time's up! Test submitted." : "Test completed successfully!"
  );
}

function getTotalQuestionCount() {
  const generalCount = selectedQuestions.general
    ? selectedQuestions.general.questions.length
    : 0;

  const specificCount = selectedQuestions.specific
    ? selectedQuestions.specific.questions.length
    : 0;

  return generalCount + specificCount;
}

function calculateScore() {
  let score = 0;

  const evaluate = (section) => {
    if (!section || !section.questions) {
      return;
    }

    section.questions.forEach((question) => {
      const userAnswer = userAnswers[question.id];

      if (userAnswer && userAnswer === question.answer) {
        score += 1;
      }
    });
  };

  evaluate(selectedQuestions.general);

  evaluate(selectedQuestions.specific);

  return score;
}

async function sendToGoogleSheets(
  score,
  totalQuestions,
  timeSpent,
  completionIso
) {
  const SHEETS_URL =
    "https://script.google.com/macros/s/AKfycbxZKrhA-wXc_7ymR1wOwX-W_GzyMZwXqj3ORdvJ84QCibx2gt9_D5FvicLJdrXj36nJOQ/exec";

  let studentName = "Anonymous";

  let studentId = "";

  if (isScormMode) {
    studentName = scorm.get("cmi.core.student_name") || "Anonymous";

    studentId = scorm.get("cmi.core.student_id") || "";
  }

  const payload = {
    testType: "Listening Test",

    name: studentName,

    studentId,

    program: formatProgrammeLabel(selectedProgram),

    score,

    totalQuestions,

    scorePercentage: totalQuestions
      ? Math.round((score / totalQuestions) * 100)
      : 0,

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

  const collect = (section) => {
    if (!section || !section.questions) {
      return;
    }

    section.questions.forEach((question) => {
      const userAnswer = userAnswers[question.id] || "N/A";

      const outcome = userAnswer === question.answer ? "correct" : "incorrect";

      entries.push(`${question.id}: ${userAnswer} (${outcome})`);
    });
  };

  collect(selectedQuestions.general);

  collect(selectedQuestions.specific);

  return entries.join(", ");
}

function buildAudioSummary() {
  const generalPlays = audioControllers.general
    ? audioControllers.general.playsUsed
    : 0;

  const specificPlays = audioControllers.specific
    ? audioControllers.specific.playsUsed
    : 0;

  return `Listening 1 plays: ${generalPlays}/2, Listening 2 plays: ${specificPlays}/2`;
}

function saveProgressToScorm() {
  if (!isScormMode || !selectedProgram || !startTimestamp) {
    return;
  }

  const state = {
    startTime: startTimestamp,

    program: selectedProgram,

    generalSetId: selectedQuestions.general
      ? selectedQuestions.general.id
      : null,

    specificSetId: selectedQuestions.specific
      ? selectedQuestions.specific.id
      : null,

    answers: userAnswers,

    audioState,
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

  startTimestamp = parseInt(savedState.startTime, 10);

  if (Number.isNaN(startTimestamp)) {
    startTimestamp = Date.now();
  }

  userAnswers = savedState.answers || {};

  audioState = {
    general:
      savedState.audioState && savedState.audioState.general
        ? savedState.audioState.general
        : { playsUsed: 0, awaitingSecondPlay: false, cooldownEnd: null },

    specific:
      savedState.audioState && savedState.audioState.specific
        ? savedState.audioState.specific
        : { playsUsed: 0, awaitingSecondPlay: false, cooldownEnd: null },
  };

  selectedQuestions = {
    general: normaliseQuestionSet(
      questionsData.General[savedState.generalSetId],

      savedState.generalSetId
    ),

    specific: normaliseQuestionSet(
      questionsData[selectedProgram][savedState.specificSetId],

      savedState.specificSetId
    ),
  };

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

  const maxScore = scorm.get("cmi.core.score.max") || "10";

  const scoreDisplay = `${score}/${maxScore}`;

  document.body.innerHTML = `

    <div class="container">

      <div class="completion-message">

        <div class="tick-icon"></div>

        <h2>Test Already Completed</h2>

        <p class="completion-info">Listening Test was completed in a previous session</p>

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

  return `${programmeKey} - ${
    PROGRAM_LABEL_LOOKUP[programmeKey] || programmeKey
  }`;
}

function showNotification(message, type = "success") {
  const notification = document.createElement("div");

  notification.className = `notification ${type}`;

  notification.innerHTML = `<i class="fas fa-check-circle"></i>${message}`;

  document.body.appendChild(notification);

  setTimeout(() => notification.remove(), 5000);
}

function handleBeforeUnload() {
  if (scorm && scorm.connection && scorm.connection.isActive) {
    scorm.quit();
  }
}
