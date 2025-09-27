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
const topResultsSection = document.getElementById("top-results");
const topScoreElement = document.getElementById("top-score");
const topTotalElement = document.getElementById("top-total");
const timeRemainingElement = document.getElementById("time-remaining");
const topTimeSpentElement = document.getElementById("top-time-spent");
const timerBar = document.getElementById("timer-bar");

// Fetch and initialize questions
async function fetchQuestions() {
    try {
        const response = await fetch("questions.json");
        const data = await response.json();
        
        questions = {
            set1: data.question_set_1,
            set2: data.question_set_2,
            set3: data.question_set_3,
            set4: data.question_set_4
        };

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
                    
                    // Check if more than 40 minutes have passed
                    const now = Date.now();
                    const elapsedTime = now - savedState.startTime;
                    if (elapsedTime >= testDuration) {
                        await endTest(true); // End test and submit results
                        return;
                    }

                    // Restore previous state
                    console.log("Restoring saved state:", savedState);
                    startTimestamp = savedState.startTime;
                    userAnswers = savedState.answers || {};
                    
                    // Load questions and restore state
                    await fetchQuestions();
                    selectedQuestions = savedState.questionIds.map(id => {
                        const [set, num] = id.split('_');
                        return questions[`set${set}`][num - 1];
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

        // Start fresh test
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
    
    // Calculate score
    let score = 0;
    Object.keys(userAnswers).forEach(index => {
        if (userAnswers[index] === selectedQuestions[index].answer) {
            score++;
        }
    });

    // Hide questions and show results
    questionsContainer.style.display = "none";
    actionsSection.style.display = "none";
    
    // Show score
    topScoreElement.textContent = score;
    topTotalElement.textContent = totalQuestions;
    topResultsSection.classList.remove("hidden");
    
    // Calculate time spent
    const timeSpent = Math.min(Date.now() - startTimestamp, testDuration);
    const minutes = Math.floor(timeSpent / 60000);
    const seconds = Math.floor((timeSpent % 60000) / 1000);
    const formattedTime = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    topTimeSpentElement.textContent = formattedTime;

    // Submit to SCORM
    if (isScormMode) {
        console.log("Submitting final score:", score);
        
        // Set score
        scorm.set("cmi.core.score.raw", score);
        scorm.set("cmi.core.score.min", "0");
        scorm.set("cmi.core.score.max", "50");
        
        // Set completion status
        scorm.set("cmi.core.lesson_status", "completed");
        
        // Clear suspend data since test is complete
        scorm.set("cmi.suspend_data", "");
        
        scorm.save();
    }

    // Send to Google Sheets
    await sendToGoogleSheets(score, formattedTime);

    // Show completion message
    showNotification(isTimeout ? "Time's up! Test submitted." : "Test completed successfully!");
}

// Show completed state
function showCompletedState() {
    const score = scorm.get("cmi.core.score.raw");
    document.body.innerHTML = `
        <div class="container">
            <div class="score-board">
                <h1>Test Completed</h1>
                <p>You have already completed this test.</p>
                <div class="score-content">
                    <div class="score-value">Score: ${score}/50</div>
                </div>
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
    
    const data = {
        testType: "Grammar Test",
        name: studentName,
        studentId: studentId,
        score: score,
        totalQuestions: totalQuestions,
        timeSpent: timeSpent,
        date: new Date().toISOString()
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