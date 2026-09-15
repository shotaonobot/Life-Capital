import test from "node:test";
import assert from "node:assert/strict";
import { createData, parseData, migrateLegacy, weekDays, dateFromKey, weekKey, shiftDate, addEntries, timerEntries, reminderSlots, nextReminder, compareWeeks } from "../dist/records.js";
import { calculateSummary, createDefaultDays } from "../dist/calculations.js";

test("dated records survive a week change and serialize without carrying into next week", () => {
  const data = addEntries(createData(), [{ date: "2026-09-20", category: "investment", hours: 2 }]);
  const restored = parseData(JSON.stringify(data));
  assert.equal(calculateSummary(weekDays(restored, "2026-09-14")).categoryTotals.investment, 2);
  assert.equal(calculateSummary(weekDays(restored, "2026-09-21")).totalHours, 0);
  assert.deepEqual(restored.records, data.records);
});
test("legacy migration anchors to the last saved week and preserves every value", () => {
  const days = createDefaultDays().map(day => ({ ...day, consumption: 17, sleep: 7 }));
  const savedAt = new Date(2026, 7, 30, 19).toISOString();
  const data = migrateLegacy(JSON.stringify({ days, savedAt }), new Date(2026, 8, 15));
  assert.equal(data.migration.week, "2026-08-24");
  assert.equal(data.records["2026-08-30"].sleep, 7);
  assert.equal(calculateSummary(weekDays(data, "2026-09-14")).totalHours, 0);
});
test("invalid backups and invalid dates are rejected instead of replacing data", () => {
  for (const value of ['null', '{}', '{"version":7,"records":{}}', '{broken']) assert.throws(() => parseData(value));
  for (const key of ["2026-02-30", "26-01-01", "2026-13-01", "__proto__"]) assert.throws(() => dateFromKey(key));
  const data = createData(); data.records["2026-09-15"] = { investment: -1, consumption: 0, waste: 0, sleep: 0 };
  assert.throws(() => parseData(data));
});
test("multi-day timer records are atomic when an existing day would overflow", () => {
  const data = addEntries(createData(), [{ date: "2026-09-15", category: "sleep", hours: 24 }]);
  assert.throws(() => addEntries(data, [{ date: "2026-09-14", category: "investment", hours: 1 }, { date: "2026-09-15", category: "investment", hours: 1 }]));
  assert.equal(data.records["2026-09-14"], undefined);
  assert.equal(data.records["2026-09-15"].investment, 0);
});
test("timer divides at local midnight and retains fractional hours", () => {
  const start = new Date(2026, 8, 14, 23, 30).getTime();
  const end = new Date(2026, 8, 15, 0, 30).getTime();
  assert.deepEqual(timerEntries({ startedAt: start, category: "investment" }, end), [{ date: "2026-09-14", category: "investment", hours: .5 }, { date: "2026-09-15", category: "investment", hours: .5 }]);
  assert.throws(() => timerEntries({ startedAt: end, category: "sleep" }, start));
});
test("notifications respect chosen interval and quiet hours, including next day", () => {
  const r = { enabled: true, intervalMinutes: 120, start: "09:00", end: "21:00" };
  assert.deepEqual(reminderSlots(r).map(s => s.hour), [11, 13, 15, 17, 19, 21]);
  assert.equal(nextReminder(r, new Date(2026, 8, 15, 21, 1)).getDate(), 16);
  assert.equal(nextReminder(r, new Date(2026, 8, 15, 21, 1)).getHours(), 11);
  assert.equal(nextReminder({ ...r, enabled: false }), null);
  assert.throws(() => reminderSlots({ ...r, start: "23:00", end: "08:00" }));
  assert.throws(() => reminderSlots({ ...r, start: "20:30", end: "21:00" }));
  const maxSlots = reminderSlots({ ...r, intervalMinutes: 30, start: "00:00", end: "23:59" });
  assert.ok(maxSlots.length < 64);
});
test("an incomplete week cannot be presented as improvement over a complete week", () => {
  let data = createData();
  for (let offset = 0; offset < 14; offset++) data = addEntries(data, [{ date: shiftDate("2026-09-07", offset), category: "consumption", hours: 24 }]);
  assert.equal(compareWeeks(data, "2026-09-14").comparable, true);
  data.records["2026-09-15"].consumption = 0;
  assert.equal(compareWeeks(data, "2026-09-14").comparable, false);
});
test("calendar arithmetic handles year boundary and local DST weeks", () => {
  assert.equal(weekKey(new Date(2027, 0, 1, 12)), "2026-12-28");
  assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftDate("2026-03-07", 2), "2026-03-09");
  assert.equal(shiftDate("2026-10-31", 2), "2026-11-02");
});
