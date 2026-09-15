// The iOS build replaces this adapter with native storage, notifications and sharing.
export const isNative = false;
export async function read(key) { return window.localStorage.getItem(key); }
export async function write(key, value) { window.localStorage.setItem(key, value); }
export async function remove(key) { window.localStorage.removeItem(key); }
export async function configureReminders() { return { mode: "foreground" }; }
export async function onReminder() {}
export async function onResume(callback) {
  document.addEventListener("visibilitychange", () => { if (!document.hidden) callback(); });
}
export async function exportFile(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function shareText(text) {
  if (navigator.share) return navigator.share({ title: "Life Capital", text });
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return "copied"; }
  throw new Error("このブラウザでは共有できません。");
}
