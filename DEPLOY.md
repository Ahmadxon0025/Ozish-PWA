# DEPLOY.md — free hosting + install on your phone

Vercel free tier covers everything (static app + the /api functions). ~10
minutes, one time.

## A) Deploy to Vercel (free)

1. Create a GitHub account if you don't have one (https://github.com → Sign up).
2. Push this folder to a new GitHub repository:
   ```bash
   git add -A
   git commit -m "Ozish PWA"
   # create a repo named ozish on github.com (green "New" button), then:
   git remote add origin https://github.com/<your-username>/ozish.git
   git push -u origin master
   ```
3. Open **https://vercel.com** → **Sign up** → choose **Continue with GitHub**.
4. Click **Add New… → Project** → **Import** next to your `ozish` repo.
5. Vercel auto-detects Vite. Leave everything as it is (Build command
   `npm run build`, Output `dist`). Click **Deploy**.
6. (Optional, Tier 3) While it builds: **Settings → Environment Variables** →
   add the keys per `SETUP.md` §4 → then **Deployments → ⋯ → Redeploy**.
7. Done — your app is at `https://ozish-<something>.vercel.app`. Every
   `git push` redeploys automatically.

Netlify works too (drag-and-drop the `dist` folder), but the /api functions
in this repo are written for Vercel — use Vercel unless you have a reason
not to.

## B) Install on your phone

### Android (Chrome)
1. Open your `https://….vercel.app` URL in **Chrome**.
2. Menu (⋮) → **Add to Home screen** → **Install** (or accept the automatic
   "Install app" banner).
3. The "Ozish" icon appears on your home screen; it opens full-screen, no
   browser bar, and works with airplane mode on.
4. For reminders: open the app → Sozlash → Eslatmalar → **Yoqish** → allow
   notifications. On Android the installed app can also remind you in the
   background (Periodic Background Sync).

### iPhone (Safari)
1. Open the URL in **Safari**.
2. Share button (□↑) → **Add to Home Screen** → **Add**.
3. Notifications on iOS require the app to be installed this way (iOS 16.4+),
   then Sozlash → Eslatmalar → Yoqish. iOS is stricter about background
   delivery — reminders are most reliable while the app has been opened that
   day.

## C) Local development

```bash
npm install
npm run dev            # app on http://localhost:5173 (Tiers 1–2)

# Tier 3 locally (optional):
cp .env.example .env   # fill in keys
npm i -g vercel
vercel dev             # serves /api on http://localhost:3000
# vite proxies /api → :3000 automatically (see vite.config.ts)
```

## D) Updating the app later

Edit code → `git add -A && git commit -m "…" && git push` → Vercel redeploys.
The PWA auto-updates on next open (service worker `autoUpdate`).
