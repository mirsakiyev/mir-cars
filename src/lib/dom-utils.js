export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setFormStatusState(status, state) {
  status.classList.remove("success", "error", "loading");
  status.classList.add(state);

  if (state === "loading") {
    status.setAttribute("aria-busy", "true");
  } else {
    status.removeAttribute("aria-busy");
  }
}

export function setFormStatus(status, state, message) {
  setFormStatusState(status, state);
  status.textContent = message;
}

export function setFormStatusHtml(status, state, message) {
  setFormStatusState(status, state);
  status.innerHTML = message;
}

export function setButtonLoading(button, isLoading, loadingLabel = "") {
  if (!button) return;

  if (isLoading) {
    const defaultLabel = button.dataset.defaultLabel || button.textContent.trim();
    if (defaultLabel) button.dataset.defaultLabel = defaultLabel;
    if (loadingLabel) button.textContent = loadingLabel;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    return;
  }

  if (button.dataset.defaultLabel) button.textContent = button.dataset.defaultLabel;
  button.removeAttribute("aria-busy");
  button.disabled = false;
}
