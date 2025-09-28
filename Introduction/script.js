(function () {
  let scorm = null;
  let isScormConnected = false;

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

  function markIntroductionComplete() {
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

  function closeScormConnection() {
    if (!isScormConnected || !scorm) {
      return;
    }

    try {
      scorm.quit();
    } catch (error) {
      console.error("Error closing SCORM connection for introduction", error);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initScormConnection();
    markIntroductionComplete();
  });

  window.addEventListener("beforeunload", closeScormConnection);
})();
