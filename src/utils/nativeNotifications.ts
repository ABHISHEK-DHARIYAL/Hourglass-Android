// Purpose: Native Android notifications — FCM push registration plus on-device scheduled reminders that fire even when the app is closed or offline
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import { isNative } from './platform';
import { Task, TaskException, Habit } from '../types';
import { getTaskSegmentsForDate, addDays, formatDate } from './dateUtils';
import { NotificationSettings } from './notificationTypes';

const TOKEN_KEY = 'hourglass_native_fcm_token';
const DAYS_AHEAD = 7;
const MAX_SCHEDULED = 60; // Android/OS-friendly cap

export function getStoredNativeToken(): string {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

let pushInitialised = false;

/** Ask for notification permission, create the channel, and register for FCM push. Safe to call repeatedly. */
export async function initNativeNotifications(onToken?: (token: string) => void): Promise<boolean> {
  if (!isNative) return false;
  try {
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return false;

    await LocalNotifications.createChannel({
      id: 'default',
      name: 'Hourglass reminders',
      description: 'Task reminders and daily summaries',
      importance: 5,
      visibility: 1,
      vibration: true,
    });

    if (!pushInitialised) {
      pushInitialised = true;
      await PushNotifications.addListener('registration', (t) => {
        try { localStorage.setItem(TOKEN_KEY, t.value); } catch {}
        onToken?.(t.value);
      });
      await PushNotifications.addListener('registrationError', (e) => {
        console.warn('Push registration error:', e);
      });
    }
    const pushPerm = await PushNotifications.requestPermissions();
    if (pushPerm.receive === 'granted') await PushNotifications.register();
    return true;
  } catch (err) {
    console.warn('initNativeNotifications failed:', err);
    return false;
  }
}

function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (Math.abs(h) % 2000000000) + 1;
}

function inQuietHours(settings: NotificationSettings, minutesOfDay: number): boolean {
  if (!settings.quietHoursEnabled) return false;
  const [sh, sm] = settings.quietHoursStart.split(':').map(Number);
  const [eh, em] = settings.quietHoursEnd.split(':').map(Number);
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  return s <= e ? minutesOfDay >= s && minutesOfDay <= e : minutesOfDay >= s || minutesOfDay <= e;
}

/**
 * Rebuilds all upcoming local notifications for the next week: "starts in N minutes", "time to start",
 * and the morning/evening summaries. Called whenever tasks or settings change.
 */
export async function scheduleNativeReminders(
  tasks: Task[],
  exceptions: TaskException[],
  habits: Habit[],
  settings: NotificationSettings
): Promise<void> {
  if (!isNative) return;
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') return;

    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    }
    if (!settings.enabled) return;

    const now = Date.now();
    const out: LocalNotificationSchema[] = [];
    const todayStr = formatDate(new Date());

    const push = (id: string, at: Date, title: string, body: string) => {
      if (at.getTime() <= now + 2000) return;
      if (inQuietHours(settings, at.getHours() * 60 + at.getMinutes())) return;
      out.push({
        id: hashId(id),
        title,
        body,
        channelId: 'default',
        smallIcon: 'ic_stat_hourglass',
        schedule: { at, allowWhileIdle: true },
      });
    };

    for (let d = 0; d < DAYS_AHEAD; d++) {
      const dateStr = addDays(todayStr, d);
      const [y, m, day] = dateStr.split('-').map(Number);
      const at = (h: number, min = 0) => new Date(y, m - 1, day, h, min, 0, 0);

      const segments = getTaskSegmentsForDate(tasks, dateStr, exceptions).filter(
        (s) => !s.isWrapped && s.task.notifyEnabled !== false
      );

      for (const seg of segments) {
        const title = seg.task.title;
        if (settings.reminderTiming > 0) {
          push(`pre_${seg.task.id}_${dateStr}_${seg.startHour}`, at(seg.startHour, -settings.reminderTiming),
            '📅 Upcoming Task', `"${title}" starts in ${settings.reminderTiming} minutes.`);
        }
        push(`start_${seg.task.id}_${dateStr}_${seg.startHour}`, at(seg.startHour),
          '🚀 Time to Start', `It's time to begin "${title}".`);
      }

      if (settings.morningSummaryEnabled) {
        const [h, mm] = settings.morningSummaryTime.split(':').map(Number);
        const count = segments.length;
        push(`morning_${dateStr}`, at(h, mm), '🌞 Good Morning',
          count ? `You have ${count} task${count > 1 ? 's' : ''} planned today.` : 'Nothing scheduled yet — plan your day!');
      }
      if (settings.eveningSummaryEnabled) {
        const [h, mm] = settings.eveningSummaryTime.split(':').map(Number);
        push(`evening_${dateStr}`, at(h, mm), '🌙 Day Complete', 'Review your day and plan tomorrow.');
      }
      if (settings.habitRemindersEnabled && habits.length) {
        push(`habits_${dateStr}`, at(14, 30), '💧 Habit Reminder', `Don't forget your ${habits.length} daily habit${habits.length > 1 ? 's' : ''}.`);
      }
    }

    out.sort((a, b) => a.schedule!.at!.getTime() - b.schedule!.at!.getTime());
    const unique = Array.from(new Map(out.map((n) => [n.id, n])).values()).slice(0, MAX_SCHEDULED);
    if (unique.length) await LocalNotifications.schedule({ notifications: unique });
  } catch (err) {
    console.warn('scheduleNativeReminders failed:', err);
  }
}
