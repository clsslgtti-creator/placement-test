(() => {
  const TEST_DURATION_MS = 15 * 60 * 1000;

  const els = {
    setSelect: document.getElementById("set-select"),
    startBtn: document.getElementById("start-demo"),
    meta: document.getElementById("demo-meta"),
    passageTitle: document.getElementById("passage-title"),
    passageText: document.getElementById("passage-text"),
    questions: document.getElementById("questions-container"),
    completeBtn: document.getElementById("check-answers"),
    time: document.getElementById("time-remaining"),
    timerBar: document.getElementById("timer-bar"),
    container: document.querySelector(".container"),
  };

  let bank = {};
  let selectedSetKey = "";
  let currentSet = null;
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

    const options = ['<option value="__random__">Random set (live behavior)</option>']
      .concat(
        Object.keys(bank).map((key) => `<option value="${key}">${key}</option>`)
      )
      .join("");

    els.setSelect.innerHTML = options;
    els.meta.textContent = "Ready. Choose a set to begin.";
  }

  function chooseSet() {
    const keys = Object.keys(bank);
    const requested = els.setSelect.value;
    selectedSetKey = requested === "__random__"
      ? keys[Math.floor(Math.random() * keys.length)]
      : requested;
    currentSet = bank[selectedSetKey] || null;
  }

  function startDemo() {
    els.container.querySelector(".completion-message")?.remove();
    chooseSet();
    if (!currentSet) {
      els.meta.textContent = "No set available for the current selection.";
      return;
    }

    finished = false;
    userAnswers = {};
    startTimestamp = Date.now();

    renderSet();
    stopTimer();
    startTimer();

    const modeLabel = els.setSelect.value === "__random__" ? "Random" : "Manual";
    els.meta.textContent = `${modeLabel} selection loaded: ${selectedSetKey}`;
  }

  function renderSet() {
    els.passageTitle.textContent = currentSet.title || "Reading Passage";
    els.passageText.innerHTML = (currentSet.passage || "").replace(/\n/g, "<br>");
    els.questions.innerHTML = "";

    shuffleArray(currentSet.question || []).forEach((question, displayIndex) => {
      const item = document.createElement("div");
      item.className = "question-item";
      item.dataset.questionId = question.id;

      const optionsHtml = shuffleArray(question.options || [])
        .map((option) => `<li class="option" data-value="${String(option)}">${option}</li>`)
        .join("");

      item.innerHTML = `
        <div class="question-number">${displayIndex + 1}</div>
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
    if (finished || !currentSet) return;
    finished = true;
    stopTimer();
    els.container.querySelector(".completion-message")?.remove();

    const total = (currentSet.question || []).length;
    const correct = (currentSet.question || []).reduce((sum, question) => {
      return sum + (userAnswers[question.id] === question.answer ? 1 : 0);
    }, 0);

    const summary = document.createElement("div");
    summary.className = "completion-message";
    summary.innerHTML = `
      <div class="tick-icon"></div>
      <h2>Reading Demo Complete</h2>
      <p>Set: <strong>${selectedSetKey}</strong></p>
      <p>Score: <strong>${correct}</strong> / ${total}</p>
      <p>${isTimeout ? "Timer expired." : "Tester submitted the demo."}</p>
    `;

    els.questions.innerHTML = "";
    els.passageText.innerHTML = "";
    els.passageTitle.textContent = "";
    els.container.appendChild(summary);
  }

  els.startBtn.addEventListener("click", startDemo);
  els.completeBtn.addEventListener("click", () => endTest(false));

  loadBank().catch(() => {
    els.meta.textContent = "Failed to load reading question sets.";
  });
})();
