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

Account password hashes and the local session-signing key are stored under `.aura-data/` with restrictive local filesystem permissions. This directory is ignored by Git. Back it up securely if you need to preserve accounts; losing the signing key invalidates sessions. This local account setup is not intended for public or multi-server hosting: there is no cross-device database, email verification, account recovery, or request rate limiting.

If Ollama isn't running, open another terminal and run `ollama serve` (if your installation doesn't already run it as a service). Test Ollama directly with `ollama run qwen2.5:3b`.

## Configuration
Set `OLLAMA_BASE_URL` and `OLLAMA_MODEL` in `.env.local`. The default URL is `http://127.0.0.1:11434`.

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
