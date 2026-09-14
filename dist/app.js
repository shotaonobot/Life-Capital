import {
  CATEGORY_LIST,
  DAY_HOURS,
  DAY_LIST,
  STORAGE_KEY,
  WEEK_HOURS,
  calculateSummary,
  createDefaultDays,
  normalizeHours,
  redistributeCategory,
  sanitizeDays,
  setDayCategory
} from "./calculations.js";

const MODE_KEY = "life-capital:view-mode";
const state = {
  days: loadDays(),
  mode: loadMode()
};

const editorPanel = document.querySelector("#editor-panel");
const saveStateElement = document.querySelector("#save-state");
const totalHoursElement = document.querySelector("#total-hours");
const allocationStatusElement = document.querySelector("#allocation-status");
const donutChartElement = document.querySelector("#donut-chart");
const legendElement = document.querySelector("#legend");
const resetButton = document.querySelector("#reset-button");
const tabButtons = [...document.querySelectorAll("[data-mode]")];

function loadDays() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return createDefaultDays();
    }
    const parsed = JSON.parse(stored);
    return sanitizeDays(parsed.days);
  } catch {
    return createDefaultDays();
  }
}

function loadMode() {
  try {
    return window.localStorage.getItem(MODE_KEY) === "daily" ? "daily" : "weekly";
  } catch {
    return "weekly";
  }
}

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      days: state.days,
      savedAt: new Date().toISOString()
    }));
    window.localStorage.setItem(MODE_KEY, state.mode);
    saveStateElement.classList.remove("is-error");
    saveStateElement.lastElementChild.textContent = "端末内に保存済み";
  } catch {
    saveStateElement.classList.add("is-error");
    saveStateElement.lastElementChild.textContent = "この端末では保存できません";
  }
}

function formatNumber(value, decimals = 2) {
  const rounded = Number(value.toFixed(decimals));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function formatHours(value) {
  return formatNumber(value) + "h";
}

function formatPercent(value) {
  return Number(value).toFixed(1) + "%";
}

function categoryStyle(category) {
  return "--category-color:" + category.color;
}

function buildLegend(summary) {
  return CATEGORY_LIST.map((category) => {
    const total = summary.categoryTotals[category.id];
    return (
      '<div class="legend-row" style="' + categoryStyle(category) + '">' +
        '<span class="legend-dot" aria-hidden="true"></span>' +
        "<span>" + category.label + "</span>" +
        "<strong>" + formatHours(total) + "</strong>" +
      "</div>"
    );
  }).join("");
}

function buildDonutGradient(summary) {
  let cursor = 0;
  const stops = [];

  for (const category of CATEGORY_LIST) {
    if (cursor >= 100) {
      break;
    }
    const rawWidth = (summary.categoryTotals[category.id] / WEEK_HOURS) * 100;
    const width = Math.max(0, Math.min(100 - cursor, rawWidth));
    if (width > 0) {
      stops.push(category.color + " " + cursor + "% " + (cursor + width) + "%");
      cursor += width;
    }
  }

  if (cursor < 100) {
    stops.push("#E9E6DE " + cursor + "% 100%");
  }

  return "conic-gradient(" + stops.join(", ") + ")";
}

function updateMetric(id, value, passed, result, progress) {
  const card = document.querySelector("#metric-" + id);
  card.classList.toggle("is-pass", passed);
  card.classList.toggle("is-fail", !passed);
  document.querySelector("#" + id + "-value").textContent = value;
  document.querySelector("#" + id + "-result").textContent = result;
  document.querySelector("#" + id + "-track").style.width =
    Math.max(0, Math.min(progress, 100)) + "%";
}


function updateQuickStat(id, value, passed) {
  const element = document.querySelector("#quick-" + id);
  if (!element) {
    return;
  }
  element.classList.toggle("is-pass", passed);
  element.classList.toggle("is-fail", !passed);
  element.querySelector("strong").textContent = value;
}

function updateDashboard() {
  const summary = calculateSummary(state.days);
  totalHoursElement.textContent = formatNumber(summary.totalHours);
  legendElement.innerHTML = buildLegend(summary);
  donutChartElement.style.background = buildDonutGradient(summary);
  donutChartElement.setAttribute(
    "aria-label",
    "168時間中" + formatNumber(summary.totalHours) + "時間を入力済み"
  );

  allocationStatusElement.classList.toggle("is-complete", summary.allocationComplete);
  if (summary.allocationComplete) {
    allocationStatusElement.textContent = "168時間ぴったり";
  } else if (summary.remainingHours > 0) {
    allocationStatusElement.textContent = formatHours(summary.remainingHours) + " 未配分";
  } else {
    allocationStatusElement.textContent = formatHours(Math.abs(summary.remainingHours)) + " 超過";
  }

  updateQuickStat("total", formatHours(summary.totalHours), summary.allocationComplete);
  updateQuickStat("investment", formatPercent(summary.investmentRate), summary.goals.investment);
  updateQuickStat("waste", formatPercent(summary.wasteRate), summary.goals.waste);
  updateQuickStat("sleep", formatHours(summary.categoryTotals.sleep), summary.goals.sleep);

  const investmentGap = Math.max(0, WEEK_HOURS * 0.2 - summary.categoryTotals.investment);
  updateMetric(
    "investment",
    formatPercent(summary.investmentRate),
    summary.goals.investment,
    summary.goals.investment ? "目標達成" : "あと" + formatHours(investmentGap),
    (summary.investmentRate / 20) * 100
  );

  const wasteExcess = Math.max(0, summary.categoryTotals.waste - WEEK_HOURS * 0.05);
  updateMetric(
    "waste",
    formatPercent(summary.wasteRate),
    summary.goals.waste,
    summary.goals.waste ? "上限内" : formatHours(wasteExcess) + " 超過",
    summary.goals.waste ? (summary.wasteRate / 5) * 100 : 100
  );

  const sleepGap = Math.max(0, 49 - summary.categoryTotals.sleep);
  updateMetric(
    "sleep",
    formatHours(summary.categoryTotals.sleep),
    summary.goals.sleep,
    summary.goals.sleep ? "目標達成" : "あと" + formatHours(sleepGap),
    (summary.categoryTotals.sleep / 49) * 100
  );

  updateEditorStats(summary);
}

function weeklyCard(category, total) {
  const percentage = (total / WEEK_HOURS) * 100;
  let target = "168時間のうち " + formatPercent(percentage);
  if (category.id === "investment") {
    target = "目標 33.6h以上";
  } else if (category.id === "waste") {
    target = "上限 8.4h以下";
  } else if (category.id === "sleep") {
    target = "目標 49h以上";
  }

  return (
    '<article class="category-card" data-weekly-card="' + category.id + '" style="' + categoryStyle(category) + '">' +
      '<div class="category-header">' +
        '<span class="category-dot" aria-hidden="true"></span>' +
        "<div><strong>" + category.label + "</strong><span>" + category.shortLabel + "</span></div>" +
      "</div>" +
      '<div class="hour-control">' +
        '<button class="adjust-button" type="button" data-adjust="-0.5" data-category="' + category.id + '" aria-label="' + category.label + 'を0.5時間減らす">−</button>' +
        '<div class="input-wrap">' +
          '<input type="number" min="0" max="168" step="0.25" inputmode="decimal" data-weekly-input="' + category.id + '" value="' + formatNumber(total) + '" aria-label="' + category.label + 'の週合計時間">' +
          '<span class="input-unit">h</span>' +
        "</div>" +
        '<button class="adjust-button" type="button" data-adjust="0.5" data-category="' + category.id + '" aria-label="' + category.label + 'を0.5時間増やす">＋</button>' +
      "</div>" +
      '<div class="category-meta"><span>' + target + '</span><span data-category-current="' + category.id + '">' + formatPercent(percentage) + "</span></div>" +
      '<div class="category-track"><span data-category-track="' + category.id + '" style="width:' + Math.min(percentage, 100) + '%"></span></div>' +
    "</article>"
  );
}

function renderWeekly(summary) {
  editorPanel.innerHTML =
    '<div class="weekly-grid">' +
      CATEGORY_LIST.map((category) => weeklyCard(category, summary.categoryTotals[category.id])).join("") +
    "</div>";

  editorPanel.querySelectorAll("[data-weekly-input]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const rawValue = event.currentTarget.value;
      event.currentTarget.classList.toggle("empty-input", rawValue.trim() === "");
      if (rawValue.trim() === "") {
        return;
      }
      const categoryId = event.currentTarget.dataset.weeklyInput;
      state.days = redistributeCategory(state.days, categoryId, rawValue);
      persist();
      updateDashboard();
    });

    input.addEventListener("blur", (event) => {
      const categoryId = event.currentTarget.dataset.weeklyInput;
      if (event.currentTarget.value.trim() === "") {
        state.days = redistributeCategory(state.days, categoryId, 0);
        persist();
        updateDashboard();
      }
      const current = calculateSummary(state.days).categoryTotals[categoryId];
      event.currentTarget.value = formatNumber(current);
      event.currentTarget.classList.remove("empty-input");
    });
  });

  editorPanel.querySelectorAll("[data-adjust]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const categoryId = event.currentTarget.dataset.category;
      const delta = Number(event.currentTarget.dataset.adjust);
      const current = calculateSummary(state.days).categoryTotals[categoryId];
      state.days = redistributeCategory(
        state.days,
        categoryId,
        normalizeHours(current + delta, WEEK_HOURS)
      );
      persist();
      renderEditor();
      updateDashboard();
    });
  });
}

function dayCard(day, dayIndex, total) {
  const stateClass = Math.abs(total - DAY_HOURS) < 0.005
    ? " is-complete"
    : total > DAY_HOURS
      ? " is-over"
      : "";
  const progress = Math.min((total / DAY_HOURS) * 100, 100);

  return (
    '<article class="day-card' + stateClass + '" data-day-card="' + dayIndex + '">' +
      '<div class="day-header"><strong>' + DAY_LIST[dayIndex].label + '</strong><span class="day-total" data-day-total="' + dayIndex + '">' + formatHours(total) + " / 24h</span></div>" +
      '<div class="day-inputs">' +
        CATEGORY_LIST.map((category) => (
          '<div class="day-field" style="' + categoryStyle(category) + '">' +
            "<label for=\"" + day.id + "-" + category.id + "\">" + category.label + "</label>" +
            '<div class="input-wrap">' +
              '<input id="' + day.id + "-" + category.id + '" type="number" min="0" max="24" step="0.25" inputmode="decimal" data-day-index="' + dayIndex + '" data-day-category="' + category.id + '" value="' + formatNumber(day[category.id]) + '">' +
              '<span class="input-unit">h</span>' +
            "</div>" +
          "</div>"
        )).join("") +
      "</div>" +
      '<div class="day-track"><span data-day-track="' + dayIndex + '" style="width:' + progress + '%"></span></div>' +
    "</article>"
  );
}

function renderDaily(summary) {
  editorPanel.innerHTML =
    '<div class="daily-grid">' +
      summary.days.map((day, index) => dayCard(day, index, summary.dayTotals[index])).join("") +
    "</div>";

  editorPanel.querySelectorAll("[data-day-category]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const rawValue = event.currentTarget.value;
      event.currentTarget.classList.toggle("empty-input", rawValue.trim() === "");
      if (rawValue.trim() === "") {
        return;
      }
      const dayIndex = Number(event.currentTarget.dataset.dayIndex);
      const categoryId = event.currentTarget.dataset.dayCategory;
      state.days = setDayCategory(state.days, dayIndex, categoryId, rawValue);
      persist();
      updateDashboard();
    });

    input.addEventListener("blur", (event) => {
      const dayIndex = Number(event.currentTarget.dataset.dayIndex);
      const categoryId = event.currentTarget.dataset.dayCategory;
      if (event.currentTarget.value.trim() === "") {
        state.days = setDayCategory(state.days, dayIndex, categoryId, 0);
        persist();
        updateDashboard();
      }
      event.currentTarget.value = formatNumber(state.days[dayIndex][categoryId]);
      event.currentTarget.classList.remove("empty-input");
    });
  });
}

function updateEditorStats(summary) {
  if (state.mode === "weekly") {
    for (const category of CATEGORY_LIST) {
      const total = summary.categoryTotals[category.id];
      const percentage = (total / WEEK_HOURS) * 100;
      const currentElement = editorPanel.querySelector('[data-category-current="' + category.id + '"]');
      const trackElement = editorPanel.querySelector('[data-category-track="' + category.id + '"]');
      const inputElement = editorPanel.querySelector('[data-weekly-input="' + category.id + '"]');
      if (currentElement) {
        currentElement.textContent = formatPercent(percentage);
      }
      if (trackElement) {
        trackElement.style.width = Math.min(percentage, 100) + "%";
      }
      if (inputElement && document.activeElement !== inputElement) {
        inputElement.value = formatNumber(total);
      }
    }
    return;
  }

  summary.dayTotals.forEach((total, dayIndex) => {
    const card = editorPanel.querySelector('[data-day-card="' + dayIndex + '"]');
    const totalElement = editorPanel.querySelector('[data-day-total="' + dayIndex + '"]');
    const trackElement = editorPanel.querySelector('[data-day-track="' + dayIndex + '"]');
    if (!card || !totalElement || !trackElement) {
      return;
    }
    card.classList.toggle("is-complete", Math.abs(total - DAY_HOURS) < 0.005);
    card.classList.toggle("is-over", total > DAY_HOURS + 0.005);
    totalElement.textContent = formatHours(total) + " / 24h";
    trackElement.style.width = Math.min((total / DAY_HOURS) * 100, 100) + "%";
  });
}

function renderEditor() {
  const summary = calculateSummary(state.days);
  tabButtons.forEach((button) => {
    const selected = button.dataset.mode === state.mode;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });

  if (state.mode === "daily") {
    renderDaily(summary);
  } else {
    renderWeekly(summary);
  }
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    persist();
    renderEditor();
    updateDashboard();
  });
});

resetButton.addEventListener("click", () => {
  const confirmed = window.confirm(
    "入力した時間を消去し、睡眠7時間・消費17時間の初期状態へ戻しますか？"
  );
  if (!confirmed) {
    return;
  }
  state.days = createDefaultDays();
  persist();
  renderEditor();
  updateDashboard();
});

window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) {
    state.days = loadDays();
    renderEditor();
    updateDashboard();
  }
});

renderEditor();
updateDashboard();
persist();
