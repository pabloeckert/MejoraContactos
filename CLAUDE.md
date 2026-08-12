# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install --legacy-peer-deps   # required flag — peer dep conflicts exist
npm run dev                      # dev server on http://localhost:8080
npm run build                    # production build
npm run lint                     # ESLint + TypeScript check
npm test                         # unit tests (Vitest, run-once)
npm run test:watch               # unit tests in watch mode
npm run test:coverage            # coverage report
npm run test:e2e                 # Playwright E2E (Chromium)
npm run test:e2e:headed          # E2E with visible browser
```

To run a single test file:
```bash
npx vitest run src/lib/__tests__/dedup.test.ts
```

To deploy Edge Functions (requires Supabase CLI):
```bash
npx supabase functions deploy clean-contacts
npx supabase functions deploy google-contacts-auth
npx supabase functions deploy log-error
```

## Architecture

### Overview

Privacy-first SPA — all contact data stays in the browser. AI calls go directly from browser → 12 AI provider APIs (no own backend). Supabase Edge Functions handle only: AI proxying with rate limiting, Google OAuth, and error logging.

```
Browser (React SPA + IndexedDB + Web Workers)
    │
    ├─→ AI Provider APIs (Groq, OpenRouter, Gemini, etc.) — direct fetch
    └─→ Supabase Edge Functions (Deno)
            ├─→ clean-contacts — AI proxy with rate limiting + L1 cache
            ├─→ google-contacts-auth — OAuth, People API, delete
            └─→ log-error — Sentry-side error logging
```

Deploy: `push to main` → GitHub Actions (lint → unit tests → build → perf budget → E2E) → GitHub Pages.

### Core Data Flow

1. **Import** (`FileDropzone`, `GoogleContactsPanel`): Parse CSV/Excel/VCF/JSON/Google → `ParsedFile[]`
2. **Process** (`useContactProcessing`): orchestrates the full pipeline via `useReducer`
   - Column mapping (`column-mapper.ts`) — auto-detect ES/EN column names
   - Rule cleaning (`pipeline.worker.ts` via Web Worker) — deterministic, handles ~80% of contacts
   - AI cleaning (`useAIPipeline`) — 3-stage: clean → verify → correct
   - Phone validation (`phone-validator.ts` / `libphonenumber-js`, lazy-loaded)
   - Deduplication (`useDedup` + `pipeline.worker.ts`) — email hash O(1) → phone hash O(1) → Jaro-Winkler fuzzy
3. **Results** (`ContactsTable`): Virtualized table (`@tanstack/react-virtual`) for 50K+ contacts
4. **Export** (`export-utils.ts`): CSV, Excel, VCF, JSON, JSONL, HTML, CRM formats

All processed contacts persist to **IndexedDB** (`src/lib/db.ts`, DB name `mejoraapp`, v3) with cursor-based batch reads for large datasets. History snapshots (max 10, TTL 30 days) enable undo.

### Key Modules

| Path | Responsibility |
|------|---------------|
| `src/types/contact.ts` | All core types: `UnifiedContact`, `ParsedFile`, `ContactField`, `ProcessingStats` |
| `src/hooks/useContactProcessing.ts` | Main pipeline orchestrator — `useReducer`-based state, calls sub-hooks |
| `src/hooks/useAIPipeline.ts` | AI 3-stage pipeline, provider rotation with exponential backoff |
| `src/hooks/useDedup.ts` | Deduplication logic (delegates heavy work to Web Worker) |
| `src/workers/pipeline.worker.ts` | Web Worker for CPU-intensive rule cleaning + dedup (runs off main thread) |
| `src/lib/db.ts` | IndexedDB via `idb` — contacts store + history store, cursor-based streaming |
| `src/lib/api-keys.ts` | AES-GCM encryption of API keys in localStorage via Web Crypto API |
| `src/lib/providers.ts` | 12 AI provider definitions (URLs, signup links, free model IDs) |
| `src/lib/rule-cleaner.ts` | Deterministic cleaning rules (junk detection, title-case, email, phone) |
| `src/lib/column-mapper.ts` | Auto-detect column → `ContactField` mappings from Spanish/English header names |
| `src/lib/dedup.ts` | Jaro-Winkler + hash-based dedup index |
| `src/lib/export-utils.ts` | All export formats including CRM (HubSpot, Salesforce, Zoho, Airtable) |
| `src/lib/usage-limits.ts` | Free/Pro tier enforcement in localStorage (500 contacts/batch, 3 batches/day free) |
| `src/lib/i18n.tsx` | Lightweight custom i18n — no external deps, ES/EN, key interpolation |
| `src/lib/error-handler.ts` | Unified error handling with 8 categories, 4 severities, `safeAsync`/`safeSync` |

### State Architecture

`useContactProcessing` manages all pipeline state with `useReducer` (actions like `SET_MODE`, `UPDATE_PIPELINE`, `ADD_LOG`). It delegates to:
- `useAIPipeline` — AI stages + provider health/rotation
- `useDedup` — deduplication

The Web Worker (`pipeline.worker.ts`) receives plain objects via `postMessage` and returns `ruleClean:done` or `dedup:done` results. It inlines all logic (no imports) to avoid worker context limitations.

### Important Patterns

**Lazy loading**: PapaParse (CSV), SheetJS/xlsx (Excel), libphonenumber-js, and Sentry are all lazy-imported to keep the main bundle at ~298KB. Do not move them to static imports.

**AI provider calls**: All 12 providers use the OpenAI-compatible chat completions API shape. The `useAIPipeline` hook rotates keys per-provider and retries with exponential backoff on failure.

**API key security**: Keys stored with AES-GCM via Web Crypto. `getActiveKeys()` is sync (returns from in-memory cache); `loadProviderKeys()` is async (waits for full decryption). The marker `__enc__:` prefix identifies encrypted values.

**Routing**: React Router with `basename` derived from `import.meta.env.BASE_URL` — required because the app is hosted at `/MejoraContactos/` on GitHub Pages. Add new routes above the `*` catch-all in `App.tsx`.

**i18n**: Use `const { t } = useI18n()` and `t("key")` for any user-facing string. Translation files are `src/lib/locales/es.ts` and `src/lib/locales/en.ts`. The `I18nProvider` wraps the entire app in `App.tsx`.

### Environment Variables

Copy `.env.example` to `.env.local`. Required for AI features:
- `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase project connection
- `VITE_SUPABASE_PROJECT_ID` — for Edge Function calls

Optional:
- `VITE_SENTRY_DSN` — error tracking (lazy-loaded, safe to omit)
- `VITE_PLAUSIBLE_DOMAIN` — analytics (GDPR-safe, safe to omit)

### CI/CD

The CI pipeline (`.github/workflows/ci.yml`) runs on every push/PR to `main`: lint → unit tests → build → performance budget check (`scripts/perf-check.sh`, limits: < 2MB total, < 450KB index chunk) → build smoke test.

Deploy (`.github/workflows/deploy-pages.yml`) additionally runs E2E tests before deploying to GitHub Pages.

### Documentation

- `Documents/MASTERPLAN.md` — canonical technical reference, updated after each session
- `CHANGELOG.md` — version history

When the user says "documentar", update `Documents/MASTERPLAN.md` with current state.

### Session transcript (dogma — recurring)

Every time this file (`CLAUDE.md`) is updated, also update `MejoraContactos.md` at the repo root: a full running transcript of the conversation up to that point. Rules for that file:
- Continuous prose, no speaker labels (no "User:"/"Claude:" prefixes).
- Literal and complete — decisions, findings, explanations, full HTML/MD/code blocks, terminal commands, raw tool JSON, and technical outputs (curl, git, SQL) all included verbatim. Do not filter or summarize.
- If the conversation included attachments/pasted files/images, transcribe their content into text too.
- `MejoraContactos.md` is gitignored (see `.gitignore`) because session transcripts can contain real personal data (e.g. third-party contact names surfaced while working on `motor-contactos/`) — never commit it.

**Second trigger**: also update `MejoraContactos.md` (same rules as above) whenever the session appears to be approaching a token/usage limit — not only on CLAUDE.md edits. Purpose: the user can open an alternate Claude account, paste `MejoraContactos.md`, and continue with full context. Keep this file (`CLAUDE.md`) current as the handoff/status doc for that continuation.

### Continuous work mode (dogma)

Unless an action is irreversible/dangerous, requires credentials only the user can provide, or changes project scope in a way that needs his call — do not stop to ask permission or check in mid-task. Keep working through the full scope of the current request until it's actually done. This overrides the general instinct to pause for confirmation on ambiguous but low-stakes implementation choices.

### PM autonomy (dogma)

Act as an autonomous project manager on this whole repo (SPA and `motor-contactos/` alike): decide and proceed on design/architecture/scope calls without surveying the user first. Only stop to ask when the next step literally requires the user's hands/eyes/login (a browser OAuth flow, a physical action, money, a signature) — not for validating taste or implementation choices. State the decision made, don't turn it into a question.

### motor-contactos — status handoff (private project, not otherwise documented here)

`motor-contactos/` is a separate, private Python project (contact dedup/normalization pipeline for the repo owner's personal contacts) living alongside the SPA in this repo, gitignored/untracked on purpose — see `Data/decisiones-arquitectura.txt` if present locally. It is currently mid-expansion into a bigger scope (better UI, JSON API, Google Contacts sync migrated off a deprecated Google service) per a plan file under `C:\Users\Pablo\.claude\plans\`. As of the last session:

- **Blocking issue, needs the user**: the project's real local database and raw source files ended up in the Windows Recycle Bin (confirmed intact there, not lost) and have not been restored yet. Do not start the Flask backend against the real `motor-contactos/config.yaml` until this is resolved — connecting SQLite to a missing db file silently creates an empty replacement, which complicates restoring the real one.
- Code-side work (a new JSON API, a new React UI project under `motor-contactos/ui/`, a Google Apps Script migration, and a contact-editing feature) is written and its test suite passes, but hasn't been validated against real data since the above data issue surfaced.
- Two more things need the user directly and can't be done by Claude: loading LLM provider API keys into `motor-contactos/.env`, and authorizing/testing the Google Contacts sync with their own Google login.

Full narrative detail (commands run, findings, code) lives in `MejoraContactos.md` at the repo root (gitignored) — read that for the complete handoff if resuming this thread.
