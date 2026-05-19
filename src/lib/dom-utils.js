export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function setFormStatus(status, state, message) {
  status.classList.remove("success", "error", "loading");
  status.classList.add(state);
  status.innerHTML = message;
}
