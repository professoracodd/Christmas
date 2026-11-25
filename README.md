# Eli & Jazz Christmas

A wish list app for the family. Kids add wishes from their own phone link; parents and gift buyers see every list and mark gifts as bought. Kids never see what has been bought.

React + Vite front end, Supabase backend (database migrations and the `family-admin` Edge Function are in `supabase/`).

## Folder layout (keep it exactly like this)

```
.github/workflows/deploy.yml   builds and publishes to GitHub Pages
public/                        icons + manifest (copied as-is)
src/                           the app code
supabase/                      migrations, config.toml, functions/family-admin/index.ts
index.html  package.json  tsconfig.json  vite.config.ts  .gitignore
```

## Supabase (once)
1. Run the files in `supabase/migrations/` in name order (SQL Editor works fine).
2. Edge Function `family-admin`: paste `supabase/functions/family-admin/index.ts` and deploy.
3. In that function's settings, turn **JWT verification OFF**. The function checks sign-in itself. With JWT verification on, the new `sb_publishable_` key is rejected and every sign-in fails.
4. Edge Function secret: `SETUP_CODE` = a code only you know.

## GitHub (once)
1. Settings → Pages → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions → **Variables** tab (not Secrets):
   - `VITE_SUPABASE_URL` = `https://YOUR-REF.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_...`
3. Push to `main` (or run the workflow by hand from the Actions tab).

## First use
Open the site → **First-time setup** → enter the setup code and your name. This makes you the owner and creates Eli and Jazz. Then go to **People** and text each person their link.

## Run on your computer (optional)
`npm install`, copy `.env.example` to `.env.local` and fill it in, then `npm run dev`.
