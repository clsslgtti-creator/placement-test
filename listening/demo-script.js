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
  const TEST_DURATION_MS = 20 * 60 * 1000;

  const els = {
    timer: document.getElementById("timer"),
    timerContainer: document.getElementById("timer-container"),
    time: document.getElementById("time-remaining"),
    timerBar: document.getElementById("timer-bar"),
    banner: document.getElementById("program-banner"),
    bannerName: document.getElementById("selected-program-name"),
    content: document.getElementById("listening-content"),
    actions: document.getElementById("actions"),
    submit: document.getElementById("submit-test"),
    overlay: document.getElementById("program-selection"),
    programSelect: document.getElementById("programme-select"),
    generalSetSelect: document.getElementById("general-set-select"),
    specificSetSelect: document.getElementById("specific-set-select"),
    start: document.getElementById("start-test"),
    note: document.getElementById("demo-note"),
    generalQuestions: document.getElementById("general-questions"),
    specificQuestions: document.getElementById("specific-questions"),
    generalStatus: document.getElementById("general-audio-status"),
    specificStatus: document.getElementById("specific-audio-status"),
    generalButton: document.querySelector('.audio-play-button[data-section="general"]'),
    specificButton: document.querySelector('.audio-play-button[data-section="specific"]'),
    container: document.querySelector(".container"),
  };

  let questionsData = null;
  let selectedProgram = "";
  let selectedKeys = { general: "", specific: "" };
  let selectedQuestions = { general: null, specific: null };
  let userAnswers = {};
  let audioControllers = {};
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
    populateGeneralSets();
    els.note.textContent = "Choose a programme and optional set overrides.";
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

  function populateGeneralSets() {
    const keys = Object.keys(questionsData.General || {});
    els.generalSetSelect.innerHTML = ['<option value="__random__">Random general set</option>']
      .concat(keys.map((key) => `<option value="${key}">${key}</option>`))
      .join("");
  }

  function populateSpecificSets(programKey) {
    const keys = Object.keys((questionsData && questionsData[programKey]) || {});
    els.specificSetSelect.innerHTML = ['<option value="__random__">Random programme-specific set</option>']
      .concat(keys.map((key) => `<option value="${key}">${key}</option>`))
      .join("");
  }

  function pickSet(group, requestedKey) {
    const keys = Object.keys(group || {});
    if (!keys.length) return { key: "", value: null };
    const finalKey = requestedKey && requestedKey !== "__random__"
      ? requestedKey
      : keys[Math.floor(Math.random() * keys.length)];

    return {
      key: finalKey,
      value: normaliseSet(group[finalKey], finalKey),
    };
  }

  function normaliseSet(rawSet, key) {
    if (!rawSet) return null;
    return {
      id: key,
      audio: rawSet.audio,
      questions: (rawSet.question || []).map((item) => ({
        id: item.id,
        question: item.question,
        options: shuffleArray(item.options || []),
        answer: item.answer,
      })),
    };
  }

  function startDemo() {
    els.container.querySelector(".completion-message")?.remove();
    const programKey = els.programSelect.value;
    if (!programKey) {
      els.note.textContent = "Select a programme first.";
      return;
    }

    const generalPick = pickSet(questionsData.General, els.generalSetSelect.value);
    const specificPick = pickSet(questionsData[programKey], els.specificSetSelect.value);
    if (!generalPick.value || !specificPick.value) {
      els.note.textContent = "The selected programme does not have enough question data.";
      return;
    }

    selectedProgram = programKey;
    selectedKeys = { general: generalPick.key, specific: specificPick.key };
    selectedQuestions = { general: generalPick.value, specific: specificPick.value };
    userAnswers = {};
    finished = false;
    startTimestamp = Date.now();

    prepareInterface();
    renderQuestions();
    initialiseAudioControllers();
    stopTimer();
    startTimer();

    els.note.textContent = `Loaded ${selectedProgram} with General ${selectedKeys.general} and Specific ${selectedKeys.specific}.`;
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

  function renderQuestions() {
    renderSection(selectedQuestions.general, els.generalQuestions);
    renderSection(selectedQuestions.specific, els.specificQuestions);
  }

  function renderSection(sectionData, container) {
    container.innerHTML = "";
    sectionData.questions.forEach((question, index) => {
      const wrapper = document.createElement("div");
      wrapper.className = "question-item";
      wrapper.dataset.questionId = question.id;

      const optionsHtml = question.options
        .map((option) => `<li class="option" data-value="${String(option)}">${option}</li>`)
        .join("");

      wrapper.innerHTML = `
        <div class="question-number">${index + 1}</div>
        <div class="question-content">
          <p class="question-text">${question.question}</p>
          <ul class="options">${optionsHtml}</ul>
        </div>
      `;

      wrapper.querySelectorAll(".option").forEach((optionEl) => {
        optionEl.addEventListener("click", () => {
          wrapper.querySelectorAll(".option").forEach((node) => node.classList.remove("selected"));
          optionEl.classList.add("selected");
          userAnswers[question.id] = optionEl.dataset.value;
        });
      });

      container.appendChild(wrapper);
    });
  }

  function initialiseAudioControllers() {
    audioControllers = {
      general: createAudioController("general", selectedQuestions.general.audio),
      specific: createAudioController("specific", selectedQuestions.specific.audio),
    };
    updateSectionAvailability();
  }

  function createAudioController(sectionKey, audioSrc) {
    const button = sectionKey === "general" ? els.generalButton : els.specificButton;
    const label = button.querySelector(".label");
    const status = sectionKey === "general" ? els.generalStatus : els.specificStatus;
    const controller = {
      key: sectionKey,
      audio: new Audio(audioSrc),
      button,
      label,
      status,
      playsUsed: 0,
      isPlaying: false,
      awaitingSecondPlay: false,
    };

    controller.audio.preload = "auto";
    controller.button.onclick = () => handleAudioClick(controller);

    controller.audio.addEventListener("play", () => {
      controller.isPlaying = true;
      controller.button.disabled = true;
      updateAudioStatus(controller, "Playing...");
    });

    controller.audio.addEventListener("ended", () => {
      controller.isPlaying = false;
      if (controller.playsUsed === 1) {
        controller.awaitingSecondPlay = true;
        controller.button.disabled = false;
        controller.label.textContent = "Play Second Time";
        updateAudioStatus(controller, "Second play ready.");
      } else {
        controller.awaitingSecondPlay = false;
        controller.button.disabled = true;
        controller.label.textContent = "Playback Completed";
        updateAudioStatus(controller, "Playback completed.");
      }
      updateSectionAvailability();
    });

    controller.audio.addEventListener("error", () => {
      controller.isPlaying = false;
      controller.button.disabled = false;
      controller.playsUsed = Math.max(0, controller.playsUsed - 1);
      controller.label.textContent = controller.playsUsed ? "Play Second Time" : "Play Recording";
      updateAudioStatus(controller, "Playback failed. Try again.");
      updateSectionAvailability();
    });

    controller.label.textContent = "Play Recording";
    controller.button.disabled = false;
    updateAudioStatus(controller, "Plays remaining: 2");
    return controller;
  }

  function handleAudioClick(controller) {
    if (controller.isPlaying || controller.playsUsed >= 2) return;
    if (controller.key === "specific" && audioControllers.general.playsUsed < 2) return;

    controller.playsUsed += 1;
    controller.awaitingSecondPlay = false;
    controller.label.textContent = controller.playsUsed === 1 ? "Playing (First Time)" : "Playing (Second Time)";
    controller.audio.currentTime = 0;
    controller.audio.play().catch(() => {
      controller.audio.dispatchEvent(new Event("error"));
    });
    updateSectionAvailability();
  }

  function updateAudioStatus(controller, text) {
    controller.status.textContent = text;
  }

  function updateSectionAvailability() {
    const specificLocked = audioControllers.general && audioControllers.general.playsUsed < 2;
    if (audioControllers.specific && !audioControllers.specific.isPlaying && audioControllers.specific.playsUsed < 2) {
      audioControllers.specific.button.disabled = specificLocked;
    }
    if (specificLocked) {
      els.specificStatus.textContent = "Complete both general plays to unlock.";
    } else if (audioControllers.specific && audioControllers.specific.playsUsed === 0) {
      els.specificStatus.textContent = "Plays remaining: 2";
    }
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
    if (finished || !selectedQuestions.general || !selectedQuestions.specific) return;
    finished = true;
    stopTimer();
    els.container.querySelector(".completion-message")?.remove();

    const allQuestions = [
      ...selectedQuestions.general.questions,
      ...selectedQuestions.specific.questions,
    ];

    const correct = allQuestions.reduce((sum, question) => {
      return sum + (userAnswers[question.id] === question.answer ? 1 : 0);
    }, 0);

    const summary = document.createElement("div");
    summary.className = "completion-message";
    summary.innerHTML = `
      <div class="tick-icon"></div>
      <h2>Listening Demo Complete</h2>
      <p>Programme: <strong>${selectedProgram}</strong></p>
      <p>General set: <strong>${selectedKeys.general}</strong></p>
      <p>Specific set: <strong>${selectedKeys.specific}</strong></p>
      <p>Score: <strong>${correct}</strong> / ${allQuestions.length}</p>
      <p>${isTimeout ? "Timer expired." : "Tester submitted the demo."}</p>
    `;

    els.content.classList.add("hidden");
    els.actions.classList.add("hidden");
    els.container.appendChild(summary);
  }

  els.programSelect.addEventListener("change", (event) => {
    populateSpecificSets(event.target.value);
  });
  els.start.addEventListener("click", startDemo);
  els.submit.addEventListener("click", () => endTest(false));

  loadQuestions().catch(() => {
    els.note.textContent = "Failed to load listening question sets.";
  });
})();
