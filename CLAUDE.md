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
- `Documents/CTO_AUDIT.md` — full code audit findings
- `Documents/CTO_HANDOFF.md` — session-by-session history with decisions
- `CHANGELOG.md` — version history

When the user says "documentar", update `Documents/MASTERPLAN.md` with current state.
