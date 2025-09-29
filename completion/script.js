/* =============================
   SLGTTI Completion (SCORM 1.2)
   Idempotent, safe lifecycle
   ============================= */

(() => {
  // Per-frame guard so Moodle can't re-run this file in the same iframe
  if (window.__SLGTTI_COMPLETION_LOADED__) {
    console.warn("[COMPLETION] script already loaded in this frame — skipping re-register.");
    return;
  }
  window.__SLGTTI_COMPLETION_LOADED__ = true;

  let scorm = null;
  let isScormMode = false;

  // ---------- SCORM guards ----------
  function scormActive() {
    return scorm && scorm.connection && scorm.connection.isActive;
  }

  function initScormOnce() {
    try {
      scorm = (window.pipwerks && window.pipwerks.SCORM) ? window.pipwerks.SCORM : null;
    } catch { scorm = null; }
    if (!scorm) return false;

    // Already active?
    if (scormActive()) return true;
    // Reentrancy guard (avoid concurrent inits)
    if (initScormOnce.__running) return scormActive();
    initScormOnce.__running = true;

    const ok = scorm.init(); // LMSInitialize
    initScormOnce.__running = false;

    if (ok) { isScormMode = true; return true; }
    return false;
  }

  function commitScorm() {
    if (scormActive()) scorm.save();
  }

  function quitScormOnce() {
    if (!scormActive()) return;
    if (quitScormOnce.__done) return;
    quitScormOnce.__done = true;
    try { scorm.save(); } catch {}
    try { scorm.quit(); } catch {}
  }

  // ---------- Completion logic ----------
  function recordCompletion() {
    if (!isScormMode || !scormActive()) return;

    try {
      // Don’t fight a status that’s already complete/passed
      const status = scorm.get("cmi.core.lesson_status");
      if (status !== "completed" && status !== "passed") {
        scorm.set("cmi.core.lesson_status", "completed");
      }

      const payload = {
        completedAt: new Date().toISOString(),
        note: "Placement test completed",
      };
      scorm.set("cmi.suspend_data", JSON.stringify(payload));

      // Optional (SCORM 1.2): you can set exit to 'normal' if you want.
      // scorm.set("cmi.core.exit", "normal");

      commitScorm();
      console.log("[COMPLETION] SCORM completion recorded.");
    } catch (err) {
      console.error("[COMPLETION] Unable to record completion:", err);
    }
  }

  // ---------- Boot ----------
  document.addEventListener("DOMContentLoaded", () => {
    if (!initScormOnce()) {
      console.warn("[COMPLETION] SCORM API not available or init failed.");
      return;
    }
    console.log("[COMPLETION] SCORM connection established.");
    recordCompletion();
  }, { once: true });

  // Commit+quit exactly once, regardless of which event fires
  window.addEventListener("beforeunload", quitScormOnce, { once: true });
  window.addEventListener("unload",       quitScormOnce, { once: true });
})();
