export const WEEK_HOURS = 168;
export const DAY_HOURS = 24;
export const STORAGE_KEY = "life-capital:v1";

export const CATEGORY_LIST = Object.freeze([
  {
    id: "investment",
    label: "投資",
    shortLabel: "INVEST",
    description: "未来の自分に返ってくる時間",
    color: "#0AA678"
  },
  {
    id: "consumption",
    label: "消費",
    shortLabel: "LIVING",
    description: "生活と役割を支える時間",
    color: "#4777F5"
  },
  {
    id: "waste",
    label: "浪費",
    shortLabel: "WASTE",
    description: "意図せず流れてしまった時間",
    color: "#EF6A5B"
  },
  {
    id: "sleep",
    label: "睡眠",
    shortLabel: "SLEEP",
    description: "回復と判断力を守る時間",
    color: "#7657E8"
  }
]);

export const DAY_LIST = Object.freeze([
  { id: "mon", label: "月", longLabel: "月曜日" },
  { id: "tue", label: "火", longLabel: "火曜日" },
  { id: "wed", label: "水", longLabel: "水曜日" },
  { id: "thu", label: "木", longLabel: "木曜日" },
  { id: "fri", label: "金", longLabel: "金曜日" },
  { id: "sat", label: "土", longLabel: "土曜日" },
  { id: "sun", label: "日", longLabel: "日曜日" }
]);

const CATEGORY_IDS = CATEGORY_LIST.map((category) => category.id);

export function roundHours(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function normalizeHours(value, maximum = WEEK_HOURS) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return roundHours(Math.min(Math.max(parsed, 0), maximum));
}

export function createDefaultDays() {
  return DAY_LIST.map((day) => ({
    id: day.id,
    investment: 0,
    consumption: 17,
    waste: 0,
    sleep: 7
  }));
}

export function sanitizeDays(input) {
  if (!Array.isArray(input) || input.length !== DAY_LIST.length) {
    return createDefaultDays();
  }

  return DAY_LIST.map((day, index) => {
    const source = input[index] && typeof input[index] === "object" ? input[index] : {};
    const clean = { id: day.id };
    for (const categoryId of CATEGORY_IDS) {
      clean[categoryId] = normalizeHours(source[categoryId], WEEK_HOURS);
    }
    return clean;
  });
}

export function calculateSummary(inputDays) {
  const days = sanitizeDays(inputDays);
  const categoryTotals = Object.fromEntries(CATEGORY_IDS.map((id) => [id, 0]));

  const dayTotals = days.map((day) => {
    let total = 0;
    for (const categoryId of CATEGORY_IDS) {
      categoryTotals[categoryId] += day[categoryId];
      total += day[categoryId];
    }
    return roundHours(total);
  });

  for (const categoryId of CATEGORY_IDS) {
    categoryTotals[categoryId] = roundHours(categoryTotals[categoryId]);
  }

  const totalHours = roundHours(
    Object.values(categoryTotals).reduce((sum, value) => sum + value, 0)
  );
  const remainingHours = roundHours(WEEK_HOURS - totalHours);
  const investmentRate = roundHours((categoryTotals.investment / WEEK_HOURS) * 100);
  const wasteRate = roundHours((categoryTotals.waste / WEEK_HOURS) * 100);

  return {
    days,
    categoryTotals,
    dayTotals,
    totalHours,
    remainingHours,
    investmentRate,
    wasteRate,
    allocationComplete: Math.abs(remainingHours) < 0.005,
    dailyComplete: dayTotals.every((total) => Math.abs(total - DAY_HOURS) < 0.005),
    goals: {
      investment: categoryTotals.investment + 0.0001 >= WEEK_HOURS * 0.2,
      waste: categoryTotals.waste <= WEEK_HOURS * 0.05 + 0.0001,
      sleep: categoryTotals.sleep + 0.0001 >= 49
    }
  };
}

export function setDayCategory(inputDays, dayIndex, categoryId, value) {
  const days = sanitizeDays(inputDays);
  if (
    !Number.isInteger(dayIndex) ||
    dayIndex < 0 ||
    dayIndex >= days.length ||
    !CATEGORY_IDS.includes(categoryId)
  ) {
    return days;
  }

  return days.map((day, index) => (
    index === dayIndex
      ? { ...day, [categoryId]: normalizeHours(value, DAY_HOURS) }
      : { ...day }
  ));
}

export function redistributeCategory(inputDays, categoryId, nextTotal) {
  const days = sanitizeDays(inputDays);
  if (!CATEGORY_IDS.includes(categoryId)) {
    return days;
  }

  const targetCents = Math.round(normalizeHours(nextTotal, WEEK_HOURS) * 100);
  const currentCents = days.map((day) => Math.round(day[categoryId] * 100));
  const currentTotal = currentCents.reduce((sum, value) => sum + value, 0);
  const weights = currentTotal > 0
    ? currentCents
    : days.map(() => 1);
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const quotas = weights.map((weight) => (weight / weightTotal) * targetCents);
  const distributed = quotas.map((quota) => Math.floor(quota));
  let remainder = targetCents - distributed.reduce((sum, value) => sum + value, 0);

  const order = quotas
    .map((quota, index) => ({ index, fraction: quota - Math.floor(quota) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (let index = 0; index < remainder; index += 1) {
    distributed[order[index % order.length].index] += 1;
  }

  return days.map((day, index) => ({
    ...day,
    [categoryId]: distributed[index] / 100
  }));
}
