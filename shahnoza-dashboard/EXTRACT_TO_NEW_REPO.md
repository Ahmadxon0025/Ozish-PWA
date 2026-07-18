# Extracting into its own repo

This dashboard is fully self-contained in `shahnoza-dashboard/`. It currently
lives on the `claude/shahnoza-dashboard-phase1-ip6srv` branch of the
`Ozish-PWA` repo (the automated session couldn't create a new GitHub repo —
its integration is scoped to `Ozish-PWA` only). Moving it to its own repo takes
two minutes.

## 1. Create the empty repo

On GitHub: **New repository → name `shahnoza-dashboard` → Private → do NOT add a
README/.gitignore** (we already have them).

## 2. Copy the folder into it as the repo root

```bash
# from a clone of Ozish-PWA on the dashboard branch:
git clone -b claude/shahnoza-dashboard-phase1-ip6srv \
  https://github.com/Ahmadxon0025/Ozish-PWA.git ozish
cp -R ozish/shahnoza-dashboard shahnoza-dashboard
cd shahnoza-dashboard

rm -rf node_modules .next            # regenerate these fresh
git init
git add .
git commit -m "Shahnoza Dashboard — Phase 1 MVP"
git branch -M main
git remote add origin https://github.com/Ahmadxon0025/shahnoza-dashboard.git
git push -u origin main
```

(Alternatively, `git subtree split --prefix=shahnoza-dashboard -b dashboard-only`
inside the Ozish-PWA clone, then push that branch to the new repo's `main`.)

## 3. Point Vercel at it

Import `shahnoza-dashboard` in Vercel with **Root Directory = repo root**
(since the folder is now the root). Then follow `DEPLOY.md`.
