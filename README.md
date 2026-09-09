# OperApp — Base44 app on Supabase + Vercel

The app is still authored in Base44, but it runs on our own stack: Supabase for the
database, auth and storage, Vercel for the frontend and the backend API.

Nothing under `base44/**` or `src/**` is modified. Base44's SDK is redirected to a
compatibility layer at build time:

| Surface | Base44 import | Redirected by | To |
| --- | --- | --- | --- |
| Browser | `@base44/sdk` | `vite.config.js` alias | `packages/base44-compat` |
| Backend functions | `npm:@base44/sdk` | `scripts/build-api-functions.mjs` | `packages/base44-server` |

## Local development

```bash
npm install
npm run local          # supabase start + env sync + vite
npm run api:dev        # Base44-compatible API on http://localhost:3000
```

## After pulling a new Base44 export

```bash
npm run schema:generate   # base44/entities → supabase/migrations + column types
npm run api:build         # base44/functions → packages/base44-server/generated
```

Apply the regenerated migration to Supabase if entity fields changed.

## API served by Vercel

One serverless function (`api/[...path].js`) answers the same URLs the Base44
platform did, so existing clients only need a different host:

```
GET    /api/apps/:appId/entities/:Entity?q=&sort=&limit=&skip=&fields=
GET    /api/apps/:appId/entities/:Entity/:id
GET    /api/apps/:appId/entities/User/me
POST   /api/apps/:appId/entities/:Entity
PUT    /api/apps/:appId/entities/:Entity/:id
DELETE /api/apps/:appId/entities/:Entity/:id
ANY    /api/apps/:appId/functions/:name      (apiAuth, apiTimesheet, …)
GET    /api/apps/auth/login | /api/apps/auth/callback
```

## Mobile app

`operapp360/mobile` switches backends with one build flag — no code changes:

```bash
flutter run                                  # Base44
flutter run --dart-define=BACKEND=vercel     # this deployment
```

## Environment variables

Copy `vercel.env.example` to `vercel.env`, fill in the real values (that file is
git-ignored) and import it into Vercel as Config type, not Secret. The API needs the
server-side values: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `API_KEY`,
`OTP_SECRET`, and `RESEND_API_KEY` + `EMAIL_FROM` for OTP sign-in emails.

In Supabase → Authentication → URL Configuration, allow the OAuth callback:
`https://<your-domain>/api/apps/auth/callback`.

## Base44

Documentation: <https://docs.base44.com/Integrations/Using-GitHub>
