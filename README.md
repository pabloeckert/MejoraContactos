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
- **UI:** Dark mode, tabla virtualizada, responsive

## Proveedores de IA

Groq · OpenRouter · Together AI · Cerebras · DeepInfra · SambaNova · Mistral · DeepSeek · Gemini · Cloudflare · Hugging Face · Nebius

## Desarrollo

```bash
npm install
npm run dev     # http://localhost:8080
npm test        # tests unitarios
npm run build   # build producción
```

## Deploy

Push a `main` → GitHub Actions → build → SCP a Hostinger (automático).

**Producción:** https://mejoraok.com/util/mejoracontactos/

## Documentación

Ver `documents/DOCS.md` para documentación consolidada, arquitectura y plan de trabajo.
