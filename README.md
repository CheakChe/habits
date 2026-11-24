# Habits

Offline-first habit and task tracker built with SolidJS, Tailwind CSS, IndexedDB, optional Google Drive (`drive.appdata`) binary snapshot sync, and optional Google Calendar (`calendar.app.created`) smart reminders.

## Local Development

```bash
npm install
npm run dev
```

For Google Sign-In, Drive sync, and Calendar reminders locally, copy `.env.example` to `.env.local` and set `VITE_GOOGLE_OAUTH_CLIENT_ID`. Without OAuth config, **Guest Mode** (IndexedDB) works fully offline.

## Deploying to GitHub Pages

This repository includes `.github/workflows/deploy.yml` configured with `base: './'` in `vite.config.ts`, so it works both at root domains (`https://<user>.github.io/`) and project subpaths (`https://<user>.github.io/<repo>/`).

1. **Enable GitHub Pages via GitHub Actions**
   - In your repository on GitHub, open **Settings → Pages**.
   - Under **Build and deployment → Source**, choose **GitHub Actions**.

2. **Add Google OAuth Client ID (optional, required only for Google Drive & Calendar)**
   - In GitHub **Settings → Secrets and variables → Actions**, add:
     - `VITE_GOOGLE_OAUTH_CLIENT_ID` (Web application OAuth 2.0 Client ID from Google Cloud Console).
   - You may store it in either **Secrets** or **Variables** (Variables is fine since a Web OAuth Client ID is public).

3. **Configure Google Cloud Console**
   - Enable **Google Drive API** and **Google Calendar API** in **APIs & Services → Library**.
   - In **Google Auth Platform / OAuth consent screen**: add scopes `https://www.googleapis.com/auth/drive.appdata` and `https://www.googleapis.com/auth/calendar.app.created` (and add your Google email to **Test users** while publishing status is _Testing_).
   - In **Clients → your Web OAuth Client → Authorized JavaScript origins**, add `https://<your-username>.github.io` (origin only, without `/<repo>` path) and `http://localhost:3000` for local dev.

4. **Trigger deployment**
   - Push to `main` or `master`, or run **Actions → Deploy Habits to GitHub Pages → Run workflow**.
