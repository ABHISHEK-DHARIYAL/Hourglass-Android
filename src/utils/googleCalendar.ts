// Purpose: Pushes the study schedule into Google Calendar.
// Android: uses the app's native Google sign-in (same one as the Calendar import button) — no OAuth client ID needed.
// Web: re-authenticates the current Firebase user with the calendar.events scope via a popup.

import { GoogleAuthProvider, reauthenticateWithPopup } from 'firebase/auth';
import { auth, nativeGoogleSignIn } from '../firebase';
import { isNative } from './platform';

const SCOPE = 'https://www.googleapis.com/auth/calendar.events';

// Always available: both platforms sign in through Firebase, no extra env variable.
export const calendarConfigured = (): boolean => true;

async function getAccessToken(): Promise<string> {
  try {
    if (isNative) {
      const { accessToken } = await nativeGoogleSignIn([SCOPE]);
      if (!accessToken) throw new Error('Google did not grant calendar access.');
      return accessToken;
    }
    const user = auth.currentUser;
    if (!user) throw new Error('Please sign in first.');
    const provider = new GoogleAuthProvider();
    provider.addScope(SCOPE);
    provider.setCustomParameters({ prompt: 'consent' });
    const result = await reauthenticateWithPopup(user, provider);
    const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
    if (!token) throw new Error('Google did not grant calendar access.');
    return token;
  } catch (e: any) {
    if (e?.code === 'auth/user-mismatch') throw new Error('Choose the same Google account you signed in to HourGlass with.');
    throw new Error(e?.message || 'Google Calendar access was cancelled.');
  }
}

export interface CalendarItem {
  date: string; // YYYY-MM-DD
  startHour: number;
  endHour: number;
  title: string;
  description?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

// One event per study session with email (60 min before) and popup (10 min before) reminders.
export async function addScheduleToGoogleCalendar(items: CalendarItem[]): Promise<number> {
  const token = await getAccessToken();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let created = 0;

  for (let i = 0; i < items.length; i += 5) {
    const results = await Promise.all(
      items.slice(i, i + 5).map((item) =>
        fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            summary: item.title,
            description: item.description || '',
            start: { dateTime: `${item.date}T${pad(item.startHour)}:00:00`, timeZone },
            end: { dateTime: `${item.date}T${pad(item.endHour)}:00:00`, timeZone },
            reminders: { useDefault: false, overrides: [{ method: 'email', minutes: 60 }, { method: 'popup', minutes: 10 }] }
          })
        })
      )
    );
    for (const res of results) {
      if (res.ok) created++;
      else if (res.status === 401 || res.status === 403) {
        throw new Error('Google Calendar refused access. Enable the Calendar API and add yourself as a test user.');
      }
    }
  }
  return created;
}
