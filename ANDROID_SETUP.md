# Hourglass Android app — setup

The app is your existing web app wrapped with Capacitor. GitHub Actions builds the APK for you
(`.github/workflows/build-android.yml`) and publishes it under **Releases → Hourglass (latest build)**.

## One-time setup

### 1. Push this project to GitHub
Create a repo and push to the `main` branch. The first build starts automatically (it will warn about missing secrets — that's expected until step 4).

### 2. Create a signing key (once, on any computer with Java)
```bash
keytool -genkeypair -v -keystore hourglass.keystore -alias hourglass \
  -keyalg RSA -keysize 2048 -validity 10000 -storepass YOUR_PASSWORD -keypass YOUR_PASSWORD
keytool -list -v -keystore hourglass.keystore -alias hourglass -storepass YOUR_PASSWORD | grep SHA1
base64 -w0 hourglass.keystore   # macOS: base64 -i hourglass.keystore
```
Keep the keystore file safe — losing it means you can't update the installed app.

### 3. Firebase console (project `hourglass-fadb8`)
1. Project settings → **Add app → Android**, package name `com.hourglass.planner`.
2. Add the **SHA-1** from step 2 to that Android app.
3. Authentication → Sign-in method → make sure **Google** is enabled.
4. Download **google-services.json** (do this *after* adding the SHA-1).
5. Convert it to base64: `base64 -w0 google-services.json`

### 4. GitHub repo → Settings → Secrets and variables → Actions → New secret
| Secret | Value |
|---|---|
| `GOOGLE_SERVICES_JSON` | base64 of google-services.json |
| `ANDROID_KEYSTORE_BASE64` | base64 of hourglass.keystore |
| `KEYSTORE_PASSWORD` | YOUR_PASSWORD |
| `KEY_ALIAS` | `hourglass` |
| `KEY_PASSWORD` | YOUR_PASSWORD |

### 4b. GitHub repo → Settings → Secrets and variables → Actions → **Variables** tab
Add the Firebase **Web app** config (Firebase Console → Project settings → Your apps → Web app → Config). These are not secret.
| Variable | Value |
|---|---|
| `VITE_FIREBASE_API_KEY` | apiKey |
| `VITE_FIREBASE_AUTH_DOMAIN` | authDomain |
| `VITE_FIREBASE_PROJECT_ID` | projectId |
| `VITE_FIREBASE_STORAGE_BUCKET` | storageBucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | messagingSenderId |
| `VITE_FIREBASE_APP_ID` | web appId (`1:...:web:...`) |
| `VITE_FIREBASE_DATABASE_ID` | only if you use a named Firestore database |
| `VITE_COACH_API_BASE_URL` | Vercel production domain, no trailing slash |

Without these the app shows `auth/api-key-not-valid` on sign-in.

### 5. Build and install
Actions tab → **Build Android APK → Run workflow**. When it finishes, open the repo's **Releases** page on your phone,
download `Hourglass.apk`, and install it (allow "install unknown apps" when asked).

## How notifications work
* **On-device reminders** — the app schedules the next 7 days of reminders (X minutes before, at start time, morning/evening
  summary, habit reminder) using Android's alarm system, so they fire even when the app is closed or offline. They are rebuilt
  whenever your tasks or notification settings change. Quiet hours are respected.
* **Server push (FCM)** — your existing Cloud Function that runs every minute also reaches the app through the device's FCM token.
  This needs the Firebase backend to be deployed (see FIREBASE_DEPLOYMENT.md).
* On first launch, allow notifications. On Android 12+ also allow **Alarms & reminders**, and set Hourglass to
  **Battery: Unrestricted** (Settings → Apps → Hourglass → Battery) so phones from Xiaomi/Samsung/etc. don't delay alerts.

## Backend URL
The app calls your deployed Firebase Hosting (`https://hourglass-fadb8.web.app`) for `/api/...` routes.
To change it, set `VITE_API_BASE_URL` in the workflow's "Build web app" step.

## Local build (optional)
```bash
npm install
npm run android:sync
npm run android:open   # opens Android Studio
```

---

## AI Coach (Android)

The **AI Coach** tab works exactly like the web app. The app talks to the same backend (`/api/coach/*`) that the web app uses.

1. **Backend URL** — GitHub repo → Settings → Secrets and variables → Actions → **Variables** → New variable:
   `VITE_COACH_API_BASE_URL` = production URL of your deployed web app (e.g. `https://hourglass-xxxx.vercel.app`, no trailing slash).
   Use the project's **production domain** (Vercel → Settings → Domains), not a `-git-` or per-deployment link, and make sure
   Vercel **Deployment Protection** does not block it.
2. **Backend env** (Vercel): `GEMINI_API_KEY`, `FIREBASE_SERVICE_ACCOUNT` (+ optional `GEMINI_MODEL`, `SMTP_*`, `CRON_SECRET`).
   The web project's `api/coach/[action].ts` must include the CORS update (already in the web zip delivered with this feature).
3. **Firebase / Google Cloud** — see "Firebase settings" below.

### Firebase settings the Android app needs
* Project settings → Your apps → **Android app `com.hourglass.planner`** exists.
* Add the **SHA-1 and SHA-256** of your signing keystore to that app, then **re-download `google-services.json`** and update the
  `GOOGLE_SERVICES_JSON` secret.
* Authentication → Sign-in method → **Google** enabled.
* Cloud Messaging → **Firebase Cloud Messaging API (V1)** enabled (push reminders).
* Firestore rules: no change needed (`users/{uid}/coach_*` are covered by the existing per-user rules).
* Google Cloud Console (same project): enable **Google Calendar API**; OAuth consent screen → add scope `.../auth/calendar.events`
  and add your Gmail as a **test user**.
