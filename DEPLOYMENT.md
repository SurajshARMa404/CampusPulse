# Vercel deployment

This project is configured for Vercel with `api/index.py` and `vercel.json`.

1. Install Node.js, then install the Vercel CLI: `npm install -g vercel`.
2. From this folder run: `vercel login` and then `vercel`.
3. In Vercel project settings, add these environment variables for Production:
   - `CAMPUSPULSE_SECRET_KEY`: a long random value
   - `CAMPUSPULSE_ADMIN_PASSWORD`: a new strong admin password
   - `CAMPUSPULSE_ADMIN_MFA`: a private admin MFA code
4. Deploy with: `vercel --prod`.

The public address will be printed by Vercel, for example
`https://your-project-name.vercel.app/login.html`.
## Access

Admin uses username `admin`, plus the password and MFA code configured above.

Students open the public link, choose **Create an account**, select their CSE
study year, verify the displayed development code, and then log in. In a real
deployment, replace the development verification-code response with email or
SMS delivery.

The current SQLite database uses `/tmp` on Vercel. That storage is temporary and
can be cleared between serverless invocations. Use a hosted database such as
Vercel Postgres, Neon, or Supabase before relying on persistent student data.