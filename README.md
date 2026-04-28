# MejoraContactos

[![Build & Deploy](https://github.com/pabloeckert/MejoraContactos/actions/workflows/deploy.yml/badge.svg)](https://github.com/pabloeckert/MejoraContactos/actions/workflows/deploy.yml)
[![Tests](https://img.shields.io/badge/tests-199%20passing-brightgreen)](https://github.com/pabloeckert/MejoraContactos/actions)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Live](https://img.shields.io/badge/live-demo-brightgreen)](https://util.mejoraok.com/mejoracontactos/)

Limpieza, deduplicación y unificación de contactos con IA.

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
- **Dashboard:** Métricas en tiempo real, gráficos de calidad
- **UI:** Dark mode, tabla virtualizada, responsive, keyboard shortcuts

## Proveedores de IA

Groq · OpenRouter · Together AI · Cerebras · DeepInfra · SambaNova · Mistral · DeepSeek · Gemini · Cloudflare · Hugging Face · Nebius

## Desarrollo

```bash
npm install --legacy-peer-deps
npm run dev       # http://localhost:8080
npm test          # 199 tests unitarios (Vitest)
npm run test:e2e  # 14 tests E2E (Playwright)
npm run build     # build producción
```

## CI/CD

Push a `main` ejecuta GitHub Actions automáticamente:

1. **Lint** — ESLint + TypeScript
2. **Unit tests** — 199 tests con Vitest
3. **Build** — Vite producción
4. **E2E tests** — 14 tests con Playwright (Chromium)
5. **Deploy** — SCP a Hostinger

Si cualquier paso falla, el deploy no se ejecuta.

## Deploy

Push a `main` → GitHub Actions → build → SCP a Hostinger (automático).

**Producción:** https://util.mejoraok.com/mejoracontactos/

## Documentación

Toda la documentación consolidada en un solo archivo:

- **`Documents/MASTERPLAN.md`** — Documento maestro (análisis 36 roles, plan por etapas, arquitectura, seguridad, todo)

Cuando digas **"documentar"**, se actualizará `MASTERPLAN.md` con el estado actual.
