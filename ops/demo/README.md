# OperApp interactive demo

Lives in `ops/demo/` so Base44 `src/` replaces do not wipe it.

## Local / Production

Demo is **on by default**. Hide with `VITE_ENABLE_DEMO=false`.

1. Open the site → **Try Demo**
2. Pick Construction / Healthcare / Facilities
3. View-only dashboard with guide card

## After Base44 src replace

```bash
node ops/landing-backup/restore.mjs
```

Confirm `vite.config.js` still has alias `@demo` → `ops/demo`.
