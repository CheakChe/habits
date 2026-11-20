# Habits

Offline-first habit and task tracker built with SolidJS, Tailwind CSS, IndexedDB, and optional Google Drive (`drive.appdata`) binary snapshot sync.

## Local Development

```bash
npm install
npm run dev
```

For Google Sign-In and Drive sync locally, copy `.env.example` to `.env.local` and fill in your Firebase Web App config (or provide `FIREBASE_CONFIG_JSON`). Without Firebase config, **Guest Mode** (IndexedDB) works fully offline.

## Deploying to GitHub Pages

This repository includes `.github/workflows/deploy.yml` configured with `base: './'` in `vite.config.ts`, so it works both at root domains (`https://<user>.github.io/`) and project subpaths (`https://<user>.github.io/<repo>/`).

1. **Enable GitHub Pages via GitHub Actions**
   - In your repository on GitHub, open **Settings → Pages**.
   - Under **Build and deployment → Source**, choose **GitHub Actions**.

2. **Add Firebase Web Config (optional, required only for Google Drive sync)**
   - In GitHub **Settings → Secrets and variables → Actions**, add either:
     - `FIREBASE_CONFIG_JSON` (full JSON from Firebase Project Settings → Your apps → Web app), **or**
     - Individual variables: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`.
   - You may store them in either **Secrets** or **Variables**.

3. **Authorize your GitHub Pages domain in Firebase**
   - In **Firebase Console → Authentication → Settings → Authorized domains**, add `<your-username>.github.io` (just the hostname, without `https://` or the `/<repo>` path).
   - Ensure the Google sign-in provider is enabled in Firebase Authentication and your OAuth consent screen allows your users.

4. **Trigger deployment**
   - Push to `main` or `master`, or run **Actions → Deploy Habits to GitHub Pages → Run workflow**.
