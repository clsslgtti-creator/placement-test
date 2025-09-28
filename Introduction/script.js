(function () {
  let scorm = null;
  let isScormConnected = false;
  const grammarUrl = "../grammar/index.html";

  function initScormConnection() {
    if (!window.pipwerks || !window.pipwerks.SCORM) {
      console.warn("SCORM API wrapper not found for introduction page");
      return;
    }

    scorm = window.pipwerks.SCORM;

    try {
      isScormConnected = scorm.init();
    } catch (error) {
      console.error("Unable to initialise SCORM for introduction", error);
      isScormConnected = false;
    }

    if (!isScormConnected) {
      return;
    }

    console.log("SCORM connection established for introduction");

    try {
      const status = scorm.get("cmi.core.lesson_status");
      if (!status || status === "not attempted") {
        scorm.set("cmi.core.lesson_status", "incomplete");
        scorm.save();
      }
    } catch (error) {
      console.error("Failed to prime SCORM status for introduction", error);
    }
  }

  function persistCompletion() {
    if (!isScormConnected || !scorm) {
      return;
    }

    try {
      const now = new Date();
      const completionData = {
        completedAt: now.toISOString(),
      };

      scorm.set("cmi.core.lesson_status", "completed");
      scorm.set("cmi.suspend_data", JSON.stringify(completionData));
      scorm.save();
    } catch (error) {
      console.error("Unable to record completion for introduction", error);
    }
  }

  function attemptLmsNavigation() {
    const navFunctionNames = [
      "doNext",
      "nextSCO",
      "nextSco",
      "continueCourse",
      "continueSCO",
    ];

    const candidateWindows = [
      window,
      window.parent,
      window.top,
      window.opener,
    ].filter(Boolean);

    for (const candidate of candidateWindows) {
      for (const fnName of navFunctionNames) {
        if (typeof candidate[fnName] === "function") {
          try {
            candidate[fnName]();
            return true;
          } catch (error) {
            console.warn(`Navigation via ${fnName} failed`, error);
          }
        }
      }
    }

    return false;
  }

  function goToGrammar() {
    const navigated = attemptLmsNavigation();
    if (navigated) {
      return;
    }

    try {
      window.location.href = grammarUrl;
    } catch (error) {
      console.error("Redirect to grammar failed", error);
    }
  }

  function handleStartClick(event) {
    event.preventDefault();

    const button = event.currentTarget;
    button.disabled = true;
    button.classList.add("loading");
    button.textContent = "Opening Grammar Test...";

    persistCompletion();

    setTimeout(() => {
      if (isScormConnected && scorm) {
        try {
          scorm.quit();
        } catch (error) {
          console.error("Error closing SCORM connection for introduction", error);
        }
      }

      goToGrammar();
    }, 400);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const button = document.getElementById("start-test");
    initScormConnection();

    if (button) {
      button.addEventListener("click", handleStartClick);
    }
  });
})();
