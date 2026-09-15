import test from "node:test";
import assert from "node:assert/strict";

import {
  WEEK_HOURS,
  calculateSummary,
  createDefaultDays,
  getWeekDates,
  normalizeHours,
  redistributeCategory,
  setDayCategory,
  trySetDayCategory
} from "../dist/calculations.js";

function blankDays() {
  return createDefaultDays().map((day) => ({
    ...day,
    investment: 0,
    consumption: 0,
    waste: 0,
    sleep: 0
  }));
}

test("a new week starts unrecorded without fabricated consumption or sleep", () => {
  const summary = calculateSummary(createDefaultDays());

  assert.equal(summary.totalHours, 0);
  assert.equal(summary.remainingHours, 168);
  assert.equal(summary.allocationComplete, false);
  assert.equal(summary.dailyComplete, false);
  assert.equal(summary.categoryTotals.sleep, 0);
});

test("goal boundaries pass at exactly 20%, 5%, and 49 hours", () => {
  const days = blankDays();
  days[0] = {
    ...days[0],
    investment: 33.6,
    consumption: 77,
    waste: 8.4,
    sleep: 49
  };

  const summary = calculateSummary(days);

  assert.equal(summary.totalHours, WEEK_HOURS);
  assert.equal(summary.investmentRate, 20);
  assert.equal(summary.wasteRate, 5);
  assert.deepEqual(summary.goals, {
    investment: true,
    waste: true,
    sleep: true
  });
});

test("values immediately outside each goal boundary fail", () => {
  const days = blankDays();
  days[0] = {
    ...days[0],
    investment: 33.59,
    waste: 8.41,
    sleep: 48.99
  };

  const summary = calculateSummary(days);

  assert.equal(summary.goals.investment, false);
  assert.equal(summary.goals.waste, false);
  assert.equal(summary.goals.sleep, false);
});

test("rates always use 168 hours as their denominator", () => {
  const days = blankDays();
  days[0].investment = 16.8;
  days[0].waste = 4.2;

  const summary = calculateSummary(days);

  assert.equal(summary.totalHours, 21);
  assert.equal(summary.investmentRate, 10);
  assert.equal(summary.wasteRate, 2.5);
});

test("weekly editing redistributes exactly and leaves the input immutable", () => {
  const original = blankDays();
  original[0].investment = 3;
  original[1].investment = 1;

  const updated = redistributeCategory(original, "investment", 33.6);
  const summary = calculateSummary(updated);

  assert.equal(summary.categoryTotals.investment, 33.6);
  assert.equal(original[0].investment, 3);
  assert.ok(updated[0].investment > updated[1].investment);
});

test("an empty category is distributed across all seven days", () => {
  const updated = redistributeCategory(blankDays(), "sleep", 49);
  const summary = calculateSummary(updated);

  assert.equal(summary.categoryTotals.sleep, 49);
  assert.deepEqual(summary.dayTotals, [7, 7, 7, 7, 7, 7, 7]);
});

test("daily editing updates only the selected day and category", () => {
  const original = createDefaultDays();
  const updated = setDayCategory(original, 2, "investment", 2.5);

  assert.equal(updated[2].investment, 2.5);
  assert.equal(updated[1].investment, 0);
  assert.equal(original[2].investment, 0);
});

test("a daily edit over 24 hours is rejected and clears the last field", () => {
  const original = createDefaultDays();
  original[0].consumption = 17;
  original[0].sleep = 7;
  const result = trySetDayCategory(original, 0, "investment", 1);

  assert.equal(result.accepted, false);
  assert.equal(result.attemptedTotal, 25);
  assert.equal(result.days[0].investment, 0);
  assert.equal(calculateSummary(result.days).dayTotals[0], 24);
});

test("a daily edit at exactly 24 hours is accepted", () => {
  const original = createDefaultDays();
  original[0].sleep = 7;
  const result = trySetDayCategory(original, 0, "consumption", 17);

  assert.equal(result.accepted, true);
  assert.equal(result.attemptedTotal, 24);
  assert.equal(result.days[0].consumption, 17);
});

test("25 is rejected before clamping even in a completely empty day", () => {
  const result = trySetDayCategory(blankDays(), 0, "investment", "25");
  assert.equal(result.accepted, false);
  assert.equal(result.attemptedTotal, 25);
  assert.equal(result.days[0].investment, 0);
});

test("invalid fields, negatives, exponent notation and NaN are rejected", () => {
  for (const value of ["-1", "1e2", "Infinity", "oops", "2 hours"]) {
    assert.equal(trySetDayCategory(blankDays(), 0, "investment", value).accepted, false);
  }
  assert.equal(trySetDayCategory(blankDays(), 99, "investment", 1).accepted, false);
  assert.equal(trySetDayCategory(blankDays(), 0, "unknown", 1).accepted, false);
});

test("clearing an input immediately clears its recorded hours", () => {
  const days = blankDays(); days[2].sleep = 7;
  assert.equal(trySetDayCategory(days, 2, "sleep", "").days[2].sleep, 0);
});

test("week dates run from Monday through Sunday across month boundaries", () => {
  const dates = getWeekDates(new Date(2026, 8, 1, 12));

  assert.deepEqual(dates.map((day) => day.dateKey), [
    "2026-08-31",
    "2026-09-01",
    "2026-09-02",
    "2026-09-03",
    "2026-09-04",
    "2026-09-05",
    "2026-09-06"
  ]);
});

test("invalid and out-of-range input is normalized safely", () => {
  assert.equal(normalizeHours("not-a-number"), 0);
  assert.equal(normalizeHours(-4), 0);
  assert.equal(normalizeHours(999), 168);
  assert.equal(normalizeHours(1.236), 1.24);
});
