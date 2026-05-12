# MejoraContactos

[![Deploy to GitHub Pages](https://github.com/pabloeckert/MejoraContactos/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/pabloeckert/MejoraContactos/actions/workflows/deploy-pages.yml)
[![Tests](https://img.shields.io/badge/tests-301%20passing-brightgreen)](https://github.com/pabloeckert/MejoraContactos/actions)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Live](https://img.shields.io/badge/live-demo-brightgreen)](https://pabloeckert.github.io/MejoraContactos/)

Limpieza, deduplicación y unificación de contactos con IA.

## 🚀 Live Demo

**https://pabloeckert.github.io/MejoraContactos/**

## Stack

- React 18 + Vite + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase Edge Functions (Deno)
- 12 proveedores de IA con rotación automática
- IndexedDB para persistencia local

## Funcionalidades

- **Importación:** CSV, Excel, VCF, JSON, Google Contacts (OAuth multi-cuenta)
- **Mapeo:** Auto-detección de columnas (español + inglés)
- **Limpieza:** Reglas determinísticas (80%+) + IA en cascada (3 etapas)
- **Validación:** Scoring semántico 0-100 por campo, correcciones con IA
- **Deduplicación:** Email/teléfono exacto O(1) + nombre Jaro-Winkler acotado
- **Telefonía:** E.164, detección WhatsApp, formatos AR/MX/ES
- **Exportación:** CSV, Excel, VCF, JSON, JSONL (fine-tuning), HTML (informes)
- **CRM Export:** Google Contacts, HubSpot, Salesforce, Zoho, Airtable
- **Dashboard:** Métricas en tiempo real, gráficos de calidad
- **UI:** Dark mode, tabla virtualizada, responsive, keyboard shortcuts
- **PWA:** Installable como app

## Proveedores de IA

Groq · OpenRouter · Together AI · Cerebras · DeepInfra · SambaNova · Mistral · DeepSeek · Gemini · Cloudflare · Hugging Face · Nebius

## Desarrollo

```bash
npm install --legacy-peer-deps
npm run dev       # http://localhost:8080
npm test          # 301 unit tests (Vitest)
npm run test:e2e  # 21 E2E tests (Playwright)
npm run build     # build producción
```

## CI/CD

Push a `main` ejecuta GitHub Actions automáticamente:

1. **Lint** — ESLint + TypeScript
2. **Unit tests** — 301 tests con Vitest
3. **Build** — Vite producción
4. **E2E tests** — 21 tests con Playwright (Chromium)
5. **Deploy** — GitHub Pages

Si cualquier paso falla, el deploy no se ejecuta.

## Deploy

Push a `main` → GitHub Pages (automático).

**Producción:** https://pabloeckert.github.io/MejoraContactos/

## Arquitectura

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   GitHub        │────▶│  GitHub Actions   │────▶│  GitHub Pages   │
│   (source)      │     │  (CI/CD + E2E)    │     │  (static host)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘

┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Browser        │────▶│  Supabase Edge   │────▶│  12 AI Providers│
│  (React SPA)    │     │  Functions (Deno)│     │  (rotación auto)│
│  (IndexedDB)    │     └──────────────────┘     └─────────────────┘
│  (Web Workers)  │
└─────────────────┘
```

## Documentación

- **`Documents/MASTERPLAN.md`** — Documento maestro completo
- **`Documents/CTO_AUDIT.md`** — Auditoría técnica del proyecto
- **`Documents/CTO_HANDOFF.md`** — Resumen de sesiones CTO
- **`CHANGELOG.md`** — Historial de cambios
- **`CONTRIBUTING.md`** — Guía de contribución
- **`SECURITY.md`** — Política de seguridad
