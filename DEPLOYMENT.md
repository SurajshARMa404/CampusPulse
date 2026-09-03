# Vercel deployment

This project is configured for Vercel with `api/index.py` and `vercel.json`.

1. Install Node.js, then install the Vercel CLI: `npm install -g vercel`.
2. From this folder run: `vercel login` and then `vercel`.
3. In Vercel project settings, add these environment variables for Production:
   - `DATABASE_URL`: the pooled PostgreSQL connection URL from Supabase or Neon
   - `CAMPUSPULSE_SECRET_KEY`: a long random value
   - `CAMPUSPULSE_ADMIN_PASSWORD`: a new strong admin password
   - `CAMPUSPULSE_ADMIN_MFA`: a private admin MFA code
4. Deploy with: `vercel --prod`.

The public address will be printed by Vercel, for example
`https://your-project-name.vercel.app/`.
## Access

Admin uses username `admin`, plus the password and MFA code configured above.

Students can create an account with a college email matching
`usernamecse@nsec.ac`, then sign in and continue to the Stress and Focus
modules. Admins sign in with the configured admin account and MFA code.

## Persistent database setup

1. Create a free project at [Supabase](https://supabase.com) or [Neon](https://neon.tech).
2. Open the project dashboard and copy its PostgreSQL **Connection string** or
   **Connection URL**. Prefer the pooled URL when the provider offers one.
3. In Vercel, open **CampusPulse > Settings > Environment Variables**.
4. Add key `DATABASE_URL` and paste the complete URL as its value. Enable it for
   Production, Preview, and Development as needed.
5. Redeploy with `vercel --prod` or trigger a new deployment from GitHub.

Check `https://your-project.vercel.app/api/health`. It must report
`"persistent_database_configured": true` before students create accounts.

The app uses local SQLite only when `DATABASE_URL` is absent. On Vercel, do not
omit `DATABASE_URL`: the `/tmp` fallback is temporary and is only intended for
local development or a quick smoke test.