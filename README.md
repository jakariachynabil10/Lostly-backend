# Lostly backend

## Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `DATABASE_URL`, JWT secrets, and a long random `EMAIL_CODE_SECRET`.
3. Configure `RESEND_API_KEY` and `EMAIL_FROM` for email delivery. In development, when no email provider is configured, verification codes are printed to the backend console. Production registration returns `503` without email delivery configuration.
4. Apply migrations and generate Prisma Client:

   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```

5. Start the API with `npm run dev`. The default API base URL is `http://localhost:5000/api`.

## Scripts

- `npm run dev` — start the development API.
- `npm run build` — compile TypeScript.
- `npm test` — run backend tests.
- `npm run prisma:seed` — seed demo data.
- `npm run scenario:phase2` — run the Phase 2 scenario.

The demo account is `demo@lostly.com` with password `password123`.
