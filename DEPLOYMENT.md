Vercel Deployment Guide

This repository contains the deployment configuration for Vercel using api/index.py and vercel.json.

Deployment Steps

1. Install Node.js and the Vercel CLI globally:
   npm install -g vercel

2. Authenticate and link the project:
   vercel login
   vercel

3. Configure the following Production Environment Variables in the Vercel Dashboard:
   - DATABASE_URL: Pooled PostgreSQL connection string (from Supabase or Neon).
   - CAMPUSPULSE_SECRET_KEY: High-entropy random string for session signing.
   - CAMPUSPULSE_ADMIN_PASSWORD: Secure administrator password.
   - CAMPUSPULSE_ADMIN_MFA: Private admin MFA token.

4. Trigger production build:
   vercel --prod

Access and Data Isolation

- Admin Access: Login using admin alongside the configured CAMPUSPULSE_ADMIN_PASSWORD and MFA token.
- Student Access: Students register using their valid institutional email address (e.g., student@university.edu.in).
- Data Privacy Guardrail: Raw camera frames and individual wellness metrics remain strictly local in browser storage (localStorage/IndexedDB). The backend database only handles auth sessions and differential privacy batch aggregate metrics.

Database Configuration

Vercel serverless functions are ephemeral. The local SQLite fallback in /tmp is strictly for local dev/testing and will lose state across function invocations.

1. Provision a PostgreSQL instance on Supabase or Neon.
2. Copy the Pooled Connection URL.
3. Navigate to Vercel Project > Settings > Environment Variables.
4. Add DATABASE_URL with the connection string for Production, Preview, and Development.
5. Redeploy using vercel --prod.

Health Check

Verify backend connectivity at https://your-app.vercel.app/api/health. 
It must return persistent_database_configured: true before onboarding users.