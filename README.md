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

## Google and GitHub sign-in

The sign-in and sign-up forms use Supabase Auth OAuth with a PKCE callback at `/auth/callback`. The browser sends users to the callback on the origin they are using (local, production, or a Vercel preview), and the callback exchanges the code with the Supabase SSR client before returning to the AURA workspace. No OAuth secrets belong in this repository or in `NEXT_PUBLIC_*` variables.

### Configure Google

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project and open **Google Auth Platform**. Configure the app name, support email, audience, and developer contact details. While the app is in testing, add the Google accounts that will test it; publish the consent screen when ready for general use.
2. Under **Clients**, create an OAuth client with application type **Web application**. Add your AURA website origins under **Authorized JavaScript origins** (for example `http://localhost:3000` and `https://your-production-domain.example`).
3. In the Supabase project dashboard, open **Authentication → Sign In / Providers → Google** and copy its displayed callback URL. It has the form `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Add that exact Supabase callback URL under **Authorized redirect URIs** in the Google client. Save the Google client ID and client secret directly in the Supabase Google provider settings, enable the provider, and save. Do not put the secret in `.env.local` or Git.

### Configure GitHub

1. In GitHub, open **Settings → Developer settings → OAuth Apps → New OAuth App**. Set the application name and homepage URL to your AURA site.
2. Copy the callback URL displayed by Supabase under **Authentication → Sign In / Providers → GitHub** (usually `https://<project-ref>.supabase.co/auth/v1/callback`) into the GitHub app's **Authorization callback URL**, then register the app.
3. Generate a GitHub client secret. In Supabase, enable the GitHub provider and enter the GitHub client ID and client secret. Save the secret only in Supabase, never in this repository or browser code.

### Configure Supabase redirect URLs

1. In **Authentication → URL Configuration**, set **Site URL** to the production AURA URL. Keep it as the canonical production origin for email flows and fallback redirects.
2. Add these entries to **Redirect URLs** (replace the example domain and Vercel team slug):
   - `http://localhost:3000/auth/callback`
   - `https://your-production-domain.example/auth/callback`
   - `https://*-<team-or-account-slug>.vercel.app/**` for Vercel preview deployments, if you use them.
3. Confirm the deployed app has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set in Vercel for the environments you use. The callback URL is derived from the active page origin, so local, production, and preview deployments use their own callback host without a hard-coded site URL.
4. Test both providers locally and on the deployed domain. Check a first-time account, a returning account, cancellation, and a provider error. OAuth cannot complete until both provider credentials and the Supabase callback/redirect allowlists are configured.

The app does not match accounts or call `linkIdentity()` itself. Identity behavior is handled by Supabase Auth; its documented default automatic identity linking can combine identities with the same email, while manual linking is a separate user-initiated feature. Review your Supabase identity-linking configuration and provider email-verification behavior if your account policy requires a different linking model.

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
