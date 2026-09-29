# OperApp interactive demo

Lives in `ops/demo/` so Base44 `src/` replaces do not wipe it.

## Local

Demo is always enabled in Vite DEV.

1. Open http://127.0.0.1:5174/
2. Click **Try Demo**
3. Pick Construction / Healthcare / Facilities
4. Interact with the dashboard (toggle work-order status, Reset data)

## Production (Vercel)

Set `VITE_ENABLE_DEMO=true` then rebuild. Without it, `/demo` routes are not mounted.

## After Base44 src replace

```bash
node ops/landing-backup/restore.mjs
```

Confirm `vite.config.js` still has alias `@demo` → `ops/demo`.
