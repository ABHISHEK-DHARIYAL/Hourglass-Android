// Purpose: Detect whether the app runs inside the native Android shell (Capacitor) and build backend URLs accordingly
import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();

// Inside the native app there is no Firebase Hosting origin to resolve "/api/..." against,
// so API calls must go to the deployed hosting URL. On the web they stay relative.
const DEFAULT_API_BASE = 'https://hourglass-fadb8.web.app';

export function apiUrl(path: string): string {
  if (!isNative) return path;
  const base = ((import.meta as any).env?.VITE_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, '');
  return `${base}${path}`;
}

// AI Coach backend (Vercel serverless or Firebase Functions). Set VITE_COACH_API_BASE_URL to the
// production URL of the site that serves /api/coach/*. Other /api routes still use apiUrl().
export function coachApiUrl(path: string): string {
  if (!isNative) return path;
  const env = (import.meta as any).env || {};
  const base = (env.VITE_COACH_API_BASE_URL || env.VITE_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, '');
  return `${base}${path}`;
}
