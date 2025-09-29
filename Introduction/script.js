(function () {
  // --- Global per-frame guard to prevent double-loading ---
  if (window.__SLGTTI_INTRO_LOADED__) {
    console.warn("[INTRO] script already loaded in this frame — skipping re-register.");
    return;
  }
  window.__SLGTTI_INTRO_LOADED__ = true;

  let scorm = null;
  let isScormConnected = false;

  function initScormConnection() {
    if (!window.pipwerks || !window.pipwerks.SCORM) {
      console.warn("[INTRO] SCORM API wrapper not found");
      return;
    }
    scorm = window.pipwerks.SCORM;

    // Guard: if already active, do NOT call init() again
    if (scorm.connection && scorm.connection.isActive) {
      console.log("[INTRO] SCORM already active, skipping init().");
      isScormConnected = true;
      return;
    }

    // Guard against rapid double-calls to init
    if (initScormConnection.__running) return;
    initScormConnection.__running = true;

    try {
      isScormConnected = scorm.init();   // LMSInitialize
    } catch (error) {
      console.error("[INTRO] Unable to initialise SCORM", error);
      isScormConnected = false;
    } finally {
      initScormConnection.__running = false;
    }

    if (!isScormConnected) return;

    console.log("[INTRO] SCORM connection established");

    try {
      const status = scorm.get("cmi.core.lesson_status");
      if (!status || status === "not attempted") {
        scorm.set("cmi.core.lesson_status", "incomplete");
        scorm.save();                    // LMSCommit
      }
    } catch (error) {
      console.error("[INTRO] Failed to prime SCORM status", error);
    }
  }

  function markIntroductionComplete() {
    if (!isScormConnected || !scorm) return;

    try {
      const completionData = { completedAt: new Date().toISOString() };
      scorm.set("cmi.core.lesson_status", "completed");
      scorm.set("cmi.suspend_data", JSON.stringify(completionData));
      scorm.save();                      // commit right after setting
    } catch (error) {
      console.error("[INTRO] Unable to record completion", error);
    }
  }

  function closeScormConnection() {
    if (!isScormConnected || !scorm) return;
    if (closeScormConnection.__done) return;  // prevent double-quit
    closeScormConnection.__done = true;

    try { scorm.save(); } catch(e) {}
    try { scorm.quit(); } catch (error) {
      console.error("[INTRO] Error closing SCORM", error);
    }
  }

  // Use {once:true} so the handler can’t be added twice by accident
  document.addEventListener("DOMContentLoaded", () => {
    initScormConnection();
    // If you only want to mark completed after a user action, call this later.
    markIntroductionComplete();
  }, { once: true });

  window.addEventListener("beforeunload", closeScormConnection, { once: true });
  window.addEventListener("unload",       closeScormConnection, { once: true });
})();
