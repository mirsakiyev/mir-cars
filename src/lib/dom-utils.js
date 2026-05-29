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
}

export function setFormStatus(status, state, message) {
  setFormStatusState(status, state);
  status.textContent = message;
}

export function setFormStatusHtml(status, state, message) {
  setFormStatusState(status, state);
  status.innerHTML = message;
}
