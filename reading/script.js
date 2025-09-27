// Global variables
let questions = {};
let selectedSet = null;
const testDuration = 15 * 60 * 1000; // 15 minutes in milliseconds
let startTimestamp = null;
let timerInterval;
let userAnswers = {};
let isScormMode = false;
let scorm;

// DOM elements
const passageTitle = document.getElementById("passage-title");
const passageText = document.getElementById("passage-text");
const questionsContainer = document.getElementById("questions-container");
const checkAnswersBtn = document.getElementById("check-answers");
const actionsSection = document.querySelector(".actions");
const timeRemainingElement = document.getElementById("time-remaining");
const timerBar = document.getElementById("timer-bar");

// Fetch and initialize reading test
async function fetchReadingTest() {
  try {
    const response = await fetch("questions.json");
    const data = await response.json();

    questions = data;
    selectRandomSet();
    initializeTest();
    displayReadingTest();
    startTimer();
  } catch (error) {
    console.error("Error loading reading test:", error);
    questionsContainer.innerHTML =
      '<p class="error">Failed to load reading test.</p>';
  }
}

// Initialize SCORM connection
async function initScorm() {
  try {
    scorm = pipwerks.SCORM;
    console.log("Initializing SCORM connection...");
    const connected = scorm.init();

    if (connected) {
      isScormMode = true;
      console.log("SCORM connection established");

      // Check if test is already completed
      const lessonStatus = scorm.get("cmi.core.lesson_status");
      if (lessonStatus === "completed") {
        showCompletedState();
        return;
      }

      // Check for existing session
      const suspendData = scorm.get("cmi.suspend_data");
      if (suspendData) {
        try {
          const savedState = JSON.parse(suspendData);

          // Check if more than 15 minutes have passed
          const now = Date.now();
          const elapsedTime = now - savedState.startTime;
          if (elapsedTime >= testDuration) {
            await endTest(true); // End test and submit results
            return;
          }

          // Restore previous state
          console.log("Restoring saved state:", savedState);
          startTimestamp = parseInt(savedState.startTime);
          userAnswers = savedState.answers || {};
          selectedSet = savedState.selectedSet;

          // Load questions without initializing new test
          const response = await fetch("questions.json");
          questions = await response.json();

          // Restore the shuffled question order
          const set = questions[selectedSet];
          if (savedState.questionOrder) {
            // Recreate shuffled questions array using saved order
            set.shuffledQuestions = savedState.questionOrder.map(
              (originalIndex) => ({
                ...set.question[originalIndex],
                originalIndex,
              })
            );
          }

          // Display the test with saved state
          displayReadingTest();
          restoreUserAnswers();
          startTimer();
          return;
        } catch (error) {
          console.error("Error restoring state:", error);
        }
      }
    }

    // Start fresh test
    await fetchReadingTest();
  } catch (error) {
    console.error("SCORM error:", error);
    await fetchReadingTest(); // Fall back to non-SCORM mode
  }
}

// Initialize new test
function initializeTest() {
  startTimestamp = Date.now();
  userAnswers = {};

  if (isScormMode) {
    const set = questions[selectedSet];
    const initialState = {
      startTime: startTimestamp,
      selectedSet: selectedSet,
      answers: {},
      // Store the shuffled questions order by their original indices
      questionOrder: getQuestionOrder(set),
    };
    console.log("Saving initial state:", initialState);
    scorm.set("cmi.suspend_data", JSON.stringify(initialState));
    scorm.save();
  }
}

// Utility function to shuffle array
function shuffleArray(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

// Build question order for SCORM suspend data
function getQuestionOrder(set) {
  if (!set) {
    return [];
  }

  if (set.shuffledQuestions && set.shuffledQuestions.length) {
    return set.shuffledQuestions.map((q) => q.originalIndex);
  }

  return set.question.map((_, index) => index);
}

// Select random question set
function selectRandomSet() {
  const sets = [
    "question_set_1",
    "question_set_2",
    "question_set_3",
    "question_set_4",
  ];
  selectedSet = sets[Math.floor(Math.random() * sets.length)];

  // Shuffle questions and store their original indices
  const set = questions[selectedSet];
  const shuffledQuestions = set.question.map((q, index) => ({
    ...q,
    originalIndex: index, // Store original position
  }));

  // Store shuffled questions in the set
  set.shuffledQuestions = shuffleArray(shuffledQuestions);
}

// Display reading test
function displayReadingTest() {
  const set = questions[selectedSet];
  passageTitle.textContent = set.title;
  passageText.innerHTML = set.passage.replace(/\n/g, "<br>");

  // If no shuffled questions exist (for restored sessions), create them
  if (!set.shuffledQuestions) {
    set.shuffledQuestions = set.question.map((q, index) => ({
      ...q,
      originalIndex: index,
    }));
  }

  questionsContainer.innerHTML = "";
  set.shuffledQuestions.forEach((q, displayIndex) => {
    const questionElement = document.createElement("div");
    questionElement.className = "question-item";
    questionElement.dataset.index = q.originalIndex; // Store original index for answer mapping

    questionElement.innerHTML = `
            <div class="question-number">${displayIndex + 1}</div>
            <div class="question-content">
                <p class="question-text">${q.question}</p>
                <ul class="options">
                    ${shuffleArray(q.options)
                      .map(
                        (option) => `
                        <li class="option" data-value="${option}">${option}</li>
                    `
                      )
                      .join("")}
                </ul>
            </div>
        `;

    questionElement.querySelectorAll(".option").forEach((option) => {
      option.addEventListener("click", () =>
        selectOption(q.originalIndex, option.dataset.value, option)
      );
    });

    questionsContainer.appendChild(questionElement);
  });
}

// Handle answer selection
function selectOption(questionIndex, option, optionElement) {
  const questionElement = optionElement.closest(".question-item");
  questionElement
    .querySelectorAll(".option")
    .forEach((opt) => opt.classList.remove("selected"));

  optionElement.classList.add("selected");
  userAnswers[questionIndex] = option;

  if (isScormMode) {
    const set = questions[selectedSet];
    const currentState = {
      startTime: startTimestamp,
      selectedSet: selectedSet,
      answers: userAnswers,
      questionOrder: getQuestionOrder(set),
    };
    console.log("Saving answer state:", currentState);
    scorm.set("cmi.suspend_data", JSON.stringify(currentState));
    scorm.save();
  }
}

// Timer functions
function startTimer() {
  updateTimerDisplay();
  timerInterval = setInterval(updateTimerDisplay, 1000);
}

function updateTimerDisplay() {
  const now = Date.now();
  const elapsedTime = now - startTimestamp;
  const remainingTime = Math.max(0, testDuration - elapsedTime);

  if (remainingTime <= 0) {
    endTest(true);
    return;
  }

  const minutes = Math.floor(remainingTime / 60000);
  const seconds = Math.floor((remainingTime % 60000) / 1000);
  timeRemainingElement.textContent = `${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

  const percentage = (remainingTime / testDuration) * 100;
  timerBar.style.width = `${percentage}%`;
  timerBar.style.backgroundColor =
    percentage < 25
      ? "var(--danger-color)"
      : percentage < 50
      ? "var(--warning-color)"
      : "var(--primary-color)";
}

// End test and submit results
async function endTest(isTimeout = false) {
  clearInterval(timerInterval);

  questionsContainer.style.display = "none";
  actionsSection.style.display = "none";
  document.querySelector(".reading-container").style.display = "none";
  document.querySelector(".instructions").style.display = "none";
  document.querySelector(".timer").style.display = "none";
  document.querySelector(".timer-container").style.display = "none";

  // Calculate score and time
  const finalScore = Object.keys(userAnswers).reduce((total, index) => {
    return (
      total +
      (userAnswers[index] === questions[selectedSet].question[index].answer
        ? 1
        : 0)
    );
  }, 0);

  // Calculate time spent
  const testTimeSpent = Math.min(Date.now() - startTimestamp, testDuration);
  const testMinutes = Math.floor(testTimeSpent / 60000);
  const testSeconds = Math.floor((testTimeSpent % 60000) / 1000);
  const timeDisplay = `${testMinutes.toString().padStart(2, "0")}:${testSeconds
    .toString()
    .padStart(2, "0")}`;
  const completionTime = new Date().toLocaleString();

  // Create completion message
  const completionDiv = document.createElement("div");
  completionDiv.className = "completion-message";

  completionDiv.innerHTML = `
        <div class="tick-icon"></div>
        <h2>Test Completed!</h2>
        <p class="completion-info">Reading Test Completed Successfully</p>
        <div class="score-display">${finalScore}/${questions[selectedSet].question.length}</div>
        <p class="time-spent">Time Spent: ${timeDisplay}</p>
        <p class="completion-time">Completed at: ${completionTime}</p>
    `;

  document.querySelector(".container").appendChild(completionDiv);

  if (isScormMode) {
    console.log("Submitting final score:", finalScore);

    scorm.set("cmi.core.score.raw", finalScore);
    scorm.set("cmi.core.score.min", "0");
    scorm.set("cmi.core.score.max", "5");
    scorm.set("cmi.core.lesson_status", "completed");
    scorm.set("cmi.suspend_data", "");

    scorm.save();
  }

  await sendToGoogleSheets(finalScore, timeDisplay);
  showNotification(
    isTimeout ? "Time's up! Test submitted." : "Test completed successfully!"
  );
}

// Show completed state
function showCompletedState() {
  const score = scorm.get("cmi.core.score.raw");
  document.body.innerHTML = `
        <div class="container">
            <div class="completion-message">
                <div class="tick-icon"></div>
                <h2>Test Already Completed</h2>
                <p class="completion-info">Reading Test was completed in a previous session</p>
                <div class="score-display">${score}/5</div>
            </div>
        </div>
    `;
}

// Restore user's previous answers
function restoreUserAnswers() {
  Object.keys(userAnswers).forEach((index) => {
    const answer = userAnswers[index];
    const questionElement = document.querySelector(
      `.question-item[data-index="${index}"]`
    );
    if (questionElement) {
      const option = Array.from(
        questionElement.querySelectorAll(".option")
      ).find((opt) => opt.dataset.value === answer);
      if (option) {
        option.classList.add("selected");
      }
    }
  });
}

// Send results to Google Sheets
async function sendToGoogleSheets(score, timeSpent) {
  const SHEETS_URL =
    "https://script.google.com/macros/s/AKfycbxZKrhA-wXc_7ymR1wOwX-W_GzyMZwXqj3ORdvJ84QCibx2gt9_D5FvicLJdrXj36nJOQ/exec";

  let studentName = "Anonymous";
  let studentId = "";

  if (isScormMode) {
    studentName = scorm.get("cmi.core.student_name") || "Anonymous";
    studentId = scorm.get("cmi.core.student_id") || "";
  }

  // Prepare detailed answer data
  const set = questions[selectedSet];
  let answersString = "";
  set.question.forEach((question, index) => {
    const userAnswer = userAnswers[index] || "N/A";
    const isCorrect = userAnswer === question.answer;
    answersString += `${question.id}: ${userAnswer} (${
      isCorrect ? "✓" : "✗"
    }), `;
  });

  answersString = answersString.replace(/,$/, "");

  const data = {
    testType: "Reading Test",
    name: studentName,
    studentId: studentId,
    score: score,
    totalQuestions: set.question.length,
    scorePercentage: Math.round((score / set.question.length) * 100),
    timeSpent: timeSpent,
    date: new Date().toISOString(),
    answers: answersString,
    passageTitle: set.title,
  };

  try {
    console.log("Sending to Google Sheets:", data);
    await fetch(SHEETS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch (error) {
    console.error("Error sending to Google Sheets:", error);
  }
}

// Show notification
function showNotification(message) {
  const notification = document.createElement("div");
  notification.className = "notification success";
  notification.innerHTML = `<i class="fas fa-check-circle"></i>${message}`;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 5000);
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  console.log("Page loaded, initializing SCORM...");
  initScorm();

  if (checkAnswersBtn) {
    checkAnswersBtn.addEventListener("click", () => endTest(false));
  }

  window.addEventListener("beforeunload", () => {
    if (scorm && scorm.connection.isActive) {
      scorm.quit();
    }
  });
});
