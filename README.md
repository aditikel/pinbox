# Pinbox: login + Gmail backfill

## 1. Supabase
1. Create a project at supabase.com.
2. SQL editor: paste and run `supabase/schema.sql`.
3. Authentication > Providers > Google: enable it and paste your Google client ID and secret (step 2).
4. Authentication > URL Configuration: add `http://localhost:3000/auth/callback` to Redirect URLs (add your Vercel URL later).
5. Settings > API: copy the URL, anon key and service role key into `.env.local`.

## 2. Google Cloud
1. Create one project, then enable the **Gmail API** and **Google Calendar API**.
2. OAuth consent screen: type External, status **Testing**. Add every teammate (and yourself) as a test user.
3. Add scopes `gmail.readonly` and `calendar.readonly`.
4. Credentials > Create OAuth client ID (Web). Authorized redirect URI is the callback shown in Supabase's Google provider page, `https://YOUR-PROJECT.supabase.co/auth/v1/callback`.
5. Copy the client ID and secret into Supabase (step 1.3) and `.env.local`.

## 3. Run it
```
cp .env.example .env.local      # fill in every value
openssl rand -base64 32         # paste into TOKEN_ENCRYPTION_KEY
npm install
npm run dev
```
Copy these from your PDF renders into `public/`: `pinbox-logo.png`, `login-waves-dark.webp`, `google-g.png`.

## What it does
- `/login`: email + password, sign up, forgot password, Google. Google requests read-only Gmail and Calendar with offline access in one consent screen.
- `/auth/callback`: swaps the code for a session and saves the Google refresh token **encrypted** (AES-256-GCM) in a table only the server can read.
- `/start`: "backfill gmail" calls `/api/backfill`; "start fresh" skips it.
- `/api/backfill`:
  1. Gmail search pre-filter (ATS senders + subject keywords) over the last 60 days.
  2. Fetches only matching threads and trims quoted replies.
  3. Sends the trimmed text to the model, which returns category, company, role, deadline and confidence as JSON.
  4. Matches by normalized company + role, so no duplicates. Status only moves forward, and a rejection always wins.
  5. Stores fields and the Gmail thread ID. **There is no email body column.** Creates actions for OAs, scheduling replies and offers; rejections create none.

## Known gaps
- Calendar sync is not built yet (the scope is requested already).
- Backfill runs in one request, capped at 300 threads to fit Vercel's time limit. Move it to a queue or Supabase Edge Function for more.
- Check the LLM provider's retention settings for your account before real users sign in.
- Ignored-items and "Delete my data" are in the schema but have no UI yet.
- Untested: I couldn't install packages here, so run `npm run dev` and send me any errors.
