# MejoraContactos

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
npm run dev     # http://localhost:8080
npm test        # 174 tests unitarios
npm run build   # build producción
```

## Deploy

Push a `main` → GitHub Actions → build → SCP a Hostinger (automático).

**Producción:** https://util.mejoraok.com/mejoracontactos/

## Documentación

Toda la documentación consolidada en un solo archivo:

- **`Documents/MASTERPLAN.md`** — Documento maestro (análisis 36 roles, plan por etapas, arquitectura, seguridad, todo)

Cuando digas **"documentar"**, se actualizará `MASTERPLAN.md` con el estado actual.
