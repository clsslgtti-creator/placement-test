(() => {
  const TOTAL_QUESTIONS = 50;
  const TEST_DURATION_MS = 40 * 60 * 1000;

  const els = {
    setSelect: document.getElementById("set-select"),
    startBtn: document.getElementById("start-demo"),
    meta: document.getElementById("demo-meta"),
    questions: document.getElementById("questions-container"),
    completeBtn: document.getElementById("check-answers"),
    time: document.getElementById("time-remaining"),
    timerBar: document.getElementById("timer-bar"),
    container: document.querySelector(".container"),
  };

  let bank = {};
  let selectedQuestions = [];
  let selectedMode = "";
  let userAnswers = {};
  let startTimestamp = null;
  let timerInterval = null;
  let finished = false;

  function shuffleArray(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function toTime(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  async function loadBank() {
    const response = await fetch("questions.json");
    bank = await response.json();

    const options = ['<option value="__random__">Random 50 questions (live behavior)</option>']
      .concat(
        Object.keys(bank).map((key) => `<option value="${key}">${key}</option>`)
      )
      .join("");

    els.setSelect.innerHTML = options;
    els.meta.textContent = "Ready. Choose a mode to begin.";
  }

  function startDemo() {
    els.container.querySelector(".completion-message")?.remove();
    finished = false;
    userAnswers = {};
    startTimestamp = Date.now();
    selectedMode = els.setSelect.value;

    if (selectedMode === "__random__") {
      const pool = Object.values(bank).flat().map((question) => ({
        ...question,
        options: shuffleArray(question.options || []),
      }));
      selectedQuestions = shuffleArray(pool).slice(0, TOTAL_QUESTIONS);
      els.meta.textContent = `Loaded random live sample (${selectedQuestions.length} questions).`;
    } else {
      selectedQuestions = (bank[selectedMode] || []).map((question) => ({
        ...question,
        options: shuffleArray(question.options || []),
      }));
      els.meta.textContent = `Loaded ${selectedMode} (${selectedQuestions.length} questions).`;
    }

    renderQuestions();
    stopTimer();
    startTimer();
  }

  function renderQuestions() {
    els.questions.innerHTML = "";

    selectedQuestions.forEach((question, index) => {
      const item = document.createElement("div");
      item.className = "question-item";
      item.dataset.questionId = question.id;

      const optionsHtml = (question.options || [])
        .map((option) => `<li class="option" data-value="${String(option)}">${option}</li>`)
        .join("");

      item.innerHTML = `
        <div class="question-number">${index + 1}</div>
        <div class="question-content">
          <p class="question-text">${question.question}</p>
          <ul class="options">${optionsHtml}</ul>
        </div>
      `;

      item.querySelectorAll(".option").forEach((optionEl) => {
        optionEl.addEventListener("click", () => {
          item.querySelectorAll(".option").forEach((node) => node.classList.remove("selected"));
          optionEl.classList.add("selected");
          userAnswers[question.id] = optionEl.dataset.value;
        });
      });

      els.questions.appendChild(item);
    });
  }

  function startTimer() {
    updateTimer();
    timerInterval = setInterval(updateTimer, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function updateTimer() {
    if (!startTimestamp || finished) return;

    const remaining = Math.max(0, TEST_DURATION_MS - (Date.now() - startTimestamp));
    els.time.textContent = toTime(remaining);

    const percent = (remaining / TEST_DURATION_MS) * 100;
    els.timerBar.style.width = `${percent}%`;
    els.timerBar.style.backgroundColor = percent < 25
      ? "var(--danger-color)"
      : percent < 50
        ? "var(--warning-color)"
        : "var(--primary-color)";

    if (remaining <= 0) {
      endTest(true);
    }
  }

  function endTest(isTimeout = false) {
    if (finished || !selectedQuestions.length) return;
    finished = true;
    stopTimer();
    els.container.querySelector(".completion-message")?.remove();

    const correct = selectedQuestions.reduce((sum, question) => {
      return sum + (userAnswers[question.id] === question.answer ? 1 : 0);
    }, 0);

    const summary = document.createElement("div");
    summary.className = "completion-message";
    summary.innerHTML = `
      <div class="tick-icon"></div>
      <h2>Grammar Demo Complete</h2>
      <p>Mode: <strong>${selectedMode === "__random__" ? "Random live sample" : selectedMode}</strong></p>
      <p>Score: <strong>${correct}</strong> / ${selectedQuestions.length}</p>
      <p>${isTimeout ? "Timer expired." : "Tester submitted the demo."}</p>
    `;

    els.questions.innerHTML = "";
    els.container.appendChild(summary);
  }

  els.startBtn.addEventListener("click", startDemo);
  els.completeBtn.addEventListener("click", () => endTest(false));

  loadBank().catch(() => {
    els.meta.textContent = "Failed to load grammar question sets.";
  });
})();
