import { setButtonLoading, setFormStatus } from "../lib/dom-utils.js";
import { logClientWarning } from "../lib/logging.js";
import { initPublicSite } from "../lib/public-site.js";
import { createContactRequest } from "../lib/request-service.js";

const form = document.querySelector("#contactForm");
const status = document.querySelector("#contactStatus");

function fieldValue(formData, name) {
  return String(formData.get(name) || "").trim();
}

function contactPayload(formData) {
  const inquiryType = fieldValue(formData, "inquiry_type") || "Other";
  const message = fieldValue(formData, "message");

  return {
    request_type: "contact",
    name: fieldValue(formData, "name"),
    email: fieldValue(formData, "email"),
    phone: fieldValue(formData, "phone") || null,
    message: [`Inquiry type: ${inquiryType}`, "", message].join("\n"),
    status: "new",
  };
}

function bindContactForm() {
  if (!form || !status) return;

  const submitButton = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.reportValidity()) return;

    setButtonLoading(submitButton, true);
    setFormStatus(status, "loading", "Sending message...");

    try {
      await createContactRequest(contactPayload(new FormData(form)));
      form.reset();
      setFormStatus(status, "success", form.dataset.success);
    } catch (error) {
      logClientWarning("Contact request submission failed.", error);
      setFormStatus(status, "error", form.dataset.error);
    } finally {
      setButtonLoading(submitButton, false);
    }
  });
}

initPublicSite();
bindContactForm();
