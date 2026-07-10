const selectSelector = 'select:not(.native-vehicle-select):not([data-custom-select-skip="true"])';

let activeSelect = null;
let selectId = 0;
let placementFrame = 0;

function labelForSelect(select) {
  const explicitLabel = select.getAttribute("aria-label");
  if (explicitLabel) return explicitLabel;

  const label = select.closest("label");
  if (label) {
    return [...label.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent.trim())
      .filter(Boolean)
      .join(" ");
  }

  return select.name ? select.name.replace(/[_-]+/g, " ") : "Choose an option";
}

function selectParts(select) {
  const shellId = select.dataset.customSelectShell;
  const popoverId = select.dataset.customSelectPopover;

  return {
    shell: shellId ? document.getElementById(shellId) : null,
    trigger: shellId ? document.getElementById(`${shellId}-trigger`) : null,
    display: shellId ? document.getElementById(`${shellId}-display`) : null,
    popover: popoverId ? document.getElementById(popoverId) : null,
  };
}

function placePopover(select) {
  if (!select) return;

  const { trigger, popover } = selectParts(select);
  if (!trigger || !popover || popover.hidden) return;

  const triggerRect = trigger.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(Math.max(triggerRect.width, 190), viewportWidth - 24);
  const left = Math.min(Math.max(12, triggerRect.left), viewportWidth - width - 12);
  const popoverHeight = Math.min(popover.offsetHeight || 240, 320);
  const belowTop = triggerRect.bottom + 8;
  const aboveTop = triggerRect.top - popoverHeight - 8;
  const roomBelow = viewportHeight - belowTop - 12;
  const roomAbove = triggerRect.top - 12;
  const top = roomBelow < Math.min(popoverHeight, 220) && roomAbove > roomBelow ? Math.max(12, aboveTop) : belowTop;
  const maxHeight = Math.max(180, viewportHeight - top - 12);

  popover.style.setProperty("--custom-select-left", `${left}px`);
  popover.style.setProperty("--custom-select-top", `${top}px`);
  popover.style.setProperty("--custom-select-width", `${width}px`);
  popover.style.setProperty("--custom-select-max-height", `${maxHeight}px`);
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

function selectedOption(select) {
  return select.selectedOptions?.[0] || select.options[select.selectedIndex] || null;
}

function updateDisplay(select) {
  const { trigger, display } = selectParts(select);
  const option = selectedOption(select);
  if (!trigger || !display || !option) return;

  display.textContent = option.textContent.trim() || option.value || "Select option";
  trigger.classList.toggle("has-value", Boolean(select.value));
  trigger.disabled = select.disabled;
}

function renderOptions(select) {
  const { popover } = selectParts(select);
  if (!popover) return;

  popover.replaceChildren(
    ...[...select.options].map((option, index) => {
      const button = document.createElement("button");
      const isSelected = index === select.selectedIndex;

      button.type = "button";
      button.className = `custom-select-option${isSelected ? " is-selected" : ""}`;
      button.dataset.customSelectOption = String(index);
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(isSelected));
      button.disabled = option.disabled;
      button.textContent = option.textContent.trim() || option.value;

      return button;
    }),
  );
}

function closeSelect(select = activeSelect) {
  if (!select) return;

  const { shell, trigger, popover } = selectParts(select);
  shell?.classList.remove("is-open");
  trigger?.setAttribute("aria-expanded", "false");
  if (popover) popover.hidden = true;
  if (activeSelect === select) {
    activeSelect = null;
    cancelQueuedPopoverPlacement();
  }
}

function focusSelectedOption(select) {
  const { popover } = selectParts(select);
  if (!popover) return;

  const selected = popover.querySelector(".custom-select-option.is-selected:not(:disabled)");
  const first = popover.querySelector(".custom-select-option:not(:disabled)");
  (selected || first)?.focus();
}

function openSelect(select, { focusOption = false } = {}) {
  const { shell, trigger, popover } = selectParts(select);
  if (!shell || !trigger || !popover || select.disabled) return;

  if (activeSelect && activeSelect !== select) closeSelect(activeSelect);

  renderOptions(select);
  updateDisplay(select);
  shell.classList.add("is-open");
  popover.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
  activeSelect = select;
  placePopover(select);

  if (focusOption) focusSelectedOption(select);
}

function setSelectIndex(select, index) {
  const nextIndex = Number(index);
  const option = select.options[nextIndex];
  if (!option || option.disabled) return;

  select.selectedIndex = nextIndex;
  updateDisplay(select);
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
  closeSelect(select);
}

function moveOptionFocus(popover, direction) {
  const options = [...popover.querySelectorAll(".custom-select-option:not(:disabled)")];
  if (!options.length) return;

  const activeIndex = options.indexOf(document.activeElement);
  const nextIndex = activeIndex === -1 ? 0 : (activeIndex + direction + options.length) % options.length;
  options[nextIndex].focus();
}

function bindCustomSelect(select) {
  if (select.dataset.customSelectBound === "true") return;
  select.dataset.customSelectBound = "true";

  selectId += 1;
  const shellId = `custom-select-${selectId}`;
  const popoverId = `${shellId}-popover`;
  const shell = document.createElement("span");
  const trigger = document.createElement("button");
  const display = document.createElement("span");
  const popover = document.createElement("div");

  select.classList.add("native-custom-select");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");
  select.dataset.customSelectShell = shellId;
  select.dataset.customSelectPopover = popoverId;

  shell.id = shellId;
  shell.className = "custom-select-shell";

  display.id = `${shellId}-display`;
  display.dataset.customSelectDisplay = "true";

  trigger.id = `${shellId}-trigger`;
  trigger.className = "custom-select-trigger";
  trigger.type = "button";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", popoverId);
  trigger.setAttribute("aria-label", labelForSelect(select));
  trigger.append(display);

  popover.id = popoverId;
  popover.className = "custom-select-popover";
  popover.hidden = true;
  popover.setAttribute("role", "listbox");
  popover.setAttribute("aria-label", trigger.getAttribute("aria-label"));

  shell.append(trigger);
  select.insertAdjacentElement("afterend", shell);
  document.body.append(popover);

  trigger.addEventListener("click", () => {
    if (activeSelect === select) {
      closeSelect(select);
    } else {
      openSelect(select);
    }
  });

  trigger.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) return;

    event.preventDefault();
    openSelect(select, { focusOption: true });
  });

  popover.addEventListener("click", (event) => {
    const option = event.target.closest("[data-custom-select-option]");
    if (!option) return;

    event.stopPropagation();
    setSelectIndex(select, option.dataset.customSelectOption);
  });

  popover.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSelect(select);
      trigger.focus();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveOptionFocus(popover, event.key === "ArrowDown" ? 1 : -1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = event.target.closest("[data-custom-select-option]");
      if (option) setSelectIndex(select, option.dataset.customSelectOption);
    }
  });

  select.addEventListener("input", () => updateDisplay(select));
  select.addEventListener("change", () => updateDisplay(select));
  select.addEventListener("custom-select:refresh", () => {
    updateDisplay(select);
    if (activeSelect === select) {
      renderOptions(select);
      placePopover(select);
    }
  });

  const observer = new MutationObserver(() => {
    updateDisplay(select);
    if (activeSelect === select) {
      renderOptions(select);
      placePopover(select);
    }
  });
  observer.observe(select, { childList: true, subtree: true, attributes: true });

  updateDisplay(select);
}

export function refreshCustomSelects(root = document) {
  root.querySelectorAll(selectSelector).forEach((select) => {
    if (select.dataset.customSelectBound === "true") {
      updateDisplay(select);
      return;
    }

    bindCustomSelect(select);
  });
}

export function initCustomSelects(root = document) {
  refreshCustomSelects(root);

  if (document.documentElement.dataset.customSelectGlobalBound === "true") return;
  document.documentElement.dataset.customSelectGlobalBound = "true";

  document.addEventListener("click", (event) => {
    const { shell, popover } = activeSelect ? selectParts(activeSelect) : {};

    if (activeSelect && !shell?.contains(event.target) && !popover?.contains(event.target)) {
      closeSelect(activeSelect);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSelect();
  });

  document.addEventListener("reset", (event) => {
    window.setTimeout(() => refreshCustomSelects(event.target), 0);
  });

  window.addEventListener("resize", queuePopoverPlacement, { passive: true });
  window.addEventListener("scroll", queuePopoverPlacement, { capture: true, passive: true });
}
