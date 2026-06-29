import { formatDateOnlyDisplay, isDateOnlyString, todayDateString } from "./booking-utils.js";

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
let activePicker = null;
let pickerId = 0;

function dateFromValue(value) {
  if (!isDateOnlyString(value)) return null;

  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function valueFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthFromKey(key) {
  if (!/^\d{4}-\d{2}$/.test(String(key || ""))) return null;

  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function pickerParts(picker) {
  const popoverId = picker.dataset.datePickerPopover;

  return {
    input: picker.querySelector("[data-date-input]"),
    trigger: picker.querySelector("[data-date-trigger]"),
    display: picker.querySelector("[data-date-display]"),
    popover: popoverId ? document.getElementById(popoverId) : picker.querySelector("[data-date-popover]"),
  };
}

function viewMonthForPicker(picker, input) {
  const storedMonth = monthFromKey(picker.dataset.viewMonth);
  if (storedMonth) return storedMonth;

  return startOfMonth(dateFromValue(input.value) || dateFromValue(input.min) || new Date());
}

function pickerMinValue(input) {
  return input.min || (input.dataset.dateDefaultMin === "today" ? todayDateString() : "");
}

function syncRelativeLimits(input) {
  if (!input) return;

  if (input.dataset.dateMin === "today") input.min = todayDateString();
  if (input.dataset.dateMax === "today") input.max = todayDateString();
}

function setViewMonth(picker, date) {
  picker.dataset.viewMonth = monthKey(startOfMonth(date));
}

function placePopover(picker) {
  if (!picker) return;

  const { trigger, popover } = pickerParts(picker);
  if (!trigger || !popover || popover.hidden) return;

  const triggerRect = trigger.getBoundingClientRect();
  const width = Math.min(310, window.innerWidth - 24);
  const left = Math.min(Math.max(12, triggerRect.left), window.innerWidth - width - 12);
  const popoverHeight = popover.offsetHeight || 330;
  const belowTop = triggerRect.bottom + 8;
  const aboveTop = triggerRect.top - popoverHeight - 8;
  const roomBelow = window.innerHeight - belowTop - 12;
  const roomAbove = triggerRect.top - 12;
  const top = roomBelow < Math.min(popoverHeight, 280) && roomAbove > roomBelow ? Math.max(12, aboveTop) : belowTop;
  const maxHeight = Math.max(220, window.innerHeight - top - 12);

  popover.style.setProperty("--date-picker-left", `${left}px`);
  popover.style.setProperty("--date-picker-top", `${top}px`);
  popover.style.setProperty("--date-picker-width", `${width}px`);
  popover.style.setProperty("--date-picker-max-height", `${maxHeight}px`);
}

function updateDisplay(picker) {
  const { input, trigger, display } = pickerParts(picker);
  if (!input || !trigger || !display) return;

  const hasValue = isDateOnlyString(input.value);
  display.textContent = hasValue ? formatDateOnlyDisplay(input.value) : trigger.dataset.placeholder || "Select date";
  trigger.classList.toggle("has-value", hasValue);
}

function renderCalendar(picker) {
  const { input, popover } = pickerParts(picker);
  if (!input || !popover) return;

  syncRelativeLimits(input);

  const viewMonth = viewMonthForPicker(picker, input);
  const minValue = pickerMinValue(input);
  const maxValue = input.max || "";
  const selectedValue = isDateOnlyString(input.value) ? input.value : "";
  const todayValue = todayDateString();
  const firstDay = startOfMonth(viewMonth);
  const gridStart = new Date(firstDay);
  const previousMonthLastDate = valueFromDate(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 0));
  const nextMonthFirstDate = valueFromDate(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));

  gridStart.setDate(firstDay.getDate() - firstDay.getDay());

  const dayButtons = Array.from({ length: 42 }, (_unused, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);

    const value = valueFromDate(day);
    const isOutsideMonth = day.getMonth() !== viewMonth.getMonth();
    const isDisabled = (minValue && value < minValue) || (maxValue && value > maxValue);
    const isSelected = value === selectedValue;
    const isToday = value === todayValue;

    return `
      <button
        class="date-picker-day${isOutsideMonth ? " is-muted" : ""}${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}"
        type="button"
        data-date-day="${value}"
        ${isDisabled ? "disabled" : ""}
        aria-pressed="${isSelected ? "true" : "false"}"
      >${day.getDate()}</button>
    `;
  }).join("");

  popover.innerHTML = `
    <div class="date-picker-head">
      <button class="date-picker-nav" type="button" data-date-prev aria-label="Previous month" ${minValue && previousMonthLastDate < minValue ? "disabled" : ""}></button>
      <strong>${monthFormatter.format(viewMonth)}</strong>
      <button class="date-picker-nav date-picker-nav-next" type="button" data-date-next aria-label="Next month" ${maxValue && nextMonthFirstDate > maxValue ? "disabled" : ""}></button>
    </div>
    <div class="date-picker-weekdays" aria-hidden="true">
      ${dayLabels.map((label) => `<span>${label}</span>`).join("")}
    </div>
    <div class="date-picker-grid">
      ${dayButtons}
    </div>
    <div class="date-picker-footer">
      <span>${selectedValue ? formatDateOnlyDisplay(selectedValue) : picker.dataset.datePickerEmpty || "Select a trip date"}</span>
      <button type="button" data-date-today ${(minValue && todayValue < minValue) || (maxValue && todayValue > maxValue) ? "disabled" : ""}>Today</button>
    </div>
  `;
}

function closePicker(picker = activePicker) {
  if (!picker) return;

  const { trigger, popover } = pickerParts(picker);
  picker.classList.remove("is-open");
  if (trigger) trigger.setAttribute("aria-expanded", "false");
  if (popover) popover.hidden = true;
  if (activePicker === picker) activePicker = null;
}

function openPicker(picker) {
  const { input, trigger, popover } = pickerParts(picker);
  if (!input || !trigger || !popover) return;

  if (activePicker && activePicker !== picker) closePicker(activePicker);

  setViewMonth(picker, dateFromValue(input.value) || dateFromValue(input.min) || new Date());
  renderCalendar(picker);
  updateDisplay(picker);
  picker.classList.add("is-open");
  popover.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
  activePicker = picker;
  placePopover(picker);
}

function setPickerValue(picker, value) {
  const { input } = pickerParts(picker);
  if (!input || !isDateOnlyString(value)) return;

  input.value = value;
  updateDisplay(picker);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  closePicker(picker);
}

function handlePickerAction(picker, event) {
  const { input } = pickerParts(picker);
  if (!input) return;

  const previous = event.target.closest("[data-date-prev]");
  const next = event.target.closest("[data-date-next]");
  const day = event.target.closest("[data-date-day]");
  const today = event.target.closest("[data-date-today]");

  if (previous) {
    setViewMonth(picker, addMonths(viewMonthForPicker(picker, input), -1));
    renderCalendar(picker);
    placePopover(picker);
    return;
  }

  if (next) {
    setViewMonth(picker, addMonths(viewMonthForPicker(picker, input), 1));
    renderCalendar(picker);
    placePopover(picker);
    return;
  }

  if (day) {
    setPickerValue(picker, day.dataset.dateDay);
    return;
  }

  if (today) {
    setPickerValue(picker, todayDateString());
  }
}

function bindPicker(picker) {
  if (picker.dataset.datePickerBound === "true") return;
  picker.dataset.datePickerBound = "true";

  const { input, trigger } = pickerParts(picker);
  if (!input || !trigger) return;

  syncRelativeLimits(input);

  if (!picker.dataset.datePickerPopover) {
    pickerId += 1;
    const popoverId = `date-picker-popover-${pickerId}`;
    const popover = document.createElement("div");

    picker.dataset.datePickerPopover = popoverId;
    trigger.setAttribute("aria-controls", popoverId);
    popover.id = popoverId;
    popover.className = "date-picker-popover";
    popover.dataset.datePopover = "true";
    popover.hidden = true;
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", trigger.getAttribute("aria-label") || "Choose date");
    popover.addEventListener("click", (event) => {
      event.stopPropagation();
      handlePickerAction(picker, event);
    });
    document.body.append(popover);
  }

  trigger.dataset.placeholder = trigger.dataset.placeholder || trigger.textContent.trim() || "Select date";
  updateDisplay(picker);

  trigger.addEventListener("click", () => {
    if (activePicker === picker) {
      closePicker(picker);
    } else {
      openPicker(picker);
    }
  });

  input.addEventListener("input", () => {
    updateDisplay(picker);
    if (activePicker === picker) {
      renderCalendar(picker);
      placePopover(picker);
    }
  });

  input.addEventListener("date-picker:refresh", () => {
    updateDisplay(picker);
    if (activePicker === picker) {
      renderCalendar(picker);
      placePopover(picker);
    }
  });
}

export function initCustomDatePickers(root = document) {
  root.querySelectorAll("[data-date-picker]").forEach(bindPicker);

  if (document.documentElement.dataset.datePickerGlobalBound === "true") return;
  document.documentElement.dataset.datePickerGlobalBound = "true";

  document.addEventListener("click", (event) => {
    const { popover } = activePicker ? pickerParts(activePicker) : {};

    if (activePicker && !activePicker.contains(event.target) && !popover?.contains(event.target)) {
      closePicker(activePicker);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePicker();
  });

  window.addEventListener("resize", () => placePopover(activePicker), { passive: true });
  window.addEventListener("scroll", () => placePopover(activePicker), { capture: true, passive: true });
}
