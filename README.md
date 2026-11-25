# Family Christmas Lists

React + Vite front end on a Supabase backend (database migrations and the `family-admin` Edge Function live in `supabase/`).

## Run locally
1. `npm install`
2. Copy `.env.example` to `.env.local` (values are already filled in for your project)
3. `npm run dev`

## Deploy
Import the repo in Vercel or Netlify, set the same three `VITE_` variables, and deploy. Never add a service-role key to the front end.
