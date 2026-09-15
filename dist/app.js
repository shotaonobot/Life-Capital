import { CATEGORY_LIST, STORAGE_KEY, calculateSummary, getWeekDates, localDateKey, roundHours, trySetDayCategory } from "./calculations.js";
import { DATA_KEY, createData, parseData, migrateLegacy, emptyRecord, dateFromKey, weekKey, shiftDate, weekDays, addEntries, timerEntries, compareWeeks, validateReminders, reminderSlots, nextReminder } from "./records.js";
import * as webPlatform from "./platform.js";

const fmt = n => String(roundHours(n));
const hours = n => fmt(n) + "h";
const percent = n => n.toFixed(1) + "%";
const escape = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const shortDate = key => { const d = dateFromKey(key); return `${d.getMonth() + 1}/${d.getDate()}`; };

export async function createApp({ platform = webPlatform, now = () => new Date(), timers = true } = {}) {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const state = { data: createData(), start: weekKey(now()), today: localDateKey(now()), mode: "daily", page: "record", invalid: new Map(), undo: null, blocked: false, raw: null, due: null };
  let saveQueue = Promise.resolve();
  let revision = 0;
  const show = (id, message) => { const el = $(id); el.textContent = message; el.hidden = !message; };
  const setSave = (text, error = false) => { $("#save-state").textContent = text; $("#save-state").classList.toggle("is-error", error); };
  function notice(message) { show("#load-notice", message); }
  try {
    const raw = await platform.read(DATA_KEY);
    state.raw = raw;
    if (raw !== null) state.data = parseData(raw);
    else {
      const legacy = await platform.read(STORAGE_KEY);
      if (legacy) { state.raw = legacy; state.data = migrateLegacy(legacy, now()); }
    }
    if (state.data.migration) notice(`以前の記録は、最後に保存した日をもとに ${state.data.migration.week} の週へ移しました。日付が合っているか、振り返りで確認してください。`);
    setSave(raw ? "端末内に保存済み" : "この端末に自動保存");
  } catch (error) {
    state.blocked = true;
    notice("保存データを読み込めません。上書きを止めています。設定からバックアップを書き出すか、保存済みのバックアップを読み込んでください。");
    setSave("保存データを確認してください", true);
  }
  function persist() {
    if (state.blocked) { setSave("元のデータを保護中・未保存", true); return Promise.resolve(false); }
    const current = ++revision;
    state.data.savedAt = now().toISOString();
    const serialized = JSON.stringify(state.data);
    setSave("保存中…");
    saveQueue = saveQueue.catch(() => {}).then(async () => {
      try { await platform.write(DATA_KEY, serialized); if (current === revision) setSave("端末内に保存済み"); return true; }
      catch { setSave("未保存・バックアップできます", true); return false; }
    });
    return saveQueue;
  }
  function editable() {
    if (!state.blocked) return true;
    toast("設定で保存データを確認してください。"); return false;
  }
  function toast(message, undo = null) {
    state.undo = undo; $("#toast span").textContent = message; $("#toast").hidden = false; $("#undo-action").hidden = !undo;
  }
  function clearUndo() { state.undo = null; $("#undo-action").hidden = true; }
  function setPage(page, focus = false) {
    state.page = ["record", "review", "settings"].includes(page) ? page : "record";
    $$('[data-screen]').forEach(el => { el.hidden = el.dataset.screen !== state.page; });
    $$('[data-page]').forEach(el => { if (el.dataset.page === state.page) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current"); });
    if (state.page === "review") renderReview();
    if (focus) { const title = $(`#page-${state.page} h1`); title.tabIndex = -1; title.focus(); }
  }
  function selectNumber(input) { input.addEventListener("focus", () => input.select()); input.addEventListener("click", () => input.select()); }
  function renderEditor() {
    const days = weekDays(state.data, state.start);
    const summary = calculateSummary(days);
    const dates = getWeekDates(dateFromKey(state.start));
    $$('[data-mode]').forEach(el => { const active = el.dataset.mode === state.mode; el.setAttribute("aria-selected", String(active)); el.tabIndex = active ? 0 : -1; });
    $("#editor-panel").setAttribute("aria-labelledby", `${state.mode}-tab`);
    if (state.mode === "weekly") {
      $("#editor-panel").innerHTML = '<div class="weekly-grid">' + CATEGORY_LIST.map(c => `<article class="category-card" style="--category-color:${c.color}"><h3>${c.label}</h3><div class="input-wrap"><input type="text" value="${fmt(summary.categoryTotals[c.id])}" aria-label="${c.label}の週合計時間" data-weekly-input="${c.id}" readonly aria-readonly="true"><span>h</span></div><small>${escape(c.description)}</small><div class="category-track"><span style="width:${Math.min(100, summary.categoryTotals[c.id] / 168 * 100)}%"></span></div></article>`).join("") + "</div>";
    } else {
      $("#editor-panel").innerHTML = '<div class="daily-grid">' + days.map((day, index) => {
        const d = dates[index], today = d.dateKey === state.today;
        return `<article class="day-card${today ? " is-today" : ""}" data-day-card="${index}" data-date="${d.dateKey}"><div class="day-header"><strong>${d.label}</strong><time datetime="${d.dateKey}">${d.dateLabel}</time></div><p class="today-tag">${today ? "今日" : ""}</p><div class="day-inputs">${CATEGORY_LIST.map(c => {
          const key = `${d.dateKey}:${c.id}`, invalid = state.invalid.has(key);
          return `<div class="day-field" style="--category-color:${c.color}"><label for="${day.id}-${c.id}">${c.label}</label><div class="input-wrap"><input id="${day.id}-${c.id}" type="text" inputmode="decimal" autocomplete="off" data-day-index="${index}" data-day-category="${c.id}" value="${invalid ? "" : fmt(day[c.id])}" aria-label="${d.dateLabel} ${d.longLabel} ${c.label}の時間" aria-describedby="day-error-${index}" ${invalid ? 'aria-invalid="true"' : ""}><span>h</span></div></div>`;
        }).join("")}</div><p class="day-total" data-day-total="${index}"></p><div class="day-track"><span data-day-track="${index}"></span></div><p id="day-error-${index}" class="day-error" role="status" hidden></p></article>`;
      }).join("") + "</div>";
      $$('[data-day-category]').forEach(input => {
        selectNumber(input);
        input.addEventListener("input", () => {
          if (!editable()) { input.value = ""; return; }
          const index = Number(input.dataset.dayIndex), category = input.dataset.dayCategory;
          const date = shiftDate(state.start, index), key = `${date}:${category}`;
          const result = trySetDayCategory(weekDays(state.data, state.start), index, category, input.value);
          const record = emptyRecord(); CATEGORY_LIST.forEach(c => { record[c.id] = result.days[index][c.id]; });
          state.data.records[date] = record;
          if (!result.accepted) { input.value = ""; input.setAttribute("aria-invalid", "true"); state.invalid.set(key, result.reason === "invalid-number" ? "0以上の数字で入力してください。" : "24時間を超えたため、最後の入力を空欄にしました。"); }
          else { state.invalid.delete(key); input.removeAttribute("aria-invalid"); }
          clearUndo(); persist(); updateSummary();
        });
        input.addEventListener("blur", () => {
          const date = shiftDate(state.start, Number(input.dataset.dayIndex)), category = input.dataset.dayCategory;
          if (!state.invalid.has(`${date}:${category}`)) input.value = fmt((state.data.records[date] || emptyRecord())[category]);
        });
      });
    }
    updateSummary();
  }
  function updateSummary() {
    const s = calculateSummary(weekDays(state.data, state.start));
    const hasData = s.totalHours > 0;
    const quick = (id, value, status, text) => {
      const el = $(`#quick-${id}`); el.querySelector("strong").textContent = value; el.querySelector("small").textContent = text;
      el.classList.toggle("is-pass", status === true); el.classList.toggle("is-fail", status === false);
    };
    quick("total", hours(s.totalHours), s.dailyComplete ? true : null, s.remainingHours >= 0 ? `未記録 ${hours(s.remainingHours)}` : `超過 ${hours(-s.remainingHours)}`);
    quick("investment", percent(s.investmentRate), hasData ? s.goals.investment : null, `20%以上 · ${s.goals.investment ? "基準達成" : hasData ? "あと" + hours(Math.max(0, 33.6 - s.categoryTotals.investment)) : "未記録"}`);
    quick("waste", percent(s.wasteRate), hasData ? s.goals.waste : null, `5%以下 · ${!hasData ? "未記録" : s.goals.waste ? (s.dailyComplete ? "基準内" : "現時点で基準内") : "基準超過"}`);
    quick("sleep", hours(s.categoryTotals.sleep), hasData ? s.goals.sleep : null, `49h以上 · ${s.goals.sleep ? "基準達成" : hasData ? "あと" + hours(Math.max(0, 49 - s.categoryTotals.sleep)) : "未記録"}`);
    $("#week-context").textContent = !hasData ? "まだ記録がありません。少しずつ埋めていきましょう。" : s.dailyComplete ? "7日分の記録がそろいました。振り返りで一週間を見てみよう。" : "入力途中の判定です。投資率・浪費率は、週168時間を基準に計算しています。";
    s.days.forEach((day, index) => {
      const card = $(`[data-day-card="${index}"]`); if (!card) return;
      const date = shiftDate(state.start, index);
      const errors = CATEGORY_LIST.map(c => state.invalid.get(`${date}:${c.id}`)).filter(Boolean);
      const over = s.dayTotals[index] > 24.005;
      card.classList.toggle("is-over", over || errors.length > 0);
      card.classList.toggle("is-complete", Math.abs(s.dayTotals[index] - 24) < .005);
      $(`[data-day-total="${index}"]`).textContent = `${hours(s.dayTotals[index])} / 24h${s.dayTotals[index] === 24 ? " · 完了" : ""}`;
      $(`[data-day-track="${index}"]`).style.width = Math.min(s.dayTotals[index] / 24 * 100, 100) + "%";
      show(`#day-error-${index}`, errors[0] || (over ? "以前の記録が24時間を超えています。修正してください。" : ""));
    });
    const range = `${dateFromKey(state.start).getFullYear()}年 ${shortDate(state.start)} – ${shortDate(shiftDate(state.start, 6))}`;
    $("#week-label").textContent = range; $("#review-week-label").textContent = range;
    $("#editor-title").textContent = state.start === weekKey(now()) ? "今週の168時間" : "一週間の168時間";
  }
  function renderReview() {
    const { current: s, comparable, investmentChange } = compareWeeks(state.data, state.start);
    $("#total-hours").textContent = fmt(s.totalHours);
    $("#allocation-status").textContent = s.dailyComplete ? "7日分を記録済み" : s.remainingHours >= 0 ? `未記録 ${hours(s.remainingHours)}` : `超過 ${hours(-s.remainingHours)}`;
    let cursor = 0; const stops = [];
    CATEGORY_LIST.forEach(c => { const end = Math.min(100, cursor + s.categoryTotals[c.id] / 168 * 100); if (end > cursor) stops.push(`${c.color} ${cursor}% ${end}%`); cursor = end; });
    if (cursor < 100) stops.push(`#e7edf4 ${cursor}% 100%`);
    $("#donut-chart").style.background = `conic-gradient(${stops.join(",")})`;
    $("#donut-chart").setAttribute("aria-label", `168時間中${fmt(s.totalHours)}時間を記録済み`);
    $("#legend").innerHTML = CATEGORY_LIST.map(c => `<div class="legend-row" style="--category-color:${c.color}"><span class="legend-dot" aria-hidden="true"></span><span>${c.label}</span><strong>${hours(s.categoryTotals[c.id])}</strong></div>`).join("");
    $("#review-investment").textContent = hours(s.categoryTotals.investment);
    $("#review-comparison").textContent = comparable ? investmentChange === 0 ? "投資の時間は前週と同じでした。" : `投資の時間が前週より${hours(Math.abs(investmentChange))}${investmentChange > 0 ? "増えました。" : "減りました。"}` : "前週との比較は、両方の週で7日分が埋まると表示します。";
    $("#review-goal").textContent = state.data.goal ? `大切にしたいこと：${state.data.goal}` : "増やしたいのは、あなたが大切にしたい時間。";
    const review = state.data.reviews[state.start] || {};
    $("#review-proud").value = review.proud || ""; $("#review-next").value = review.next || "";
    const weeks = [...new Set([...Object.keys(state.data.records), ...Object.keys(state.data.reviews)].map(key => weekKey(dateFromKey(key))))].sort().reverse();
    $("#week-history").innerHTML = weeks.length ? weeks.map(start => {
      const sum = calculateSummary(weekDays(state.data, start));
      return `<div class="history-row"><button type="button" data-history="${start}">${escape(start)} の週</button><span>投資 ${hours(sum.categoryTotals.investment)} · 記録 ${hours(sum.totalHours)} / 168h</span></div>`;
    }).join("") : '<p class="muted">最初の記録をすると、ここに週が並びます。</p>';
    $$('[data-history]').forEach(button => button.addEventListener("click", () => { state.start = button.dataset.history; renderEditor(); renderReview(); }));
    $("#share-result").textContent = "";
  }
  function renderSettings() {
    $("#personal-goal").value = state.data.goal;
    const r = state.data.reminders;
    $("#reminders-enabled").checked = r.enabled; $("#reminders-interval").value = String(r.intervalMinutes); $("#reminders-start").value = r.start; $("#reminders-end").value = r.end;
    $("#notification-mode").textContent = platform.isNative ? "アプリを閉じている間も、設定した時間帯に通知します。通知の許可とiPhoneの集中モード設定により届き方が変わります。" : "Web版では、この画面を開いている間だけ声をかけます。画面を閉じた状態やロック中の通知には対応していません。";
  }
  function renderTimer() {
    const timer = state.data.timer;
    $("#timer-category").disabled = !!timer;
    if (timer) { $("#timer-category").value = timer.category; $(".timer-details").open = true; }
    $("#timer-toggle").textContent = timer ? "終了して記録" : "計測を始める";
    $("#timer-discard").hidden = !timer;
    const elapsed = timer ? Math.max(0, Math.floor((now().getTime() - timer.startedAt) / 1000)) : 0;
    $("#timer-elapsed").textContent = [Math.floor(elapsed / 3600), Math.floor(elapsed / 60) % 60, elapsed % 60].map(n => String(n).padStart(2, "0")).join(":");
  }
  function tick() {
    const date = now(), today = localDateKey(date);
    $("#current-date").textContent = new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "long", hour: "2-digit", minute: "2-digit" }).format(date);
    if (today !== state.today) {
      const previousToday = state.today;
      const wasCurrent = state.start === weekKey(dateFromKey(previousToday));
      state.today = today;
      if ($("#quick-date").value === previousToday) $("#quick-date").value = today;
      if (wasCurrent && state.start !== weekKey(date)) { state.start = weekKey(date); renderEditor(); if (state.page === "review") renderReview(); }
      else $$('[data-day-card]').forEach(card => { const active = card.dataset.date === today; card.classList.toggle("is-today", active); card.querySelector(".today-tag").textContent = active ? "今日" : ""; });
    }
    renderTimer();
    if (!platform.isNative && !document.hidden && state.due && date >= state.due) {
      // Do not replay a backlog after sleep: prompts are useful only near their scheduled time.
      if (date.getTime() - state.due.getTime() < 60000) $("#reminder-banner").hidden = false;
      state.due = nextReminder(state.data.reminders, date);
    }
  }
  function goToday() { state.start = weekKey(now()); state.today = localDateKey(now()); state.mode = "daily"; $("#quick-date").value = state.today; setPage("record"); renderEditor(); }
  $$('[data-page]').forEach(button => button.addEventListener("click", () => { location.hash = button.dataset.page; setPage(button.dataset.page); }));
  const hashChanged = () => setPage(location.hash.slice(1)); window.addEventListener("hashchange", hashChanged);
  $$('[data-mode]').forEach(button => {
    button.addEventListener("click", () => { state.mode = button.dataset.mode; renderEditor(); });
    button.addEventListener("keydown", event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); state.mode = event.key === "Home" ? "daily" : event.key === "End" ? "weekly" : state.mode === "daily" ? "weekly" : "daily"; renderEditor(); $(`#${state.mode}-tab`).focus(); } });
  });
  $$('[data-week-shift]').forEach(button => button.addEventListener("click", () => { try { const candidate = shiftDate(state.start, Number(button.dataset.weekShift) * 7); dateFromKey(shiftDate(candidate, 6)); state.start = candidate; renderEditor(); if (state.page === "review") renderReview(); } catch { toast("この日付は表示できません。"); } }));
  $("#jump-today").addEventListener("click", () => { goToday(); $(`[data-date="${state.today}"]`)?.scrollIntoView({ block: "center", behavior: "auto" }); });
  $("#quick-date").value = state.today; selectNumber($("#quick-minutes"));
  $$('[data-minutes]').forEach(button => button.addEventListener("click", () => { $("#quick-minutes").value = button.dataset.minutes; }));
  $("#quick-form").addEventListener("submit", event => {
    event.preventDefault(); if (!editable()) return;
    try {
      const raw = $("#quick-minutes").value.trim(), minutes = Number(raw);
      if (!/^\d+(?:\.\d+)?$/.test(raw) || !Number.isFinite(minutes) || minutes < 1 || minutes > 1440) throw new Error("1〜1440分で入力してください。");
      const date = $("#quick-date").value, category = $("#quick-category").value;
      const previous = structuredClone(state.data);
      state.data = addEntries(state.data, [{ date, category, hours: roundHours(minutes / 60) }]);
      state.invalid.delete(`${date}:${category}`); state.start = weekKey(dateFromKey(date));
      persist(); renderEditor(); show("#quick-error", "");
      toast(`${CATEGORY_LIST.find(c => c.id === category).label}に${fmt(minutes)}分を追加しました。`, previous);
    } catch (error) { show("#quick-error", error.message); }
  });
  $("#timer-toggle").addEventListener("click", () => {
    if (!editable()) return;
    try {
      if (state.data.timer) {
        const entries = timerEntries(state.data.timer, now().getTime()), previous = structuredClone(state.data); previous.timer = null;
        state.data = { ...addEntries(state.data, entries), timer: null };
        state.start = weekKey(dateFromKey(entries.at(-1).date));
        toast(`${hours(entries.reduce((sum, e) => sum + e.hours, 0))}を記録しました。`, previous);
        renderEditor();
      } else { state.data.timer = { category: $("#timer-category").value, startedAt: now().getTime(), id: now().getTime() }; clearUndo(); }
      persist(); renderTimer(); show("#timer-error", "");
    } catch (error) { show("#timer-error", error.message); }
  });
  $("#timer-discard").addEventListener("click", () => { if (editable() && confirm("計測中の時間を記録せずに破棄しますか？")) { state.data.timer = null; clearUndo(); persist(); renderTimer(); show("#timer-error", ""); } });
  $("#undo-action").addEventListener("click", () => { if (!state.undo || !editable()) return; state.data = state.undo; clearUndo(); persist(); renderEditor(); renderTimer(); toast("追加した記録を取り消しました。"); });
  $("#dismiss-toast").addEventListener("click", () => { $("#toast").hidden = true; clearUndo(); });
  $("#personal-goal").addEventListener("input", () => { if (!editable()) return; state.data.goal = $("#personal-goal").value.slice(0, 80); clearUndo(); persist(); });
  $("#review-form").addEventListener("submit", event => event.preventDefault());
  for (const id of ["#review-proud", "#review-next"]) $(id).addEventListener("input", () => { if (!editable()) return; state.data.reviews[state.start] = { proud: $("#review-proud").value.slice(0, 500), next: $("#review-next").value.slice(0, 500) }; clearUndo(); persist(); });
  $("#reminders-form").addEventListener("submit", async event => {
    event.preventDefault(); if (!editable()) return;
    $("#save-reminders").disabled = true;
    try {
      const r = validateReminders({ enabled: $("#reminders-enabled").checked, intervalMinutes: Number($("#reminders-interval").value), start: $("#reminders-start").value, end: $("#reminders-end").value });
      const slots = reminderSlots(r);
      await platform.configureReminders(r, slots, true);
      state.data.reminders = r; state.due = nextReminder(r, now()); clearUndo(); const saved = await persist();
      $("#reminder-banner").hidden = true;
      show("#reminder-status", !saved ? "設定はこの画面に反映しましたが保存できていません。保存容量などを確認してください。" : r.enabled ? `${slots.length}回／日。次は${state.due.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}です。${platform.isNative ? "" : "画面を開いている間だけ表示します。"}` : "声かけをオフにしました。");
    } catch (error) { show("#reminder-status", error.message); }
    finally { $("#save-reminders").disabled = false; }
  });
  $("#reminder-dismiss").addEventListener("click", () => { $("#reminder-banner").hidden = true; });
  $("#reminder-record").addEventListener("click", () => { goToday(); $("#reminder-banner").hidden = true; $("#quick-minutes").value = String(state.data.reminders.intervalMinutes); $("#quick-category").focus(); });
  $("#share-week").addEventListener("click", async () => {
    const s = calculateSummary(weekDays(state.data, state.start));
    const text = `Life Capital｜${state.start}の週\n記録 ${hours(s.totalHours)} / 168h${s.dailyComplete ? "" : "（入力途中）"}\n投資 ${hours(s.categoryTotals.investment)}・消費 ${hours(s.categoryTotals.consumption)}・浪費 ${hours(s.categoryTotals.waste)}・睡眠 ${hours(s.categoryTotals.sleep)}`;
    try { const result = await platform.shareText(text); show("#share-result", result === "copied" ? "週の数字をコピーしました。" : "共有画面を閉じました。"); }
    catch (error) { if (error.name !== "AbortError") show("#share-result", "共有できませんでした。もう一度お試しください。"); }
  });
  $("#export-data").addEventListener("click", async () => {
    try { await saveQueue; const text = state.blocked && state.raw ? state.raw : JSON.stringify(state.data, null, 2); await platform.exportFile(text, `life-capital-${state.today}.json`); show("#backup-status", "バックアップの書き出し画面を開きました。"); }
    catch { show("#backup-status", "書き出せませんでした。端末の保存先を確認してください。"); }
  });
  $("#import-data").addEventListener("change", async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("5MB以下のバックアップを選んでください。");
      const raw = await file.text(), value = JSON.parse(raw), imported = value.version === 2 ? parseData(value) : migrateLegacy(raw, now());
      const dates = Object.keys(imported.records), overlaps = dates.filter(date => state.data.records[date]).length;
      if (!confirm(`${dates.length}日分を読み込みます。同じ日付の${overlaps}日分はバックアップの数字に置き換わります。続けますか？`)) return;
      state.data = { ...state.data, records: { ...state.data.records, ...imported.records }, reviews: { ...state.data.reviews, ...imported.reviews }, goal: state.data.goal || imported.goal };
      state.blocked = false; state.raw = null; state.invalid.clear(); clearUndo();
      const saved = await persist(); renderEditor(); renderSettings(); notice("");
      show("#backup-status", saved ? `${dates.length}日分を読み込みました。通知設定と計測中のタイマーは現在の設定を維持しています。` : "読み込みましたが保存できていません。バックアップを書き出してください。");
    } catch (error) { show("#backup-status", `読み込めませんでした。${error.message}`); }
    finally { event.target.value = ""; }
  });
  $("#delete-data").addEventListener("click", async () => {
    if (!confirm("この端末の全日付の記録・振り返り・設定を削除します。元には戻せません。必要なら先にバックアップを書き出してください。削除しますか？")) return;
    try {
      await saveQueue; await platform.configureReminders({ ...state.data.reminders, enabled: false }, [], false);
      await platform.remove(STORAGE_KEY); await platform.remove("life-capital:view-mode"); await platform.remove(DATA_KEY);
      state.data = createData(); state.raw = null; state.blocked = false; state.invalid.clear(); state.due = null; clearUndo();
      await persist(); goToday(); renderSettings(); renderTimer(); notice(""); $("#reminder-banner").hidden = true; toast("この端末のデータを削除しました。");
    } catch { show("#backup-status", "削除を完了できませんでした。もう一度お試しください。"); }
  });
  const storageChanged = event => {
    if (event.key !== DATA_KEY || platform.isNative) return;
    try { state.data = event.newValue ? parseData(event.newValue) : createData(); state.invalid.clear(); clearUndo(); state.due = nextReminder(state.data.reminders, now()); renderEditor(); renderSettings(); renderTimer(); if (state.page === "review") renderReview(); setSave("別の画面の変更を反映しました"); }
    catch { state.blocked = true; state.raw = event.newValue; notice("別の画面の保存データを読み込めないため、上書きを止めています。設定からバックアップを確認してください。"); setSave("保存データを確認してください", true); }
  };
  window.addEventListener("storage", storageChanged);
  renderEditor(); renderSettings(); setPage(location.hash.slice(1)); tick();
  if (!state.blocked) {
    try { state.due = nextReminder(state.data.reminders, now()); if (platform.isNative && state.data.reminders.enabled) await platform.configureReminders(state.data.reminders, reminderSlots(state.data.reminders), false); }
    catch (error) { show("#reminder-status", error.message); }
    if (state.data.migration) await persist();
  }
  await platform.onReminder(() => { goToday(); $("#quick-minutes").value = String(state.data.reminders.intervalMinutes); $("#quick-category").focus(); });
  await platform.onResume(tick);
  const interval = timers ? setInterval(tick, 1000) : null;
  return { tick, whenSaved: () => saveQueue, dispose() { clearInterval(interval); window.removeEventListener("hashchange", hashChanged); window.removeEventListener("storage", storageChanged); } };
}

if (!globalThis.__LC_TEST__) createApp().catch(() => {
  const notice = document.querySelector("#load-notice"); notice.hidden = false; notice.textContent = "画面を読み込めませんでした。再読み込みしてください。保存済みのデータは削除していません。";
});
