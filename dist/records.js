import { CATEGORY_LIST, createDefaultDays, getWeekDates, localDateKey, roundHours, calculateSummary } from "./calculations.js";

export const DATA_KEY = "life-capital:v2";
export const DEFAULT_REMINDERS = Object.freeze({ enabled: false, intervalMinutes: 120, start: "09:00", end: "21:00" });
const ids = CATEGORY_LIST.map(c => c.id);
export const emptyRecord = () => Object.fromEntries(ids.map(id => [id, 0]));
export function dateFromKey(key) {
  if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error("日付の形式が正しくありません。");
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12);
  if (localDateKey(date) !== key || y < 1900 || y > 2200) throw new Error("日付の範囲が正しくありません。");
  return date;
}
export function shiftDate(key, offset) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + offset);
  return localDateKey(date);
}
export function weekKey(reference = new Date()) { return getWeekDates(reference)[0].dateKey; }
export function weekDays(data, start) {
  return createDefaultDays().map((day, index) => ({ ...day, ...(data.records[shiftDate(start, index)] || emptyRecord()), id: day.id }));
}
export function createData() {
  return { version: 2, records: {}, goal: "", reviews: {}, reminders: { ...DEFAULT_REMINDERS }, timer: null, savedAt: null, migration: null };
}
export function validateReminders(value) {
  const r = { ...DEFAULT_REMINDERS, ...value };
  if (typeof r.enabled !== "boolean" || ![30, 60, 90, 120, 180, 240].includes(r.intervalMinutes)) throw new Error("通知の間隔を選び直してください。");
  for (const time of [r.start, r.end]) if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("通知する時刻を確認してください。");
  if (r.start >= r.end) throw new Error("終了時刻は開始時刻より後にしてください。");
  return { enabled: r.enabled, intervalMinutes: r.intervalMinutes, start: r.start, end: r.end };
}
export function reminderSlots(settings) {
  const r = validateReminders(settings);
  if (!r.enabled) return [];
  const toMinutes = s => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const slots = [];
  // The first prompt follows a full interval, so 09:00–21:00 / 2h starts at 11:00.
  for (let minute = toMinutes(r.start) + r.intervalMinutes; minute <= toMinutes(r.end); minute += r.intervalMinutes) slots.push({ hour: Math.floor(minute / 60), minute: minute % 60 });
  if (!slots.length) throw new Error("通知する時間帯を、間隔より長くしてください。");
  return slots;
}
export function nextReminder(settings, now = new Date()) {
  const slots = reminderSlots(settings);
  for (let offset = 0; offset < 2; offset++) for (const slot of slots) {
    const at = new Date(now); at.setDate(at.getDate() + offset); at.setHours(slot.hour, slot.minute, 0, 0);
    if (at > now) return at;
  }
  return null;
}
export function parseData(raw) {
  const input = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!input || input.version !== 2 || !input.records || typeof input.records !== "object" || Array.isArray(input.records)) throw new Error("Life Capitalのバックアップではありません。");
  const data = createData();
  if (Object.keys(input.records).length > 37000) throw new Error("記録の件数が多すぎます。");
  for (const [key, record] of Object.entries(input.records)) {
    dateFromKey(key);
    if (!record || typeof record !== "object") throw new Error("記録の形式が正しくありません。");
    const clean = emptyRecord();
    for (const id of ids) {
      const value = record[id];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 168) throw new Error("時間の形式が正しくありません。");
      clean[id] = roundHours(value);
    }
    // Older versions allowed overfull days. Preserve them visibly so users can repair them.
    data.records[key] = clean;
  }
  data.goal = typeof input.goal === "string" ? input.goal.slice(0, 80) : "";
  for (const [key, review] of Object.entries(input.reviews || {})) {
    dateFromKey(key);
    data.reviews[key] = { proud: String(review?.proud || "").slice(0, 500), next: String(review?.next || "").slice(0, 500) };
  }
  data.reminders = validateReminders(input.reminders);
  if (input.timer) {
    if (!ids.includes(input.timer.category) || !Number.isFinite(input.timer.startedAt) || !Number.isFinite(input.timer.id)) throw new Error("タイマーの形式が正しくありません。");
    data.timer = { category: input.timer.category, startedAt: input.timer.startedAt, id: input.timer.id };
  }
  data.savedAt = typeof input.savedAt === "string" ? input.savedAt : null;
  if (input.migration?.week) { dateFromKey(input.migration.week); data.migration = { week: input.migration.week }; }
  return data;
}
export function migrateLegacy(raw, now = new Date()) {
  const old = JSON.parse(raw);
  if (!old || !Array.isArray(old.days) || old.days.length !== 7) throw new Error("以前の記録を読み込めません。");
  const saved = new Date(old.savedAt);
  const start = weekKey(Number.isNaN(saved.getTime()) ? now : saved);
  const data = createData();
  old.days.forEach((day, index) => {
    const record = emptyRecord();
    for (const id of ids) {
      if (typeof day[id] !== "number" || !Number.isFinite(day[id]) || day[id] < 0 || day[id] > 168) throw new Error("以前の時間データを確認してください。");
      record[id] = roundHours(day[id]);
    }
    data.records[shiftDate(start, index)] = record;
  });
  data.migration = { week: start };
  return data;
}
export function addEntries(data, entries) {
  const records = { ...data.records };
  for (const { date, category, hours } of entries) {
    dateFromKey(date);
    if (!ids.includes(category) || !Number.isFinite(hours) || hours <= 0) throw new Error("記録する時間を入力してください。");
    const record = { ...(records[date] || emptyRecord()) };
    record[category] = roundHours(record[category] + hours);
    if (ids.reduce((sum, id) => sum + record[id], 0) > 24.005) throw new Error(`${date}は合計24時間を超えます。曜日別で時間を調整してください。`);
    records[date] = record;
  }
  return { ...data, records };
}
export function timerEntries(timer, endedAt = Date.now()) {
  if (!timer || endedAt <= timer.startedAt) throw new Error("タイマーの時刻を確認してください。");
  if (endedAt - timer.startedAt > 7 * 86400000) throw new Error("7日以上のタイマーは曜日別で記録してください。");
  let cursor = timer.startedAt;
  const entries = [];
  while (cursor < endedAt) {
    const midnight = new Date(cursor); midnight.setHours(24, 0, 0, 0);
    const end = Math.min(endedAt, midnight.getTime());
    const hours = roundHours((end - cursor) / 3600000);
    if (hours > 0) entries.push({ date: localDateKey(new Date(cursor)), category: timer.category, hours });
    cursor = end;
  }
  if (!entries.length) throw new Error("記録には約1分以上計測してください。");
  return entries;
}
export function compareWeeks(data, start) {
  const current = calculateSummary(weekDays(data, start));
  const previous = calculateSummary(weekDays(data, shiftDate(start, -7)));
  return { current, previous, comparable: current.dailyComplete && previous.dailyComplete, investmentChange: roundHours(current.categoryTotals.investment - previous.categoryTotals.investment) };
}
