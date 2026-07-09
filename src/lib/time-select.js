import { formatTimeDisplay, isTimeString } from "./booking-utils.js";

const timeOptions = Array.from({ length: 48 }, (_unused, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 === 0 ? 0 : 30;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
});

let activeSelect = null;
let selectId = 0;
let placementFrame = 0;

function selectParts(select) {
  const popoverId = select.dataset.timeSelectPopover;

  return {
    input: select.querySelector("[data-time-input]"),
    trigger: select.querySelector("[data-time-trigger]"),
    display: select.querySelector("[data-time-display]"),
    popover: popoverId ? document.getElementById(popoverId) : null,
  };
}

function placePopover(select) {
  if (!select) return;

  const { trigger, popover } = selectParts(select);
  if (!trigger || !popover || popover.hidden) return;

  const triggerRect = trigger.getBoundingClientRect();
  const width = Math.min(190, window.innerWidth - 24);
  const left = Math.min(Math.max(12, triggerRect.left), window.innerWidth - width - 12);
  const popoverHeight = Math.min(popover.offsetHeight || 240, 280);
  const belowTop = triggerRect.bottom + 8;
  const aboveTop = triggerRect.top - popoverHeight - 8;
  const roomBelow = window.innerHeight - belowTop - 12;
  const roomAbove = triggerRect.top - 12;
  const top = roomBelow < Math.min(popoverHeight, 220) && roomAbove > roomBelow ? Math.max(12, aboveTop) : belowTop;
  const maxHeight = Math.max(180, window.innerHeight - top - 12);

  popover.style.setProperty("--time-select-left", `${left}px`);
  popover.style.setProperty("--time-select-top", `${top}px`);
  popover.style.setProperty("--time-select-width", `${width}px`);
  popover.style.setProperty("--time-select-max-height", `${maxHeight}px`);
}

function queuePopoverPlacement() {
  if (!activeSelect || placementFrame) return;

  placementFrame = window.requestAnimationFrame(() => {
    placementFrame = 0;
    placePopover(activeSelect);
  });
}

function cancelQueuedPopoverPlacement() {
  if (!placementFrame) return;

  window.cancelAnimationFrame(placementFrame);
  placementFrame = 0;
}

function updateDisplay(select) {
  const { input, trigger, display } = selectParts(select);
  if (!input || !trigger || !display) return;

  const hasValue = isTimeString(input.value);
  display.textContent = hasValue ? formatTimeDisplay(input.value) : trigger.dataset.placeholder || "Select time";
  trigger.classList.toggle("has-value", hasValue);
}

function renderOptions(select) {
  const { input, popover } = selectParts(select);
  if (!input || !popover) return;

  popover.innerHTML = timeOptions
    .map((value) => {
      const isSelected = value === input.value;

      return `
        <button
          class="time-select-option${isSelected ? " is-selected" : ""}"
          type="button"
          data-time-option="${value}"
          aria-pressed="${isSelected ? "true" : "false"}"
        >${formatTimeDisplay(value)}</button>
      `;
    })
    .join("");
}

function closeSelect(select = activeSelect) {
  if (!select) return;

  const { trigger, popover } = selectParts(select);
  select.classList.remove("is-open");
  if (trigger) trigger.setAttribute("aria-expanded", "false");
  if (popover) popover.hidden = true;
  if (activeSelect === select) {
    activeSelect = null;
    cancelQueuedPopoverPlacement();
  }
}

function openSelect(select) {
  const { trigger, popover } = selectParts(select);
  if (!trigger || !popover) return;

  if (activeSelect && activeSelect !== select) closeSelect(activeSelect);

  renderOptions(select);
  updateDisplay(select);
  select.classList.add("is-open");
  popover.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
  activeSelect = select;
  placePopover(select);
}

function setSelectValue(select, value) {
  const { input } = selectParts(select);
  if (!input || !isTimeString(value)) return;

  input.value = value;
  updateDisplay(select);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  closeSelect(select);
}

function bindTimeSelect(select) {
  if (select.dataset.timeSelectBound === "true") return;
  select.dataset.timeSelectBound = "true";

  const { input, trigger } = selectParts(select);
  if (!input || !trigger) return;

  if (!select.dataset.timeSelectPopover) {
    selectId += 1;
    const popoverId = `time-select-popover-${selectId}`;
    const popover = document.createElement("div");

    select.dataset.timeSelectPopover = popoverId;
    trigger.setAttribute("aria-controls", popoverId);
    popover.id = popoverId;
    popover.className = "time-select-popover";
    popover.hidden = true;
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", trigger.getAttribute("aria-label") || "Choose time");
    popover.addEventListener("click", (event) => {
      const option = event.target.closest("[data-time-option]");

      event.stopPropagation();
      if (option) setSelectValue(select, option.dataset.timeOption);
    });
    document.body.append(popover);
  }

  trigger.dataset.placeholder = trigger.dataset.placeholder || trigger.textContent.trim() || "Select time";
  updateDisplay(select);

  trigger.addEventListener("click", () => {
    if (activeSelect === select) {
      closeSelect(select);
    } else {
      openSelect(select);
    }
  });

  input.addEventListener("input", () => {
    updateDisplay(select);
    if (activeSelect === select) {
      renderOptions(select);
      placePopover(select);
    }
  });

  input.addEventListener("time-select:refresh", () => {
    updateDisplay(select);
    if (activeSelect === select) {
      renderOptions(select);
      placePopover(select);
    }
  });
}

export function initCustomTimeSelects(root = document) {
  root.querySelectorAll("[data-time-select]").forEach(bindTimeSelect);

  if (document.documentElement.dataset.timeSelectGlobalBound === "true") return;
  document.documentElement.dataset.timeSelectGlobalBound = "true";

  document.addEventListener("click", (event) => {
    const { popover } = activeSelect ? selectParts(activeSelect) : {};

    if (activeSelect && !activeSelect.contains(event.target) && !popover?.contains(event.target)) {
      closeSelect(activeSelect);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSelect();
  });

  window.addEventListener("resize", queuePopoverPlacement, { passive: true });
  window.addEventListener("scroll", queuePopoverPlacement, { capture: true, passive: true });
}
