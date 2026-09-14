import test from "node:test";
import assert from "node:assert/strict";

import {
  WEEK_HOURS,
  calculateSummary,
  createDefaultDays,
  normalizeHours,
  redistributeCategory,
  setDayCategory
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

test("the default week contains exactly 168 hours", () => {
  const summary = calculateSummary(createDefaultDays());

  assert.equal(summary.totalHours, 168);
  assert.equal(summary.remainingHours, 0);
  assert.equal(summary.allocationComplete, true);
  assert.equal(summary.dailyComplete, true);
  assert.equal(summary.categoryTotals.sleep, 49);
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

test("invalid and out-of-range input is normalized safely", () => {
  assert.equal(normalizeHours("not-a-number"), 0);
  assert.equal(normalizeHours(-4), 0);
  assert.equal(normalizeHours(999), 168);
  assert.equal(normalizeHours(1.236), 1.24);
});
