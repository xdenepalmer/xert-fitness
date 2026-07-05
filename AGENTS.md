# AGENTS.md

## Project Context

This is the XERT Fitness Vite/React app. It deploys to Vercel and uses Supabase for auth, leads, bookings, class sessions and admin settings.

Start with `README.md` for local setup, environment variables and deployment workflow.

## Key Files

- `src/`: frontend application source.
- `src/lib/supabase.js`: Supabase browser client.
- `src/lib/SupabaseAuthContext.jsx`: Supabase auth provider.
- `src/lib/adminData.js`: Supabase-backed admin/data helpers.
- `src/supabase/rls_policies.sql`: Supabase RLS policy setup notes.
- `vite.config.js`: Vite config.
- `.env.local`: local-only environment values; never commit secrets.

## Working Notes

- Use `npm run dev` for local development.
- Use `npm run build` to verify production output for Vercel.
- Keep Supabase environment variables prefixed with `VITE_` when they must be available in the browser.
- Never commit Supabase service-role keys or other secrets.
- Run the relevant checks from `package.json` before finishing code changes.
