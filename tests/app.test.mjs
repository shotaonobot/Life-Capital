import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Window } from "happy-dom";
import { DATA_KEY, createData } from "../dist/records.js";

globalThis.__LC_TEST__ = true;
const { createApp } = await import("../dist/app.js");
const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");

async function setup({ data = null, time = new Date(2026, 8, 15, 12), rejectWrites = false, raw = null } = {}) {
  const win = new Window({ url: "https://example.test", settings: { enableJavaScriptEvaluation: false } });
  globalThis.window = win; globalThis.document = win.document; globalThis.location = win.location; globalThis.confirm = () => true;
  win.document.write(html);
  const store = new Map(); if (data) store.set(DATA_KEY, JSON.stringify(data)); if (raw !== null) store.set(DATA_KEY, raw);
  const platform = { isNative: false, async read(key) { return store.get(key) ?? null; }, async write(key, value) { if (rejectWrites) throw new Error("QuotaExceeded"); store.set(key, value); }, async remove(key) { store.delete(key); }, async configureReminders() {}, async onReminder() {}, async onResume() {}, async exportFile() {}, async shareText() {} };
  let current = time;
  const app = await createApp({ platform, now: () => new Date(current), timers: false });
  const $ = selector => win.document.querySelector(selector);
  const input = (selector, value) => { $(selector).value = value; $(selector).dispatchEvent(new win.Event("input", { bubbles: true })); };
  const submit = selector => $(selector).dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
  return { win, $, app, input, submit, store, data: () => JSON.parse(store.get(DATA_KEY)), setTime: value => { current = value; app.tick(); }, close: () => { app.dispose(); win.happyDOM.abort(); win.close(); } };
}

test("daily entry selects text, saves, instantly recalculates and rejects overflowing field", async () => {
  const h = await setup();
  try {
    h.input("#mon-sleep", "7"); h.input("#mon-consumption", "17"); await h.app.whenSaved();
    h.$("#mon-sleep").focus(); assert.equal(h.$("#mon-sleep").selectionStart, 0); assert.equal(h.$("#mon-sleep").selectionEnd, 1);
    h.input("#mon-investment", "1"); await h.app.whenSaved();
    assert.equal(h.$("#mon-investment").value, "");
    assert.equal(h.$("#mon-investment").getAttribute("aria-invalid"), "true");
    assert.equal(h.$('[data-day-card="0"]').classList.contains("is-over"), true);
    assert.equal(h.data().records["2026-09-14"].investment, 0);
    assert.equal(h.$("#quick-total strong").textContent, "24h");
    h.input("#mon-consumption", "16");
    assert.equal(h.$('[data-day-card="0"]').classList.contains("is-over"), true, "editing another field must not erase the rejected field error");
    h.input("#mon-investment", "1"); await h.app.whenSaved();
    assert.equal(h.$('[data-day-card="0"]').classList.contains("is-over"), false);
    assert.equal(h.data().records["2026-09-14"].investment, 1);
    h.$("#weekly-tab").click();
    assert.equal(h.$('[data-weekly-input="sleep"]').readOnly, true);
    assert.equal(h.$('[data-weekly-input="sleep"]').value, "7");
  } finally { h.close(); }
});

test("quick logging adds minutes once and undo restores the previous record", async () => {
  const h = await setup();
  try {
    h.input("#quick-minutes", "90"); h.submit("#quick-form"); await h.app.whenSaved();
    assert.equal(h.data().records["2026-09-15"].investment, 1.5);
    assert.equal(h.$("#quick-total strong").textContent, "1.5h");
    h.$("#undo-action").click(); await h.app.whenSaved();
    assert.equal(h.data().records["2026-09-15"], undefined);
    assert.equal(h.$("#quick-total strong").textContent, "0h");
  } finally { h.close(); }
});

test("Sunday midnight opens an empty next week; history retains the previous Sunday", async () => {
  const h = await setup({ time: new Date(2026, 8, 20, 23, 59) });
  try {
    h.input("#sun-sleep", "7"); await h.app.whenSaved();
    h.setTime(new Date(2026, 8, 21, 0, 0));
    assert.equal(h.$(".is-today").dataset.date, "2026-09-21");
    assert.equal(h.$("#quick-total strong").textContent, "0h");
    assert.equal(h.$("#quick-date").value, "2026-09-21");
    h.$('[data-week-shift="-1"]').click();
    assert.equal(h.$("#sun-sleep").value, "7");
    assert.equal(h.$(".is-today"), null);
  } finally { h.close(); }
});

test("midnight highlight moves without disrupting an active input in the same week", async () => {
  const h = await setup({ time: new Date(2026, 8, 15, 23, 59) });
  try {
    h.$("#tue-investment").focus(); const field = h.$("#tue-investment");
    h.setTime(new Date(2026, 8, 16, 0, 0));
    assert.equal(h.$(".is-today").dataset.date, "2026-09-16");
    assert.equal(h.$("#tue-investment"), field);
    assert.equal(h.win.document.activeElement, field);
  } finally { h.close(); }
});

test("reload restores records and timer; stopping across midnight records both dates", async () => {
  const data = createData(); data.timer = { startedAt: new Date(2026, 8, 14, 23, 30).getTime(), id: 1, category: "investment" };
  const h = await setup({ data, time: new Date(2026, 8, 15, 0, 30) });
  try {
    assert.equal(h.$("#timer-elapsed").textContent, "01:00:00");
    h.$("#timer-toggle").click(); await h.app.whenSaved();
    assert.equal(h.data().records["2026-09-14"].investment, .5);
    assert.equal(h.data().records["2026-09-15"].investment, .5);
    assert.equal(h.data().timer, null);
    assert.equal(h.$("#timer-toggle").textContent, "計測を始める");
  } finally { h.close(); }
});

test("save failure is visible while keeping entered values available for export", async () => {
  const h = await setup({ rejectWrites: true });
  try {
    h.input("#mon-sleep", "7"); await h.app.whenSaved();
    assert.match(h.$("#save-state").textContent, /未保存/);
    assert.equal(h.$("#mon-sleep").value, "7");
    assert.equal(h.store.has(DATA_KEY), false);
  } finally { h.close(); }
});

test("corrupt existing data is never silently overwritten by new entries", async () => {
  const h = await setup({ raw: "{broken" });
  try {
    h.submit("#quick-form"); await h.app.whenSaved();
    assert.equal(h.store.get(DATA_KEY), "{broken");
    assert.match(h.$("#load-notice").textContent, /上書きを止め/);
  } finally { h.close(); }
});

test("foreground reminder appears at a scheduled interval, not during quiet hours", async () => {
  const data = createData(); data.reminders = { enabled: true, intervalMinutes: 120, start: "09:00", end: "21:00" };
  const h = await setup({ data, time: new Date(2026, 8, 15, 10, 59) });
  try {
    h.setTime(new Date(2026, 8, 15, 11));
    assert.equal(h.$("#reminder-banner").hidden, false);
    h.$("#reminder-dismiss").click();
    h.setTime(new Date(2026, 8, 15, 23));
    assert.equal(h.$("#reminder-banner").hidden, true);
    assert.match(h.$("#notification-mode").textContent, /閉じた状態.*対応していません/);
  } finally { h.close(); }
});
