// Global variables
let questions = [];
let selectedQuestions = [];
const totalQuestions = 50; // Test has 50 questions
let timeRemaining = 45 * 60; // 45 minutes in seconds
const totalTime = 45 * 60; // Total time allowed for test
let timerInterval;
let userAnswers = {};

// DOM elements
const questionsContainer = document.getElementById("questions-container");
const checkAnswersBtn = document.getElementById("check-answers");
const actionsSection = document.querySelector(".actions");
const resultsSection = document.getElementById("results");
const topResultsSection = document.getElementById("top-results");
const scoreElement = document.getElementById("score");
const topScoreElement = document.getElementById("top-score");
const totalQuestionsElement = document.getElementById("total-questions");
const topTotalElement = document.getElementById("top-total");
const timeRemainingElement = document.getElementById("time-remaining");
const topTimeSpentElement = document.getElementById("top-time-spent");
const bottomTimeSpentElement = document.getElementById("bottom-time-spent");
const timerBar = document.getElementById("timer-bar");

// Fetch questions from the JSON file
async function fetchQuestions() {
  try {
    const response = await fetch("questions.json");
    const data = await response.json();

    // Store all questions sets
    questions = {
      set1: data.question_set_1,
      set2: data.question_set_2,
      set3: data.question_set_3,
      set4: data.question_set_4,
    };

    // Select random questions
    selectRandomQuestions();

    // Render questions
    renderQuestions();

    // Start the timer
    startTimer();
  } catch (error) {
    console.error("Error fetching questions:", error);
    questionsContainer.innerHTML =
      '<p class="error">Failed to load questions. Please refresh the page.</p>';
  }
}

// Select random questions from each set
function selectRandomQuestions() {
  selectedQuestions = [];

  // For each question position, randomly select from one of the four sets
  for (let i = 0; i < totalQuestions; i++) {
    // Select a random set (1-4)
    const sets = ["set1", "set2", "set3", "set4"];
    let selectedSet;
    let questionFromSet;

    // Find a valid question (some sets might have fewer questions)
    do {
      selectedSet = sets[Math.floor(Math.random() * sets.length)];
      // Use modulo to ensure we don't go out of bounds if a set has fewer than 50 questions
      const questionIndex = i % 50; // This ensures we stay within the bounds of each set
      questionFromSet = questions[selectedSet][questionIndex];

      // If this set doesn't have this question, remove it from consideration
      if (!questionFromSet) {
        const setIndex = sets.indexOf(selectedSet);
        if (setIndex > -1) {
          sets.splice(setIndex, 1);
        }
      }
    } while (!questionFromSet && sets.length > 0);

    // If found a valid question, add it to selected questions
    if (questionFromSet) {
      // Clone the question to avoid modifying the original
      const questionCopy = JSON.parse(JSON.stringify(questionFromSet));

      // Shuffle the options
      questionCopy.options = shuffleArray(questionCopy.options);

      // Add to selected questions
      selectedQuestions.push(questionCopy);
    }
  }
}

// Use the shared shuffleArray function from common.js
function shuffleArray(array) {
  // Check if the testUtils object from common.js is available
  if (window.testUtils && window.testUtils.shuffleArray) {
    return window.testUtils.shuffleArray(array);
  } else {
    // Fallback to the local implementation if shared function is not available
    let currentIndex = array.length;
    let temporaryValue, randomIndex;

    // While there remain elements to shuffle
    while (0 !== currentIndex) {
      // Pick a remaining element
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex -= 1;

      // Swap it with the current element
      temporaryValue = array[currentIndex];
      array[currentIndex] = array[randomIndex];
      array[randomIndex] = temporaryValue;
    }

    return array;
  }
}

// Render questions to the DOM
function renderQuestions() {
  questionsContainer.innerHTML = "";
  totalQuestionsElement.textContent = selectedQuestions.length;

  selectedQuestions.forEach((question, index) => {
    const questionElement = document.createElement("div");
    questionElement.className = "question-item";
    questionElement.dataset.index = index;

    // Create number badge div
    const numberBadge = document.createElement("div");
    numberBadge.className = "question-number";
    numberBadge.textContent = `${index + 1}`;

    // Create question content container
    const questionContent = document.createElement("div");
    questionContent.className = "question-content";

    // Create question text
    const questionText = document.createElement("p");
    questionText.className = "question-text";
    questionText.textContent = question.question;

    // Add question text to content container
    questionContent.appendChild(questionText);

    // Create options list
    const optionsList = document.createElement("ul");
    optionsList.className = "options";

    question.options.forEach((option, optionIndex) => {
      const optionItem = document.createElement("li");
      optionItem.className = "option";
      optionItem.textContent = option;
      optionItem.dataset.value = option;

      optionItem.addEventListener("click", () =>
        selectOption(index, option, optionItem)
      );

      optionsList.appendChild(optionItem);
    });

    // Add options to content container
    questionContent.appendChild(optionsList);

    // Add number badge and content to question element
    questionElement.appendChild(numberBadge);
    questionElement.appendChild(questionContent);

    questionsContainer.appendChild(questionElement);
  });
}

// Select option
function selectOption(questionIndex, option, optionElement) {
  // Remove selected class from all options in this question
  const questionElement = optionElement.closest(".question-item");
  const options = questionElement.querySelectorAll(".option");
  options.forEach((opt) => opt.classList.remove("selected"));

  // Add selected class to clicked option
  optionElement.classList.add("selected");

  // Save user's answer
  userAnswers[questionIndex] = option;
}

// Start the timer
function startTimer() {
  updateTimerDisplay();

  timerInterval = setInterval(() => {
    timeRemaining--;
    updateTimerDisplay();

    if (timeRemaining <= 0) {
      endTest();
    }
  }, 1000);
}

// Update timer display
function updateTimerDisplay() {
  // Use shared formatTime function if available
  if (window.testUtils && window.testUtils.formatTime) {
    timeRemainingElement.textContent =
      window.testUtils.formatTime(timeRemaining);
  } else {
    // Fallback to local implementation
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    timeRemainingElement.textContent = `${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  // Update timer bar
  const percentage = (timeRemaining / (45 * 60)) * 100;
  timerBar.style.width = `${percentage}%`;

  // Change color when time is running low
  if (percentage < 25) {
    timerBar.style.backgroundColor = "var(--danger-color)";
  } else if (percentage < 50) {
    timerBar.style.backgroundColor = "var(--warning-color)";
  }
}

// End the test
function endTest() {
  clearInterval(timerInterval);

  // Hide the check answers button
  if (window.testUtils && window.testUtils.hideElement) {
    window.testUtils.hideElement(actionsSection);
  } else {
    actionsSection.style.display = "none";
  }

  // Calculate time spent on test
  const timeSpent = totalTime - timeRemaining;
  let formattedTime;

  // Use the shared formatTime function if available
  if (window.testUtils && window.testUtils.formatTime) {
    formattedTime = window.testUtils.formatTime(timeSpent);
  } else {
    // Fallback to local implementation
    const minutes = Math.floor(timeSpent / 60);
    const seconds = timeSpent % 60;
    formattedTime = `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  // Update time spent displays
  topTimeSpentElement.textContent = formattedTime;
  bottomTimeSpentElement.textContent = formattedTime;

  // Calculate score and show results
  calculateScore();

  // Show correct and incorrect answers immediately
  showCorrectAnswers();
  
  // Add a retake button at the bottom
  addRetakeButton();

  // Save test results to localStorage if shared function is available
  if (window.testUtils && window.testUtils.saveToLocalStorage) {
    window.testUtils.saveToLocalStorage("grammar_test_data", {
      score: scoreElement.textContent,
      totalQuestions: totalQuestionsElement.textContent,
      timeSpent: formattedTime,
      completedDate: new Date().toISOString(),
    });
  }

  // Format time for Google Sheets - need a different format than display format
  const minutesForSheet = Math.floor((timeSpent % 3600) / 60);
  const secondsForSheet = timeSpent % 60;
  const formattedTimeForSheets = `${minutesForSheet
    .toString()
    .padStart(2, "0")}:${secondsForSheet.toString().padStart(2, "0")}`;

  // Get the score for later use
  const score = parseInt(scoreElement.textContent);

  // Prepare detailed answer data for Google Sheets
  const detailedAnswers = prepareDetailedAnswerData();

  // Try to submit results to SCORM LMS if available
  if (scorm && scorm.connection.isActive) {
    submitScormResults();
  } else {
    // If SCORM is not available, still send data to Google Sheets
    console.log(
      "SCORM not available, sending results directly to Google Sheets"
    );
    sendResultsToGoogleSheet(
      "",
      score,
      detailedAnswers,
      formattedTimeForSheets
    );
  }
}

// Calculate score and show results
function calculateScore() {
  let score = 0;

  Object.keys(userAnswers).forEach((index) => {
    if (userAnswers[index] === selectedQuestions[index].answer) {
      score++;
    }
  });

  // Update score displays in both locations
  scoreElement.textContent = score;
  topScoreElement.textContent = score;

  // Update total questions in top display
  topTotalElement.textContent = selectedQuestions.length;

  // Show results sections at top and bottom using shared functions if available
  if (window.testUtils && window.testUtils.showElement) {
    window.testUtils.showElement(resultsSection, "block");
    window.testUtils.showElement(topResultsSection, "block");
  } else {
    // Fallback to local implementation
    resultsSection.classList.remove("hidden");
    topResultsSection.classList.remove("hidden");
  }

  // Get current attempt count from SCORM or default to 1
  let attemptCount = 1;
  if (scorm && scorm.connection.isActive) {
    const suspendData = scorm.get("cmi.suspend_data");
    if (suspendData) {
      try {
        const savedData = JSON.parse(suspendData);
        attemptCount = savedData.attemptCount || 1;
      } catch (error) {
        console.error("Error parsing suspend data:", error);
      }
    }
  }

  // Add attempt count to the top results
  if (!document.getElementById("top-attempts")) {
    const attemptsElement = document.createElement("div");
    attemptsElement.id = "top-attempts";
    attemptsElement.innerHTML = `<strong>Attempt:</strong> <span>${attemptCount}</span>`;
    topResultsSection.appendChild(attemptsElement);
  } else {
    document.getElementById("top-attempts").innerHTML = `<strong>Attempt:</strong> <span>${attemptCount}</span>`;
  }

  // Disable all options
  const options = document.querySelectorAll(".option");
  options.forEach((option) => {
    option.style.pointerEvents = "none";
  });

  // Scroll to top using shared function if available
  if (window.testUtils && window.testUtils.scrollToElement) {
    window.testUtils.scrollToElement(document.body);
  } else {
    // Fallback to local implementation
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  // Show a completion notification if the shared function is available
  if (window.testUtils && window.testUtils.showNotification) {
    window.testUtils.showNotification(
      `Test completed! Your score: ${score}/${selectedQuestions.length}`,
      "success",
      5000
    );
  }
}

// Prepare detailed answer data for reporting
function prepareDetailedAnswerData() {
  // Create a compact string representation of answers
  const answersById = {};

  selectedQuestions.forEach((question, index) => {
    if (!question.id) return; // Skip if no ID

    const userAnswer = userAnswers[index] || "N/A";
    const isCorrect = userAnswer === question.answer;

    // Store in format "id: answer (correct/incorrect)"
    answersById[question.id] = {
      answer: userAnswer,
      correct: isCorrect,
    };
  });

  return answersById;
}

// Show correct answers
function showCorrectAnswers() {
  const questionItems = document.querySelectorAll(".question-item");

  questionItems.forEach((item, index) => {
    const options = item.querySelectorAll(".option");
    const correctAnswer = selectedQuestions[index].answer;
    const userAnswer = userAnswers[index];
    const questionContent = item.querySelector(".question-content");

    // Create status indicator
    const statusIndicator = document.createElement("div");
    statusIndicator.className = "status-indicator";

    // Check if question was answered
    if (userAnswer) {
      // Add class to question box based on whether answer is correct
      if (userAnswer === correctAnswer) {
        item.classList.add("correct");
        statusIndicator.textContent = "Correct";
        statusIndicator.classList.add("status-correct");
      } else {
        item.classList.add("incorrect");
        statusIndicator.textContent =
          "Incorrect - Correct answer: " + correctAnswer;
        statusIndicator.classList.add("status-incorrect");
      }
    } else {
      // Question was not answered
      item.classList.add("unanswered");
      statusIndicator.textContent =
        "Not answered - Correct answer: " + correctAnswer;
      statusIndicator.classList.add("status-unanswered");
    }

    // Add status indicator to the question content
    questionContent.appendChild(statusIndicator);

    // Mark the correct option
    options.forEach((option) => {
      if (option.dataset.value === correctAnswer) {
        option.classList.add("correct");
      } else if (
        option.dataset.value === userAnswer &&
        userAnswer !== correctAnswer
      ) {
        option.classList.add("incorrect");
      }
    });
  });
}

// SCORM-related functions
let scorm;

// Initialize SCORM connection
function initScorm() {
  scorm = pipwerks.SCORM;

  // Initialize connection to the LMS
  console.log("Initializing SCORM connection...");
  const connected = scorm.init();

  if (connected) {
    console.log("SCORM connection established successfully");

    // Check if the user has already completed this test
    const lessonStatus = scorm.get("cmi.core.lesson_status");
    const suspendData = scorm.get("cmi.suspend_data");

    console.log(
      "Lesson status:",
      lessonStatus,
      "Suspend data available:",
      !!suspendData
    );

    // Check if the test was already completed
    if (lessonStatus === "completed") {
      if (suspendData) {
        try {
          // Parse the suspended data (previously saved answers)
          const savedData = JSON.parse(suspendData);
          console.log("Found previous test attempt:", savedData);

          // Check if we have enough data to show previous results
          // Look for either questionIds (new format) or selectedQuestions (old format)
          if (
            (savedData.questionIds && savedData.questionIds.length > 0) ||
            (savedData.selectedQuestions &&
              savedData.selectedQuestions.length > 0) ||
            (savedData.answers && Object.keys(savedData.answers).length > 0)
          ) {
            // Show previous results (async function)
            showPreviousResults(savedData).catch((error) => {
              console.error("Error displaying previous results:", error);
              startNewTest();
            });
            return connected;
          } else {
            console.warn(
              "Previous test data found but incomplete. Starting new test."
            );
          }
        } catch (error) {
          console.error("Error parsing suspended data:", error);
          // Continue to start a new test
        }
      } else {
        // Completed but no suspend data, likely an issue with data storage
        console.warn(
          "Test was marked as completed but no saved answers were found."
        );

        // Try using the scorm.debug function to get more information
        if (scorm.debug && typeof scorm.debug.getCode === "function") {
          const errorCode = scorm.debug.getCode();
          const errorString = scorm.debug.getInfo(errorCode);
          const errorDiagnostic = scorm.debug.getDiagnosticInfo(errorCode);
          console.warn(`SCORM Error: ${errorCode} - ${errorString}`);
          console.warn(`SCORM Diagnostic: ${errorDiagnostic}`);
        }

        // We'll start a fresh test in this case
        console.log("Starting a fresh test session");
      }
    }

    // If no previous attempt or parsing error, set up for a new attempt
    scorm.set("cmi.core.lesson_status", "incomplete");
    scorm.set("cmi.core.session_time", "00:00:00");

    // Ensure we save this initial state
    const saveSuccess = scorm.save();
    console.log("Initial SCORM state saved:", saveSuccess);
  } else {
    console.error("Failed to establish SCORM connection");
  }

  return connected;
}

// Send results to Google Spreadsheet
function sendResultsToGoogleSheet(name, score, answers, timeSpent) {
  // The URL should be replaced with your Google Apps Script Web App URL
  const GOOGLE_SHEET_URL =
    "https://script.google.com/macros/s/AKfycbxZKrhA-wXc_7ymR1wOwX-W_GzyMZwXqj3ORdvJ84QCibx2gt9_D5FvicLJdrXj36nJOQ/exec";

  // Try to get student information from SCORM LMS
  let studentName = "Anonymous";
  let studentId = "";

  if (scorm && scorm.connection.isActive) {
    // Try to get student name from various SCORM fields
    studentName =
      scorm.get("cmi.core.student_name") ||
      scorm.get("cmi.student_name") ||
      scorm.get("cmi.learner_name") ||
      name ||
      "Anonymous";

    // Try to get student ID
    studentId =
      scorm.get("cmi.core.student_id") ||
      scorm.get("cmi.student_id") ||
      scorm.get("cmi.learner_id") ||
      "";
  } else if (name) {
    studentName = name;
  }

  // If no name is available from SCORM, check if we should prompt the user
  if (studentName === "Anonymous" && !name) {
    // Ask user for their name if not in SCORM
    const userName = prompt("Please enter your name for the results:", "");
    if (userName && userName.trim() !== "") {
      studentName = userName.trim();
    }
  }

  // Get attempt count if available from SCORM
  let attemptCount = 1;
  if (scorm && scorm.connection.isActive) {
    const suspendData = scorm.get("cmi.suspend_data");
    if (suspendData) {
      try {
        const savedData = JSON.parse(suspendData);
        attemptCount = savedData.attemptCount || 1;
      } catch (error) {
        console.error("Error parsing attempt count:", error);
      }
    }
  }

  // Prepare data to send
  const data = {
    testType: "Grammar Test",
    name: studentName,
    studentId: studentId,
    score: score,
    totalQuestions: selectedQuestions.length,
    scorePercentage: Math.round((score / selectedQuestions.length) * 100),
    timeSpent: timeSpent,
    date: new Date().toISOString(),
    attemptNumber: attemptCount,
    answers: answers, // This should be an array of objects from prepareDetailedAnswerData()
  };

  console.log("Sending results to Google Sheet:", data);

  // Log data for debugging
  console.log("Sending data to Google Sheet:", data);

  // Convert answers to a compact string format
  let answersString = "";
  if (data.answers && typeof data.answers === "object") {
    // Format as "id:answer(✓/✗),id2:answer(✓/✗)"
    const answerParts = [];

    for (const id in data.answers) {
      if (data.answers.hasOwnProperty(id)) {
        const answerObj = data.answers[id];
        const statusMark = answerObj.correct ? "(✓)" : "(✗)";
        answerParts.push(`${id}:${answerObj.answer}${statusMark}`);
      }
    }

    // Join with commas
    answersString = answerParts.join(", ");
  }

  // Replace the answers object with the string representation
  data.answers = answersString;

  // Send data to Google Sheet
  fetch(GOOGLE_SHEET_URL, {
    method: "POST",
    mode: "no-cors",
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json" },
  })
    .then((res) => res.text())
    .then((res) => {
      console.log("Google Sheet response:", res);

      // Show success notification if available
      if (window.testUtils && window.testUtils.showNotification) {
        window.testUtils.showNotification(
          "Results submitted successfully!",
          "success",
          3000
        );
      }
    })
    .catch((err) => {
      console.error("Error sending results to Google Sheet:", err);

      // Show error notification if available
      if (window.testUtils && window.testUtils.showNotification) {
        window.testUtils.showNotification(
          "Failed to submit results to server",
          "error",
          5000
        );
      }
    });
}

// Submit results to SCORM LMS
function submitScormResults() {
  if (!scorm || !scorm.connection.isActive) {
    console.warn("SCORM connection is not active, cannot submit results");
    return;
  }

  try {
    // Get score from DOM
    const score = parseInt(scoreElement.textContent);
    const totalQuestions = parseInt(totalQuestionsElement.textContent);

    // Calculate score as a percentage (normalized between 0-100)
    const scorePercentage = Math.round((score / totalQuestions) * 100);

    // Set the score
    scorm.set("cmi.core.score.raw", scorePercentage);
    scorm.set("cmi.core.score.min", "0");
    scorm.set("cmi.core.score.max", "100");

    // Calculate session time
    const timeSpent = totalTime - timeRemaining;
    const hours = Math.floor(timeSpent / 3600);
    const minutes = Math.floor((timeSpent % 3600) / 60);
    const seconds = timeSpent % 60;
    const scormTime = `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

    // Format time for display and Google Sheets
    const formattedTime = `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;

    // Set session time
    scorm.set("cmi.core.session_time", scormTime);

    // Always set lesson status to "completed" when test is submitted
    scorm.set("cmi.core.lesson_status", "completed");
    console.log("SCORM test marked as completed");

    // Get current attempt count or initialize to 1
    let attemptCount = 1;
    const suspendData = scorm.get("cmi.suspend_data");
    if (suspendData) {
      try {
        const savedData = JSON.parse(suspendData);
        attemptCount = savedData.attemptCount || 1;
      } catch (error) {
        console.error("Error parsing suspend data:", error);
      }
    }

    // Create a minimal version storing just question IDs and user answers
    const answersById = {};

    // Convert userAnswers to use question IDs
    Object.keys(userAnswers).forEach((index) => {
      const questionId = selectedQuestions[index].id;
      if (questionId) {
        answersById[questionId] = userAnswers[index];
      }
    });

    // Store selected question IDs (for retrieval later)
    const selectedQuestionIds = selectedQuestions.map((q) => q.id);

    // Create data object to save (minimal version)
    const dataToSave = {
      questionIds: selectedQuestionIds,
      answers: answersById,
      attemptCount: attemptCount,
      score: score,
      totalQuestions: totalQuestions,
      timeSpent: formattedTime,
      completedDate: new Date().toISOString(),
    };

    // Convert to string and log size
    const jsonData = JSON.stringify(dataToSave);
    console.log("Suspend data size (bytes):", jsonData.length);

    // Check if the data is too large for some SCORM implementations
    if (jsonData.length > 4000) {
      console.warn(
        `SCORM data is ${jsonData.length} bytes, which may exceed limits for some SCORM 1.2 implementations`
      );

      // Try to reduce the data size if it's too large
      if (jsonData.length > 64000) {
        // Absolute maximum for most implementations
        // Create an even more compact version with minimal data
        const minimalData = {
          score: score,
          totalQuestions: totalQuestions,
          attemptCount: attemptCount,
          completedDate: new Date().toISOString(),
        };
        console.warn("Data exceeds safe limits. Saving minimal data only.");
        scorm.set("cmi.suspend_data", JSON.stringify(minimalData));
      } else {
        // Try with the original data but warn about potential issues
        scorm.set("cmi.suspend_data", jsonData);
      }
    } else {
      // Data size is acceptable, proceed normally
      scorm.set("cmi.suspend_data", jsonData);
    }

    // Save all data to the LMS
    const success = scorm.save();
    console.log("SCORM save result:", success);

    // Verify data was saved properly by reading it back
    if (success) {
      const savedSuspendData = scorm.get("cmi.suspend_data");
      if (!savedSuspendData) {
        console.warn(
          "SCORM data was supposedly saved successfully but suspend_data is empty!"
        );
      } else {
        console.log("SCORM data verified - suspend_data is populated");
      }
    }

    // Get detailed answers for Google Sheets
    const detailedAnswers = prepareDetailedAnswerData();

    // Always send data to Google Sheets, regardless of SCORM success
    sendResultsToGoogleSheet("", score, detailedAnswers, formattedTime);

    if (success) {
      console.log(
        `SCORM data successfully saved. Score: ${scorePercentage}%, Time: ${scormTime}`
      );
    } else {
      console.error("Failed to save SCORM data");
    }
  } catch (error) {
    console.error("Error submitting SCORM results:", error);
  }
}

// Function to show previous test results
async function showPreviousResults(savedData) {
  // Set a flag to indicate we're showing previous results
  window.showingPreviousResults = true;

  // Hide the original test interface
  questionsContainer.innerHTML = "";

  // Show loading indicator
  questionsContainer.innerHTML =
    '<div class="loading">Loading previous results...<div class="spinner"></div></div>';

  // Get previous answers and question IDs with fallbacks for missing data
  const questionIds = savedData.questionIds || [];
  const answers = savedData.answers || {};
  const attemptCount = savedData.attemptCount || 1;

  // Handle case where no questions/answers are available
  if (!questionIds.length && !Object.keys(answers).length) {
    console.error("No previous question IDs or answers found in saved data");
    // Start a new test instead
    startNewTest();
    return;
  }

  // Fetch all questions by ID to determine correct answers
  let questionsById = {};
  try {
    questionsById = await fetchQuestionsById();
  } catch (error) {
    console.error("Error fetching questions:", error);
  }

  // Use the saved score directly
  const correctAnswers = savedData.score || 0;
  const totalPrevQuestions =
    savedData.totalQuestions ||
    questionIds.length ||
    Object.keys(answers).length;
  const scorePercentage = Math.round(
    (correctAnswers / totalPrevQuestions) * 100
  );

  // Create an array of questions from the saved questionIds
  const previousQuestions = [];
  if (questionIds.length > 0) {
    for (const questionId of questionIds) {
      if (questionsById[questionId]) {
        previousQuestions.push(questionsById[questionId]);
      }
    }
  } else {
    // If no questionIds, try to reconstruct from answers
    for (const questionId in answers) {
      if (questionsById[questionId]) {
        previousQuestions.push(questionsById[questionId]);
      }
    }
  }

  // Show top results section
  if (window.testUtils && window.testUtils.showElement) {
    window.testUtils.showElement(topResultsSection, "block");
  } else {
    topResultsSection.classList.remove("hidden");
  }

  // Update score elements
  scoreElement.textContent = correctAnswers;
  topScoreElement.textContent = correctAnswers;
  totalQuestionsElement.textContent = totalPrevQuestions;
  topTotalElement.textContent = totalPrevQuestions;
  
  // Add attempt count to the top results
  if (!document.getElementById("top-attempts")) {
    const attemptsElement = document.createElement("div");
    attemptsElement.id = "top-attempts";
    attemptsElement.innerHTML = `<strong>Attempt:</strong> <span>${attemptCount}</span>`;
    topResultsSection.appendChild(attemptsElement);
  } else {
    document.getElementById("top-attempts").innerHTML = `<strong>Attempt:</strong> <span>${attemptCount}</span>`;
  }

  // Render questions with previous answers
  questionsContainer.innerHTML = "";
  
  // Create a "Previous Results" header
  const resultsHeader = document.createElement("h2");
  resultsHeader.className = "previous-results-header";
  resultsHeader.textContent = "Your Previous Test Results";
  questionsContainer.appendChild(resultsHeader);

  // Render each question
  previousQuestions.forEach((question, index) => {
    const questionId = question.id;
    let userAnswer = "";
    let isCorrect = false;

    // Get the user's answer for this question
    if (answers[questionId]) {
      if (typeof answers[questionId] === "object") {
        // New format: {answer: "value", correct: true/false}
        userAnswer = answers[questionId].answer;
        isCorrect = answers[questionId].correct;
      } else {
        // Old format: direct string values
        userAnswer = answers[questionId];
        isCorrect = userAnswer === question.answer;
      }
    }

    const questionElement = document.createElement("div");
    questionElement.className = "question-item";
    questionElement.dataset.index = index;

    // Add class based on answer correctness
    if (userAnswer) {
      if (isCorrect) {
        questionElement.classList.add("correct");
      } else {
        questionElement.classList.add("incorrect");
      }
    } else {
      questionElement.classList.add("unanswered");
    }

    // Create number badge div
    const numberBadge = document.createElement("div");
    numberBadge.className = "question-number";
    numberBadge.textContent = `${index + 1}`;

    // Create question content container
    const questionContent = document.createElement("div");
    questionContent.className = "question-content";

    // Create question text
    const questionText = document.createElement("p");
    questionText.className = "question-text";
    questionText.textContent = question.question;

    // Add question text to content container
    questionContent.appendChild(questionText);

    // Create options list
    const optionsList = document.createElement("ul");
    optionsList.className = "options";

    // Add options
    question.options.forEach((option) => {
      const optionItem = document.createElement("li");
      optionItem.className = "option";
      optionItem.textContent = option;
      optionItem.dataset.value = option;
      
      // Mark selected and correct/incorrect
      if (option === userAnswer) {
        optionItem.classList.add("selected");
        if (option === question.answer) {
          optionItem.classList.add("correct");
        } else {
          optionItem.classList.add("incorrect");
        }
      } else if (option === question.answer) {
        // Mark correct option
        optionItem.classList.add("correct");
      }
      
      // Disable pointer events
      optionItem.style.pointerEvents = "none";
      
      optionsList.appendChild(optionItem);
    });

    // Add options to content container
    questionContent.appendChild(optionsList);

    // Create status indicator
    const statusIndicator = document.createElement("div");
    statusIndicator.className = "status-indicator";

    if (userAnswer) {
      if (isCorrect) {
        statusIndicator.textContent = "Correct";
        statusIndicator.classList.add("status-correct");
      } else {
        statusIndicator.textContent = "Incorrect - Correct answer: " + question.answer;
        statusIndicator.classList.add("status-incorrect");
      }
    } else {
      statusIndicator.textContent = "Not answered - Correct answer: " + question.answer;
      statusIndicator.classList.add("status-unanswered");
    }

    questionContent.appendChild(statusIndicator);

    // Add number badge and content to question element
    questionElement.appendChild(numberBadge);
    questionElement.appendChild(questionContent);

    questionsContainer.appendChild(questionElement);
  });

  // Add a retake button at the bottom using the shared function
  addRetakeButton();

  // Hide the original check answers button
  if (window.testUtils && window.testUtils.hideElement) {
    window.testUtils.hideElement(actionsSection);
  } else {
    actionsSection.style.display = "none";
  }
}

// Function to start a completely new test
function startNewTest() {
  console.log("Starting new test...");

  // Reset all test variables
  selectedQuestions = [];
  userAnswers = {};
  timeRemaining = 45 * 60;

  // Clear any existing content
  questionsContainer.innerHTML = "";

  // Show the check answers button
  if (window.testUtils && window.testUtils.showElement) {
    window.testUtils.showElement(actionsSection, "block");
  } else {
    actionsSection.style.display = "block";
  }

  // Hide results sections
  if (window.testUtils && window.testUtils.hideElement) {
    window.testUtils.hideElement(resultsSection);
    window.testUtils.hideElement(topResultsSection);
  } else {
    resultsSection.classList.add("hidden");
    topResultsSection.classList.add("hidden");
  }

  // Restart the test
  fetchQuestions();
  startTimer();
}

// Add a retake button to the bottom of the results
function addRetakeButton() {
  // Check if a retake button already exists
  if (document.querySelector('.retake-btn')) {
    return;
  }
  
  // Create retake button
  const retakeButton = document.createElement("button");
  retakeButton.className = "btn btn-primary retake-btn";
  retakeButton.textContent = "Retake Test";
  retakeButton.addEventListener("click", retakeTest);

  // Create a button container
  const buttonContainer = document.createElement("div");
  buttonContainer.className = "button-container text-center my-4";
  buttonContainer.appendChild(retakeButton);
  
  // Add it at the bottom of the questions container
  questionsContainer.appendChild(buttonContainer);
}

// Function to retake the test
function retakeTest() {
  console.log("Retaking test...");

  // Increment attempt count if available in SCORM data
  let attemptCount = 1;
  if (scorm && scorm.connection.isActive) {
    const suspendData = scorm.get("cmi.suspend_data");
    if (suspendData) {
      try {
        const savedData = JSON.parse(suspendData);
        attemptCount = (savedData.attemptCount || 0) + 1;
      } catch (error) {
        console.error("Error parsing attempt count:", error);
      }
    }
  }

  // Reset all test variables
  selectedQuestions = [];
  userAnswers = {};
  timeRemaining = 45 * 60;

  // Clear the previous results
  questionsContainer.innerHTML = "";

  // Reset SCORM if connected
  if (scorm && scorm.connection.isActive) {
    // Set status back to incomplete for this new attempt
    scorm.set("cmi.core.lesson_status", "incomplete");
    scorm.set("cmi.core.session_time", "00:00:00");

    // Store the attempt count
    scorm.set("cmi.suspend_data", JSON.stringify({ attemptCount }));
    scorm.save();
  }

  // Show the check answers button again, renamed to "Complete"
  if (window.testUtils && window.testUtils.showElement) {
    window.testUtils.showElement(actionsSection, "block");
  } else {
    actionsSection.style.display = "block";
  }

  // Hide results sections
  if (window.testUtils && window.testUtils.hideElement) {
    window.testUtils.hideElement(resultsSection);
    window.testUtils.hideElement(topResultsSection);
  } else {
    resultsSection.classList.add("hidden");
    topResultsSection.classList.add("hidden");
  }
  
  // Re-attach the event listener to the Complete button
  // First remove any existing listeners by cloning and replacing the button
  const oldButton = checkAnswersBtn;
  const newButton = oldButton.cloneNode(true);
  oldButton.parentNode.replaceChild(newButton, oldButton);
  
  // Update our reference to the button and attach a new listener
  const updatedButton = document.getElementById("check-answers");
  updatedButton.addEventListener("click", endTest);
  console.log("Reattached event listener to Complete button");

  // Restart the test
  fetchQuestions();
  startTimer();
}

// Close SCORM connection
function closeScorm() {
  if (scorm && scorm.connection.isActive) {
    scorm.quit();
    console.log("SCORM connection terminated");
  }
}

// Handle window unload event to ensure SCORM connection is properly closed
window.addEventListener("beforeunload", closeScorm);

// Event listeners
document.addEventListener("DOMContentLoaded", () => {
  console.log("Grammar test page loaded");

  // Initialize SCORM connection
  const scormConnected = initScorm();
  console.log("SCORM connection initialized:", scormConnected);

  // Only fetch questions and start the test if we're not showing previous results
  // (which happens in the initScorm function if applicable)
  if (!window.showingPreviousResults) {
    console.log("Starting new test session");

    // Fetch questions and start the test
    fetchQuestions();

    // Add event listener for check answers/complete button
    checkAnswersBtn.addEventListener("click", endTest);
  }
});

// This function fetches the questions from questions.json and
// returns the original questions with correct answers by ID
async function fetchQuestionsById() {
  try {
    const response = await fetch("questions.json");
    const data = await response.json();

    // Create a map of questions by ID
    const questionsById = {};

    // Process all question sets
    [
      "question_set_1",
      "question_set_2",
      "question_set_3",
      "question_set_4",
    ].forEach((setKey) => {
      if (data[setKey] && Array.isArray(data[setKey])) {
        data[setKey].forEach((question) => {
          if (question.id) {
            questionsById[question.id] = question;
          }
        });
      }
    });

    return questionsById;
  } catch (error) {
    console.error("Error fetching questions by ID:", error);
    return {};
  }
}

