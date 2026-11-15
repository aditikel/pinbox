# Pinbox: project context

Pinbox is a dashboard for students in recruiting. It connects to Gmail and Google Calendar and turns the inbox into one list of applications plus the actions each one needs today. Owner: Aditi (user "Victor" is just the demo name in the design).

## Read these first
- `docs/PRD.txt`: product requirements, user journey, data model, privacy rules.
- `docs/design-notes.txt`: stakeholder notes and design choices per page.
- `docs/Pinbox-figma.pdf`: the Figma design, 11 screens (light + dark): login, "How would you like to begin?", home, pipeline (+ filter row), companies, resumes, resume detail.
- `docs/pinbox-design-preview.html`: working HTML prototype of every screen, matched to the PDF at a fixed 1280x832 canvas. Colors and positions in it were sampled from the PDF. Port from it; do not redesign.
- Figma MCP is connected. When given a Figma link, use it for exact values, and fall back to the PDF and the preview.

## Stack
Next.js (app router) + Supabase (auth, Postgres, RLS) + Gmail/Calendar APIs called directly (no Composio) + Anthropic API for classification. Deploy on Vercel.

## Design tokens (dark theme, sampled from the PDF)
bg #242124, sidebar/panels #20171e, field #2e2429, accent #a34558, rose #e63f6b, orange #d18951, yellow #f6c564, text #feffdc, muted #78736a, blue #5a8cd7. Light: bg #fdf8f4, sidebar #eedfdb, panel #f6eae6, text #242124.
Fonts (closest matches, unconfirmed): Chakra Petch (headings/nav), Mulish (body), Titillium Web (login/begin screens).
Sidebar: logo, "welcome, <name>", nav home / pipeline / companies / resumes with a vertical rail and dots, gear/logout/profile icons at the bottom.

## What is built so far
- `/login` (email+password, sign up, forgot password, Google), `/auth/callback`, `/start` (backfill gmail or start fresh, with live progress), `/api/backfill`.
- `/home` (daily agenda, upcoming, your year) reading Supabase. Ported from the preview; still to be matched against Figma once edit access to the file is sorted out.
- Backfill: `lib/classify.ts` (Anthropic SDK, structured output), `lib/ingest.ts` (pure matching/status/action rules), `/api/backfill` streams NDJSON progress, skips already-processed and ignored threads, respects `edited_fields`.
- `/pipeline`: table with search, status filters, star, edit/add dialog, delete (adds Gmail threads to ignored_items), CSV import (skips duplicates). Entry mutations live in `app/entries-actions.ts`; the dialog is `components/EntryDialog.tsx`. Resume and notes icons are disabled until those features exist.
- `/companies`: list grouped by company_key (`lib/companies.ts`), filters, search, side card with timeline (emails + touchpoints), contacts, roles, add touchpoint, favorite, delete. Needs `supabase/migrations/002_companies.sql` (touchpoints, company_favorites); without it the page still renders from applications and emails.
- `/resumes` gallery (upload PDF straight from the browser to the private `resumes` storage bucket, default badge, make default, delete) and `/resumes/[id]` (rename, download, inline preview via signed URL, applications using it). Applications have `resume_id`; empty means the default resume applies. The Add/Edit dialog has a Resume select; the pipeline resume icon opens it. Needs `supabase/migrations/003_resumes.sql`.
- Theme: dark by default regardless of system setting; the sidebar gear switches to light.
- Shared shell: `app/app.css` (tokens), `components/Stage.tsx` (1280x832 scaled canvas), `components/Sidebar.tsx`.
- `supabase/schema.sql` (applications, events, actions, ignored_items, google_tokens; RLS on). Already run.
- Local dev works on http://localhost:3000. `.env.local` is filled in for Supabase only. Google and Anthropic keys are still blank.

## Next up
1. Port home, pipeline, companies, resumes, resume-detail screens from Figma/preview into real routes, reading Supabase data.
2. Google Cloud OAuth setup, then test backfill (60 days per the design; PRD says 90, `BACKFILL_DAYS` env).
3. Calendar sync, edit mode (inline edit, delete with ignore list, merge), CSV import/export, Delete my data.

## Rules
- Never store email bodies, event descriptions, or compensation/offer terms. Store extracted fields and the Gmail thread ID only. Never log LLM inputs.
- Rejections never create actions or alerts; they only change status.
- User edits win over sync. Deleted items go to ignored_items and never return.
- Never print or commit `.env.local` or any secret. `SUPABASE_SERVICE_ROLE_KEY` is server-only.
- `lib/supabase.ts` is server-only (uses next/headers). Client components import `lib/supabase-browser.ts`.
- Keep it simple: one clear job per page, reduce complexity (see design notes).
