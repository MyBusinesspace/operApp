# Landing page backup (safe outside `src/` and `base44/`)

This folder survives when you replace `src/` and/or `base44/` from a Base44 export.

## What is backed up

| File | Role |
| --- | --- |
| `pages/LandingPage.jsx` | Marketing landing page |
| `pages/LandingPage.css` | Landing styles |
| `patches/App.jsx` | Last known routing (public `/` → landing, `/app` → dashboard) |
| `patches/Login.jsx` | Post-login redirect to `/app` |
| `patches/Register.jsx` | Post-register redirect to `/app` |

Also required after restore (done by the script):

- TopNavBar logo link → `/app` (not `/`)

## After replacing `src/` / `base44/`

From the repo root:

```bash
node ops/landing-backup/restore.mjs
```

Then tell the coding agent: **«استرجع اللاندينغ من الـ backup»** if anything still looks wrong.

## Manual checklist

1. `src/pages/LandingPage.jsx` + `.css` exist
2. `App.jsx` imports `LandingPage`
3. Route `/` → `<LandingPage />`
4. Route `/app` → `<Dashboard />` (inside protected layout)
5. Login / Register / Google OAuth redirect to `/app`
6. TopNavBar logo → `/app`
