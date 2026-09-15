import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Preferences } from "@capacitor/preferences";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

export const isNative = Capacitor.isNativePlatform();
export async function read(key) { return (await Preferences.get({ key })).value; }
export async function write(key, value) { await Preferences.set({ key, value }); }
export async function remove(key) { await Preferences.remove({ key }); }
export async function configureReminders(settings, slots, request = false) {
  if (settings.enabled) {
    let permission = await LocalNotifications.checkPermissions();
    if (permission.display !== "granted" && request) permission = await LocalNotifications.requestPermissions();
    if (permission.display !== "granted") throw new Error("通知が許可されていません。iPhoneの設定でLife Capitalの通知を許可してください。");
  }
  const pending = await LocalNotifications.getPending();
  const ours = pending.notifications.filter(n => n.id >= 31000 && n.id < 31100).map(n => ({ id: n.id }));
  if (ours.length) await LocalNotifications.cancel({ notifications: ours });
  if (settings.enabled) {
    await LocalNotifications.schedule({ notifications: slots.map((slot, index) => ({
      id: 31000 + index,
      title: "ここまで、何をしていた？",
      body: "少しだけ記録して、自分の時間を見つけよう。",
      schedule: { on: { hour: slot.hour, minute: slot.minute }, repeats: true },
      extra: { kind: "check-in", intervalMinutes: settings.intervalMinutes },
      threadIdentifier: "life-capital-check-in"
    })) });
  }
  return { mode: "native" };
}
export async function onReminder(callback) {
  await LocalNotifications.addListener("localNotificationActionPerformed", event => {
    if (event.notification.extra?.kind === "check-in") callback();
  });
}
export async function onResume(callback) { await App.addListener("appStateChange", state => { if (state.isActive) callback(); }); }
export async function shareText(text) { await Share.share({ title: "Life Capital", text }); }
export async function exportFile(text, name) {
  const path = `exports/${Date.now()}-${name}`;
  const file = await Filesystem.writeFile({ path, data: text, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true });
  try { await Share.share({ title: "Life Capitalのバックアップ", files: [file.uri] }); }
  finally { await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {}); }
}
