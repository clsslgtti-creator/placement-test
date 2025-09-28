(function () {
  let scorm = null;
  let isScormConnected = false;

  function initScormConnection() {
    if (!window.pipwerks || !window.pipwerks.SCORM) {
      console.warn("SCORM API wrapper not found for completion page");
      return;
    }

    scorm = window.pipwerks.SCORM;

    try {
      isScormConnected = scorm.init();
    } catch (error) {
      console.error("Unable to initialise SCORM for completion", error);
      isScormConnected = false;
    }

    if (!isScormConnected) {
      return;
    }

    console.log("SCORM connection established for completion");
  }

  function recordCompletion() {
    if (!isScormConnected || !scorm) {
      return;
    }

    try {
      const payload = {
        completedAt: new Date().toISOString(),
        note: "Placement test completed",
      };

      scorm.set("cmi.core.lesson_status", "completed");
      scorm.set("cmi.suspend_data", JSON.stringify(payload));
      scorm.save();
    } catch (error) {
      console.error("Unable to record completion for completion page", error);
    }
  }

  function closeScormConnection() {
    if (!isScormConnected || !scorm) {
      return;
    }

    try {
      scorm.quit();
    } catch (error) {
      console.error("Error closing SCORM connection for completion", error);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initScormConnection();
    recordCompletion();
  });

  window.addEventListener("beforeunload", closeScormConnection);
})();
