(() => {
  const PROGRAMS = [
    { key: "AT", label: "Automobile Technology" },
    { key: "CT", label: "Construction Technology" },
    { key: "ET", label: "Electrical Technology" },
    { key: "FT", label: "Food Technology" },
    { key: "ICT", label: "Information and Communication Technology" },
    { key: "MT", label: "Mechanical Technology" },
  ];
  const LABELS = PROGRAMS.reduce((acc, item) => {
    acc[item.key] = item.label;
    return acc;
  }, {});
  const TEST_DURATION_MS = 5 * 60 * 1000;

  const els = {
    timer: document.getElementById("timer"),
    timerContainer: document.getElementById("timer-container"),
    time: document.getElementById("time-remaining"),
    timerBar: document.getElementById("timer-bar"),
    banner: document.getElementById("program-banner"),
    bannerName: document.getElementById("selected-program-name"),
    content: document.getElementById("vocabulary-content"),
    wordBank: document.getElementById("word-bank"),
    matchingGrid: document.getElementById("matching-grid"),
    actions: document.getElementById("actions"),
    submit: document.getElementById("submit-test"),
    overlay: document.getElementById("program-selection"),
    programSelect: document.getElementById("programme-select"),
    setSelect: document.getElementById("set-select"),
    start: document.getElementById("start-test"),
    note: document.getElementById("demo-note"),
    container: document.querySelector(".container"),
  };

  let questionsData = null;
  let selectedProgram = "";
  let selectedSetKey = "";
  let selectedQuestions = [];
  let userAnswers = {};
  let matchAssignments = {};
  let tokenAssignments = {};
  let tokens = [];
  let tokenMap = {};
  let tokenElements = {};
  let selectedTokenId = null;
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

  async function loadQuestions() {
    const response = await fetch("questions.json");
    questionsData = await response.json();
    populatePrograms();
    els.note.textContent = "Choose a programme and optional set override.";
  }

  function populatePrograms() {
    const options = ['<option value="">-- Select Programme --</option>']
      .concat(
        PROGRAMS.filter((program) => questionsData[program.key]).map((program) => {
          return `<option value="${program.key}">${program.key} - ${program.label}</option>`;
        })
      )
      .join("");
    els.programSelect.innerHTML = options;
  }

  function populateSets(programKey) {
    const keys = Object.keys((questionsData && questionsData[programKey]) || {});
    els.setSelect.innerHTML = ['<option value="__random__">Random vocabulary set</option>']
      .concat(keys.map((key) => `<option value="${key}">${key}</option>`))
      .join("");
  }

  function startDemo() {
    els.container.querySelector(".completion-message")?.remove();
    const programKey = els.programSelect.value;
    if (!programKey) {
      els.note.textContent = "Select a programme first.";
      return;
    }

    const sets = questionsData[programKey] || {};
    const keys = Object.keys(sets);
    if (!keys.length) {
      els.note.textContent = "No vocabulary sets available for this programme.";
      return;
    }

    selectedProgram = programKey;
    selectedSetKey = els.setSelect.value === "__random__"
      ? keys[Math.floor(Math.random() * keys.length)]
      : els.setSelect.value;
    selectedQuestions = JSON.parse(JSON.stringify(sets[selectedSetKey] || []));
    if (!selectedQuestions.length) {
      els.note.textContent = "The selected vocabulary set is empty.";
      return;
    }

    finished = false;
    userAnswers = {};
    matchAssignments = {};
    tokenAssignments = {};
    tokens = [];
    tokenMap = {};
    tokenElements = {};
    selectedTokenId = null;
    startTimestamp = Date.now();

    prepareInterface();
    renderTask();
    stopTimer();
    startTimer();

    els.note.textContent = `Loaded ${selectedProgram} - ${selectedSetKey}.`;
  }

  function prepareInterface() {
    els.overlay.classList.add("hidden");
    els.banner.classList.remove("hidden");
    els.bannerName.textContent = `${selectedProgram} - ${LABELS[selectedProgram] || selectedProgram}`;
    els.timer.classList.remove("hidden");
    els.timerContainer.classList.remove("hidden");
    els.content.classList.remove("hidden");
    els.actions.classList.remove("hidden");
  }

  function renderTask() {
    els.wordBank.innerHTML = "";
    els.matchingGrid.innerHTML = "";

    selectedQuestions.forEach((entry, index) => {
      const tokenId = `token_${index}`;
      const token = { id: tokenId, word: entry.answer };
      tokens.push(token);
      tokenMap[tokenId] = token;
      matchAssignments[entry.id] = null;
    });

    shuffleArray(tokens).forEach((token) => {
      const chip = createWordChip(token, "bank");
      tokenElements[token.id] = chip;
      els.wordBank.appendChild(chip);
    });

    selectedQuestions.forEach((entry) => {
      const card = document.createElement("div");
      card.className = "match-card";

      const definition = document.createElement("div");
      definition.className = "definition";
      definition.textContent = entry.question;

      const dropzone = document.createElement("div");
      dropzone.className = "match-dropzone";
      dropzone.dataset.questionId = entry.id;
      dropzone.addEventListener("click", () => handleDropzoneClick(entry.id));

      const placeholder = document.createElement("span");
      placeholder.className = "dropzone-placeholder";
      placeholder.textContent = "Tap to place word";
      dropzone.appendChild(placeholder);

      card.appendChild(definition);
      card.appendChild(dropzone);
      els.matchingGrid.appendChild(card);
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
    if (!chip) return;

    if (chip.dataset.location === "dropzone") {
      const questionId = tokenAssignments[tokenId];
      if (questionId) removeAssignment(questionId, true);
      return;
    }

    if (selectedTokenId === tokenId) {
      clearSelection();
      return;
    }

    clearSelection();
    selectedTokenId = tokenId;
    chip.classList.add("selected");
  }

  function handleDropzoneClick(questionId) {
    if (selectedTokenId) {
      assignToken(selectedTokenId, questionId);
      return;
    }

    if (matchAssignments[questionId]) {
      removeAssignment(questionId, false);
    }
  }

  function assignToken(tokenId, questionId) {
    const token = tokenMap[tokenId];
    const chip = tokenElements[tokenId];
    const dropzone = els.matchingGrid.querySelector(`[data-question-id="${questionId}"]`);
    if (!token || !chip || !dropzone) return;

    removeAssignment(questionId, false, true);

    const existingQuestion = tokenAssignments[tokenId];
    if (existingQuestion) {
      removeAssignment(existingQuestion, false, true);
    }

    dropzone.innerHTML = "";
    chip.dataset.location = "dropzone";
    chip.classList.remove("selected");
    chip.classList.add("assigned");
    dropzone.appendChild(chip);

    matchAssignments[questionId] = tokenId;
    tokenAssignments[tokenId] = questionId;
    userAnswers[questionId] = token.word;
    clearSelection();
  }

  function removeAssignment(questionId, reselectChip = false, skipClear = false) {
    const tokenId = matchAssignments[questionId];
    if (!tokenId) return;

    const chip = tokenElements[tokenId];
    const dropzone = els.matchingGrid.querySelector(`[data-question-id="${questionId}"]`);
    if (dropzone) {
      dropzone.innerHTML = "";
      const placeholder = document.createElement("span");
      placeholder.className = "dropzone-placeholder";
      placeholder.textContent = "Tap to place word";
      dropzone.appendChild(placeholder);
    }

    chip.dataset.location = "bank";
    chip.classList.remove("assigned");
    els.wordBank.appendChild(chip);

    matchAssignments[questionId] = null;
    delete tokenAssignments[tokenId];
    delete userAnswers[questionId];

    if (!skipClear) clearSelection();
    if (reselectChip) {
      selectedTokenId = tokenId;
      chip.classList.add("selected");
    }
  }

  function clearSelection() {
    Object.values(tokenElements).forEach((chip) => chip.classList.remove("selected"));
    selectedTokenId = null;
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

    if (remaining <= 0) endTest(true);
  }

  function endTest(isTimeout = false) {
    if (finished || !selectedQuestions.length) return;
    finished = true;
    stopTimer();
    els.container.querySelector(".completion-message")?.remove();

    const correct = selectedQuestions.reduce((sum, entry) => {
      return sum + (userAnswers[entry.id] === entry.answer ? 1 : 0);
    }, 0);

    const summary = document.createElement("div");
    summary.className = "completion-message";
    summary.innerHTML = `
      <div class="tick-icon"></div>
      <h2>Vocabulary Demo Complete</h2>
      <p>Programme: <strong>${selectedProgram}</strong></p>
      <p>Set: <strong>${selectedSetKey}</strong></p>
      <p>Score: <strong>${correct}</strong> / ${selectedQuestions.length}</p>
      <p>${isTimeout ? "Timer expired." : "Tester submitted the demo."}</p>
    `;

    els.content.classList.add("hidden");
    els.actions.classList.add("hidden");
    els.container.appendChild(summary);
  }

  els.programSelect.addEventListener("change", (event) => {
    populateSets(event.target.value);
  });
  els.start.addEventListener("click", startDemo);
  els.submit.addEventListener("click", () => endTest(false));

  loadQuestions().catch(() => {
    els.note.textContent = "Failed to load vocabulary question sets.";
  });
})();
