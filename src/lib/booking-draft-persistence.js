export function createBookingDraftPersistenceController({
  save,
  clear,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
  delay = 120,
} = {}) {
  if (typeof save !== "function" || typeof clear !== "function") {
    throw new TypeError("Booking draft persistence requires save and clear functions.");
  }

  let active = true;
  let pendingTimer = null;

  function cancelPendingSave() {
    if (pendingTimer === null) return;

    clearTimer(pendingTimer);
    pendingTimer = null;
  }

  function saveNow() {
    if (!active) return false;

    cancelPendingSave();
    save();
    return true;
  }

  function queueSave() {
    if (!active) return false;

    cancelPendingSave();
    pendingTimer = setTimer(() => {
      pendingTimer = null;
      if (active) save();
    }, delay);
    return true;
  }

  function stopAndClear() {
    if (!active) return;

    active = false;
    cancelPendingSave();
    clear();
  }

  return Object.freeze({
    isActive: () => active,
    queueSave,
    saveNow,
    stopAndClear,
  });
}
