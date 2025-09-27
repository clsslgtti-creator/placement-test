// Global variables
let questions = {};
let selectedQuestions = [];
const totalQuestions = 50;
const testDuration = 40 * 60 * 1000; // 40 minutes in milliseconds
let startTimestamp = null;
let timerInterval;
let userAnswers = {};
let isScormMode = false;
let scorm;

// DOM elements
const questionsContainer = document.getElementById("questions-container");
const checkAnswersBtn = document.getElementById("check-answers");
const actionsSection = document.querySelector(".actions");
const timeRemainingElement = document.getElementById("time-remaining");
const timerBar = document.getElementById("timer-bar");

// Load questions only without initializing
async function loadQuestionsOnly() {
    try {
        const response = await fetch("questions.json");
        const data = await response.json();
        
        questions = {
            set1: data.question_set_1,
            set2: data.question_set_2,
            set3: data.question_set_3,
            set4: data.question_set_4
        };
    } catch (error) {
        console.error("Error loading questions:", error);
        questionsContainer.innerHTML = '<p class="error">Failed to load questions.</p>';
    }
}

// Fetch and initialize questions for new test
async function fetchQuestions() {
    try {
        await loadQuestionsOnly();
        selectRandomQuestions();
        initializeTest();
        renderQuestions();
        startTimer();
    } catch (error) {
        console.error("Error loading questions:", error);
        questionsContainer.innerHTML = '<p class="error">Failed to load questions.</p>';
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
                    
                    // Check if more than 40 minutes have passed from the original start time
                    const now = Date.now();
                    const originalStartTime = parseInt(savedState.startTime);
                    const elapsedTime = now - originalStartTime;
                    
                    if (elapsedTime >= testDuration) {
                        await endTest(true); // End test and submit results
                        return;
                    }

                    // Restore previous state
                    console.log("Restoring saved state:", savedState);
                    startTimestamp = originalStartTime; // Use the original start time
                    userAnswers = savedState.answers || {};
                    
                    // Load questions but don't select new ones
                    await loadQuestionsOnly();
                    selectedQuestions = savedState.questionIds.map(id => {
                        const [set, num] = id.split('_');
                        return questions[`set${set}`][parseInt(num) - 1];
                    });
                    
                    renderQuestions();
                    restoreUserAnswers();
                    startTimer();
                    return;
                } catch (error) {
                    console.error("Error restoring state:", error);
                }
            }
        }

        // Start fresh test only if no saved state exists
        await fetchQuestions();
        
    } catch (error) {
        console.error("SCORM error:", error);
        await fetchQuestions(); // Fall back to non-SCORM mode
    }
}

// Initialize new test
function initializeTest() {
    startTimestamp = Date.now();
    userAnswers = {};
    
    if (isScormMode) {
        const initialState = {
            startTime: startTimestamp,
            questionIds: selectedQuestions.map(q => q.id),
            answers: {}
        };
        console.log("Saving initial state:", initialState);
        scorm.set("cmi.suspend_data", JSON.stringify(initialState));
        scorm.save();
    }
}

// Select random questions
function selectRandomQuestions() {
    selectedQuestions = [];
    const sets = ["set1", "set2", "set3", "set4"];
    
    for (let i = 0; i < totalQuestions; i++) {
        const randomSet = sets[Math.floor(Math.random() * sets.length)];
        const questionIndex = i % questions[randomSet].length;
        const question = JSON.parse(JSON.stringify(questions[randomSet][questionIndex]));
        question.options = shuffleArray(question.options);
        selectedQuestions.push(question);
    }

    selectedQuestions = shuffleArray(selectedQuestions);
}

// Render questions to page
function renderQuestions() {
    questionsContainer.innerHTML = "";
    
    selectedQuestions.forEach((question, index) => {
        const questionElement = document.createElement("div");
        questionElement.className = "question-item";
        questionElement.dataset.index = index;

        questionElement.innerHTML = `
            <div class="question-number">${index + 1}</div>
            <div class="question-content">
                <p class="question-text">${question.question}</p>
                <ul class="options">
                    ${question.options.map(option => `
                        <li class="option" data-value="${option}">${option}</li>
                    `).join("")}
                </ul>
            </div>
        `;

        // Add click listeners to options
        questionElement.querySelectorAll(".option").forEach(option => {
            option.addEventListener("click", () => 
                selectOption(index, option.dataset.value, option)
            );
        });

        questionsContainer.appendChild(questionElement);
    });
}

// Handle answer selection
function selectOption(questionIndex, option, optionElement) {
    // Remove previous selection
    const questionElement = optionElement.closest(".question-item");
    questionElement.querySelectorAll(".option").forEach(opt => opt.classList.remove("selected"));
    
    // Mark new selection
    optionElement.classList.add("selected");
    userAnswers[questionIndex] = option;

    // Save progress in SCORM
    if (isScormMode) {
        const currentState = {
            startTime: startTimestamp,
            questionIds: selectedQuestions.map(q => q.id),
            answers: userAnswers
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
    timeRemainingElement.textContent = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

    const percentage = (remainingTime / testDuration) * 100;
    timerBar.style.width = `${percentage}%`;
    timerBar.style.backgroundColor = percentage < 25 ? "var(--danger-color)" : 
                                   percentage < 50 ? "var(--warning-color)" : 
                                   "var(--primary-color)";
}

// End test and submit results
async function endTest(isTimeout = false) {
    clearInterval(timerInterval);

    // Hide questions and show results
    questionsContainer.style.display = "none";
    actionsSection.style.display = "none";
    document.querySelector('.instructions').style.display = "none";
    document.querySelector('.timer').style.display = "none";
    document.querySelector('.timer-container').style.display = "none";

    // Calculate score and time
    const finalScore = Object.keys(userAnswers).reduce((total, index) => {
        return total + (userAnswers[index] === selectedQuestions[index].answer ? 1 : 0);
    }, 0);
    
    // Calculate time spent
    const testTimeSpent = Math.min(Date.now() - startTimestamp, testDuration);
    const testMinutes = Math.floor(testTimeSpent / 60000);
    const testSeconds = Math.floor((testTimeSpent % 60000) / 1000);
    const timeDisplay = `${testMinutes.toString().padStart(2, "0")}:${testSeconds.toString().padStart(2, "0")}`;
    const completionDate = new Date();
    const completionTime = completionDate.toLocaleString();
    const completionIso = completionDate.toISOString();
    
    // Create completion message
    const completionDiv = document.createElement('div');
    completionDiv.className = 'completion-message';
    
    completionDiv.innerHTML = `
        <div class="tick-icon"></div>
        <h2>Test Completed!</h2>
        <p class="completion-info">Grammar Test Completed Successfully</p>
        <div class="score-display">${finalScore}/${totalQuestions}</div>
        <p class="time-spent">Time Spent: ${timeDisplay}</p>
        <p class="completion-time">Completed at: ${completionTime}</p>
    `;
    
    document.querySelector('.container').appendChild(completionDiv);

    // Submit to SCORM
    if (isScormMode) {
        console.log("Submitting final score:", finalScore);
        
        // Set score
        scorm.set("cmi.core.score.raw", finalScore);
        scorm.set("cmi.core.score.min", "0");
        scorm.set("cmi.core.score.max", "50");
        
        // Set completion status
        scorm.set("cmi.core.lesson_status", "completed");
        
        // Persist completion metadata
        const completionData = {
            completedAt: completionIso,
            timeSpent: timeDisplay
        };
        scorm.set("cmi.suspend_data", JSON.stringify(completionData));
        
        scorm.save();
    }

    // Send to Google Sheets
    await sendToGoogleSheets(finalScore, timeDisplay);

    // Show completion message
    showNotification(isTimeout ? "Time's up! Test submitted." : "Test completed successfully!");
}

// Show completed state
function showCompletedState() {
    const score = scorm.get("cmi.core.score.raw");
    const suspendData = scorm.get("cmi.suspend_data");
    let completedAtDisplay = null;
    let timeSpentDisplay = null;

    if (suspendData) {
        try {
            const parsedData = JSON.parse(suspendData);
            if (parsedData.completedAt) {
                const parsedDate = new Date(parsedData.completedAt);
                if (!Number.isNaN(parsedDate.getTime())) {
                    completedAtDisplay = parsedDate.toLocaleString();
                }
            }
            if (parsedData.timeSpent) {
                timeSpentDisplay = parsedData.timeSpent;
            }
        } catch (error) {
            console.error("Error parsing completion data:", error);
        }
    }

    const completedAtText = completedAtDisplay || "Unavailable";
    const timeSpentText = timeSpentDisplay || "Unavailable";

    document.body.innerHTML = `
        <div class="container">
            <div class="completion-message">
                <div class="tick-icon"></div>
                <h2>Test Already Completed</h2>
                <p class="completion-info">Grammar Test was completed in a previous session</p>
                <div class="score-display">${score}/50</div>
                <p class="time-spent">Time Spent: ${timeSpentText}</p>
                <p class="completion-time">Completed at: ${completedAtText}</p>
            </div>
        </div>
    `;
}

// Restore user's previous answers
function restoreUserAnswers() {
    Object.keys(userAnswers).forEach(index => {
        const answer = userAnswers[index];
        const questionElement = document.querySelector(`.question-item[data-index="${index}"]`);
        if (questionElement) {
            const option = Array.from(questionElement.querySelectorAll('.option'))
                               .find(opt => opt.dataset.value === answer);
            if (option) {
                option.classList.add("selected");
            }
        }
    });
}

// Send results to Google Sheets
async function sendToGoogleSheets(score, timeSpent) {
    const SHEETS_URL = "https://script.google.com/macros/s/AKfycbxZKrhA-wXc_7ymR1wOwX-W_GzyMZwXqj3ORdvJ84QCibx2gt9_D5FvicLJdrXj36nJOQ/exec";
    
    let studentName = "Anonymous";
    let studentId = "";
    
    if (isScormMode) {
        studentName = scorm.get("cmi.core.student_name") || "Anonymous";
        studentId = scorm.get("cmi.core.student_id") || "";
    }

    // Prepare detailed answer data
    let answersString = "";
    selectedQuestions.forEach((question, index) => {
        const userAnswer = userAnswers[index] || "N/A";
        const isCorrect = userAnswer === question.answer;
        answersString += `${question.id}: ${userAnswer} (${isCorrect ? '✓' : '✗'}), `;
    });

    // Remove trailing comma
    answersString = answersString.replace(/,$/, '');
    
    const data = {
        testType: "Grammar Test",
        name: studentName,
        studentId: studentId,
        score: score,
        totalQuestions: totalQuestions,
        scorePercentage: Math.round((score / totalQuestions) * 100),
        timeSpent: timeSpent,
        date: new Date().toISOString(),
        answers: answersString // Added detailed answers
    };

    try {
        console.log("Sending to Google Sheets:", data);
        await fetch(SHEETS_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });
    } catch (error) {
        console.error("Error sending to Google Sheets:", error);
    }
}

// Utility function to shuffle array
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Show notification
function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification success';
    notification.innerHTML = `<i class="fas fa-check-circle"></i>${message}`;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
    console.log("Page loaded, initializing SCORM...");
    initScorm();
    
    // Add event listener for complete button
    if (checkAnswersBtn) {
        checkAnswersBtn.addEventListener("click", () => endTest(false));
    }
    
    // Handle page unload
    window.addEventListener("beforeunload", () => {
        if (scorm && scorm.connection.isActive) {
            scorm.quit();
        }
    });
});