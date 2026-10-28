# AURA AI — Local-first personal assistant starter

A first working version of a personal AI web app. It uses Next.js for the UI and server API route, and Ollama for local model inference. The starter does **not** yet implement persistent memory, cloud-model routing, web search, vision, terminal execution, or task automation; those are planned extensions.

## Requirements
- Node.js LTS and npm
- Ollama installed and running
- A model downloaded in Ollama (default: `qwen2.5:3b`)

## Run it

```bash
npm install
ollama pull qwen2.5:3b
npm run dev
```

Open http://localhost:3000. Keep this development server local to your computer.

On first visit, create an AURA account. Additional users can create separate accounts on this installation. Chat history and Academic records use per-account browser storage; this data is local to each browser profile and is not synced to another device. Existing pre-account browser data is copied into the first account when the browser supports IndexedDB database enumeration.

Local development keeps the existing scrypt password hashes and session-signing key under `.aura-data/`. This file-based account store is only enabled outside production; it is not suitable for Vercel or any multi-instance deployment. Production authentication uses Supabase Auth, and production chat, memory, task, settings, and academic records use Supabase Postgres with row-level security.

If Ollama isn't running, open another terminal and run `ollama serve` (if your installation doesn't already run it as a service). Test Ollama directly with `ollama run qwen2.5:3b`.

## Configuration
Copy `.env.example` to `.env.local`, then set `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as needed. The supplied example includes this project URL: `https://vgaxeusmmzyeziccawbs.supabase.co`. The publishable key takes precedence; `NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted only as a legacy fallback. Restart `npm run dev` after changing these values. The Ollama default URL is `http://127.0.0.1:11434`.

## Production account and data setup

1. Create a Supabase project. In Project Settings → API, copy its Project URL and Publishable key.
2. Put those values in `.env.local` using the names in `.env.example` for local development.
3. Choose one migration path: run [`supabase/migrations/20261026000000_create_aura_records.sql`](supabase/migrations/20261026000000_create_aura_records.sql) in Supabase SQL Editor, or use the CLI commands below. The migration is additive and enables per-user row-level security.
4. For CLI migrations, run `npx supabase init` once if `supabase/config.toml` is not present, then `npx supabase login`, `npx supabase link --project-ref <your-project-ref>`, and `npx supabase db push` from the repository root. The SQL is safe to reapply, but choose one setup path to keep migration history clear.
5. In Vercel Project Settings → Environment Variables, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for Production (and Preview if needed). Use the project's URL shown above and your Supabase Project Settings → API publishable key. Then redeploy; Next.js embeds `NEXT_PUBLIC_*` values at build time.
6. In Supabase Authentication → URL Configuration, configure the Site URL and allowed redirect URLs for the deployed domain and local development. Choose whether email confirmation is required.

The browser uses Supabase's publishable/anon key. The SQL policies bind every row to `auth.uid()`; do not remove them. No service-role key is required or used by this app. If Supabase is missing in production, account endpoints return an explicit setup message instead of trying to write to the server filesystem.

Existing local IndexedDB data is not deleted by this change. Local file accounts and their IDs are separate from Supabase accounts; the app does not automatically transfer those accounts. Back up local data before switching an existing installation to hosted accounts.

## Voice input

The assistant voice panel uses the browser's Web Speech API when available. Microphone permission is required, browser support varies, and the browser may send audio to an external speech-recognition service. Optional spoken replies use browser speech synthesis. Neither feature is handled by Ollama, and voice processing is not guaranteed to remain local.

## Memory, Coding Tools, and Tasks

- Memory entries and their opt-in setting are saved in a browser IndexedDB database scoped to the signed-in account. Memory use starts disabled; when enabled, only keyword-matched entries are included with chat requests. This browser storage is local and is not encrypted.
- Coding Tools uses the authenticated `/api/coding` route and the configured Ollama model. It does not execute, compile, or test code; outputs need review before use.
- Personal Tasks are stored per account in browser IndexedDB. They are separate from the course-specific Academic planner, which does not currently generate tasks with AI.

## Academic workspace

Choose **Academic** in the AURA sidebar to manage semesters and subjects, save study materials, ask questions grounded in those materials, generate practice sets, and track exams, syllabus topics, daily goals, and revision tasks.

- Academic records and extracted text are stored separately from general chat in per-account IndexedDB databases. They are local to this browser profile and device; clearing site data removes them. There is no sync, backup, or encryption layer yet.
- PDF, TXT, and Markdown files are limited to 10 MB each. PDFs are limited to 500 pages and 500,000 extracted characters. Scanned PDFs and image understanding are not supported; PDFs need selectable text.
- Retrieval currently ranks text chunks by keyword overlap. It does not use embeddings, so paraphrased questions may miss relevant passages. Answers send only selected passages to the configured Ollama endpoint, which defaults to `http://127.0.0.1:11434` and `qwen2.5:3b`.
- Exam sets can use matching uploaded passages. Without matching material, the local model generates from general knowledge and labels the result for syllabus review. qwen2.5:3b is text-only here; there is no cloud provider configured or used.

## Exam Planner and email reminders

The **Exam Planner** is an additive module in Academic. It supports manual subject/exam entry, review-before-save imports from selectable-text PDF, CSV, and XLSX (first worksheet), topic tracking, estimated study sessions, calendar views, and per-user reminder preferences. Images and scanned PDFs can be recorded but need manual exam entry because OCR is not configured. Imported file contents are processed in the browser and only parsed review data and a SHA-256 fingerprint are saved; the private source file itself is not uploaded. This release does not provide a daily digest, AI-generated study plan, or document syllabus/topic extraction. Ollama interpretation is optional and only works when the configured server can reach Ollama.

### Apply the database migration manually

Back up your Supabase project first. In the existing project's **SQL Editor**, review and run [`supabase/migrations/20261028000000_create_exam_planner.sql`](supabase/migrations/20261028000000_create_exam_planner.sql). It only adds Exam Planner tables, policies, indexes, and functions; it does not alter existing Academic tables. Do not use `db push` for this migration unless you have intentionally configured the Supabase CLI and reviewed its migration history. The app will show a setup error until this migration is installed. All saved planner data is owned by the authenticated Supabase user and protected by RLS.

### Configure email delivery

Email is optional. Without it, exams and study data still save, and reminder setup status is shown in the UI.

1. Create a Resend account and verify a domain you control. The sender must use that verified domain. The free plan is currently advertised as 3,000 emails per month and 100 per day; quotas and terms can change, and accepted email is not guaranteed inbox delivery. See [Resend pricing](https://resend.com/pricing).
2. Set the server-only variables from `.env.example` in local `.env.local` or Vercel project settings: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, and `NEXT_PUBLIC_APP_URL`. Keep the service-role key, Resend key, and cron secret server-side. Use a long random cron secret and the same value in Supabase Vault in the next step. Never paste secrets into chat or commit them.
3. Deploy the app to the existing Vercel project after configuring variables. Do not deploy as part of this setup. The cron route is `/api/cron/exam-reminders` and accepts only `Authorization: Bearer <CRON_SECRET>`.
4. In Supabase **Database → Extensions**, enable `pg_cron`, `pg_net`, and Vault if available on your project. In SQL Editor, review `supabase/scheduler/exam-reminders.sql`, replace both placeholders locally with the project URL and the cron secret, and run it once. It creates Vault secrets and schedules a one-minute invocation. Check Supabase's Cron dashboard/job table to confirm scheduling. To stop it, use `select cron.unschedule('aura-exam-reminders');`.

The scheduler uses an atomic `FOR UPDATE SKIP LOCKED` claim, persistent reminder rows, provider idempotency keys, bounded retries, and logs provider acceptance (not inbox delivery). Supabase `pg_net` uses a transient request queue, so a database outage or scheduler interruption can delay a run; due jobs remain in the database and are eligible on a later run, but this free setup cannot guarantee exact delivery time or uninterrupted service. Vercel Hobby cron is not used because its schedule frequency is too low for the two-hour reminder option. Review current [Supabase Cron](https://supabase.com/docs/guides/cron), [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net), [Vercel Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), and [Resend pricing](https://resend.com/pricing) before configuring; free tiers can change.

### Manual smoke test

1. Configure Supabase Auth and the existing records schema, then apply the Exam Planner migration above.
2. Sign in as a verified account; open **Academic → Exam Planner**. Confirm the dashboard is empty rather than filled with sample data.
3. Add a subject and exam manually, reload the page, then edit/reschedule and cancel it. Confirm the saved values persist and cancelled exams leave Upcoming Exams.
4. Import a small text PDF, CSV, or XLSX; inspect every proposed date/time and subject, edit uncertain values, then confirm. Import the same file again and confirm it is flagged as a duplicate. Try a scanned PDF/image to see its manual-entry fallback.
5. Add topics, mark one complete, create an estimated study plan, and check off a session. Inspect Upcoming, Past, Calendar, and Notification History.
6. Configure Resend and the scheduler only after sender verification. Save reminders, request one test email, verify the provider acceptance/history status, then use Supabase's dashboard or a controlled due exam to check scheduler processing. Do not use an unverified sender or send tests to other recipients.

No live Supabase migration, Resend request, scheduled run, or Vercel deployment was performed during implementation. The email and cron features remain inactive until you configure the external services above.

## Microsoft College Notice Inbox

Academic includes a manual Outlook notice sync. It requests delegated `User.Read`, `Mail.Read`, and `offline_access` only. It does not request send/write or application permissions. The first sync reads a bounded maximum of 150 recent messages from the most recent 30 days; later syncs use Microsoft Graph delta cursors. No scheduler or paid service is required. Message body text is examined in memory for conservative academic keywords and is not retained. This version does not have an AI summary provider configured, so notices show **Summary unavailable** and candidate dates require review. Attachments are not downloaded. Archiving only changes the AURA copy.

### Microsoft Entra app registration

1. In Microsoft Entra admin center, create an app registration for your college tenant. Choose **Accounts in this organizational directory only** when using a tenant-specific ID. Set the platform to **Web**.
2. Add this exact redirect URI for local development: `http://localhost:3000/api/outlook/callback`. In production add the exact HTTPS callback URL, for example `https://your-domain.example/api/outlook/callback`, and set `MICROSOFT_REDIRECT_URI` to the same value. Scheme, hostname, port, path, and trailing slash must match exactly.
3. Create a client secret and copy its value once into the server environment as `MICROSOFT_CLIENT_SECRET`. Do not commit it or send it in chat.
4. Under API permissions, add Microsoft Graph **Delegated** `User.Read`, `Mail.Read`, and `offline_access`. Do not add `Mail.ReadWrite`, `Mail.Send`, or application mail permissions. If tenant policy requires admin consent, ask the college Microsoft 365 administrator to approve these exact delegated permissions; this app cannot bypass tenant policy. A denied consent leaves the mailbox disconnected.
5. Configure all of these in local `.env.local` (copied from `.env.example`) and in the production hosting environment. All values in `.env.example` are empty placeholders except the local callback example.

```dotenv
MICROSOFT_CLIENT_ID=
MICROSOFT_TENANT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_REDIRECT_URI=http://localhost:3000/api/outlook/callback
MICROSOFT_TOKEN_ENCRYPTION_KEY=
```

Generate a 32-byte encryption key locally and encode it as 64 hex characters, for example with `openssl rand -hex 32`; never print or commit the generated value. Keep it stable while encrypted connections exist. Rotating it without first disconnecting/reconnecting mailboxes makes their saved token caches unreadable. The confidential-client flow requires the server-only client secret. The redirect callback is `/api/outlook/callback`.

### Supabase setup and security

Outlook sync requires Supabase Auth accounts, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or its existing anon-key fallback), and the server-only `SUPABASE_SERVICE_ROLE_KEY`. Local file accounts are deliberately rejected because their IDs are not `auth.users` IDs. The service-role key is used only by server routes to access the credential table, which has no grants to browser roles. Notices are stored in `college_notices`, protected by `auth.uid()` RLS. The server derives the user from the Supabase session; it does not accept a user ID from the browser.

Back up and review [`supabase/migrations/20261029000000_create_outlook_notices.sql`](supabase/migrations/20261029000000_create_outlook_notices.sql), then run it manually in the target Supabase SQL Editor. Do not run it automatically against production. Rollback by dropping `college_notices` and then `microsoft_mailbox_connections`; this deletes the AURA notice archive and local credential records. No production migration was run as part of this change. AURA does not retain full message bodies or download attachments; it retains message metadata and notice records until the account is deleted or the rows are removed by an administrator.

### Local checks and operating limits

Run `npm run dev`, sign in using Supabase Auth, open Academic → College Notices, connect, then choose **Sync notices**. Automated tests mock Graph; they never use mailbox credentials. Run `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`. A missing provider, tenant consent denial, expired grant, invalid cursor, Graph throttling, or Supabase migration issue is surfaced as an error; sync can be retried manually. Microsoft refresh tokens reside only in an AES-256-GCM encrypted MSAL cache on the server. Disconnect deletes AURA's credential row and stops future syncs; Microsoft does not expose a narrowly scoped delegated revoke endpoint without requesting additional permissions, so revoke AURA under the Microsoft account **My Apps / Apps and services** page or ask the college administrator to remove the consent grant. Notice metadata remains until the AURA user account is deleted or an administrator removes the rows; no full message bodies or attachment files are retained.

For production, set the five `MICROSOFT_*` values and `SUPABASE_SERVICE_ROLE_KEY` as server environment variables, set the redirect URI to the deployed HTTPS callback, and redeploy. Never add any of these secrets with a `NEXT_PUBLIC_` prefix. There is no automatic or guaranteed 24/7 sync in this version. Supabase free-tier database/storage quotas and Microsoft Graph throttling apply; the bounded manual sync avoids a paid scheduler or queue.

Run the checks with:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

## Roadmap
1. Add explicit, user-managed memory with delete/export controls.
2. Add model routing: local for routine prompts; cloud only when configured and explicitly selected/allowed.
3. Add web search through a server-side search provider.
4. Add image upload and a vision-capable model/provider.
5. Add approved tools for reminders, coding tasks, and automation.
6. Package the web UI as a desktop app with Tauri after the web app is stable.

## Security checklist before exposing it beyond localhost
- Never put provider API keys in client-side code.
- Do not expose the Ollama port to the public internet.
- Add origin checks, rate limiting, account recovery, and a shared persistent database before remote hosting.
- Keep tool execution disabled until you have an allowlist, sandbox, audit log, and confirmation for destructive actions.
- Do not send private content to cloud providers unless you explicitly choose to.
- Treat webpages, uploaded documents, and model output as untrusted input.
