# Pendientes — motor-contactos

Lista viva. Se tacha (no se borra) lo completado, se agrega lo nuevo. Es lo
primero que lee una cuenta de Claude nueva después de `ESPECIFICACION.md`.

## Resuelto — pivote de fuente de datos (2026-08-11)

- [x] ~~Confirmar destino de Data/Crudos/pablo.csv y Sindy.csv~~ — el
      usuario confirmó que borró la Papelera A PROPÓSITO y NO quiere
      regenerar los CSV. Decisión: el sistema se conecta directo a Google
      Contacts (People API) en vez de depender de exports manuales. Ver
      `google_contacts_source.py`, `GOOGLE_SETUP.md`, y § "Fuente de
      datos" en `ESPECIFICACION.md`. `Data/Crudos/` queda como carpeta
      secundaria para el día que haga falta importar algo que no vive en
      Google Contacts (PDF, capturas, etc.) — no es más el camino
      principal.

## Bloqueante crítico ACTUAL (necesita al usuario, no se puede resolver solo)

- [ ] **Setup de Google Cloud Console** (Paso 1 de `GOOGLE_SETUP.md`):
      crear proyecto, habilitar People API, configurar pantalla de
      consentimiento OAuth (modo Prueba, agregar los emails de Pablo y
      Sindy como usuarios de prueba), crear credenciales de "Aplicación de
      escritorio", descargar y guardar como `motor-contactos/
      credentials.json`. Requiere su login en Google Cloud Console — Claude
      no puede hacerlo.
- [ ] **Autorizar cada cuenta** (Paso 2 de `GOOGLE_SETUP.md`): correr
      `motor importar-google pablo` y `motor importar-google sindy` cada
      uno con su propio login de Google (abre el navegador, pide permiso
      de solo lectura). Genera `token_pablo.json`/`token_sindy.json`.
- [ ] Una vez autorizado: correr `normalizar` → `deduplicar` → `exportar`
      para reconstruir `staging.sqlite` desde cero con los datos reales.

## API keys (bloquea LLM-judge)

- [ ] Cargar `GROQ_API_KEY` y `ANTHROPIC_API_KEY` en `motor-contactos/.env`
      (copiar de `.env.example`) — el usuario lo hace directo en el
      archivo, nunca pegado en el chat.
- [ ] Una vez cargadas: correr `deduplicar` + `exportar` UNA sola vez antes
      de arrancar la revisión manual (ver ESPECIFICACION.md § dedup —
      correr de nuevo después pisa las decisiones humanas).

## Fase 4 — Google Contacts

- [ ] Probar `Sync.gs` (ya migrado a People API) contra una cuenta de
      Google de PRUEBA, con 2-3 contactos ficticios — requiere login de
      Google del usuario, Claude no puede hacerlo.
- [ ] Si funciona: recién ahí correr contra las cuentas reales de Pablo y
      Sindy.

## UI nueva (Fase 1 del plan "v2")

- [x] Scaffold del proyecto (Vite+React+TS+Tailwind, sin marca).
- [x] API JSON en el backend (`src/motor/api.py`).
- [x] Primera pantalla: tabla virtualizada + cola de revisión.
- [x] Rediseño visual (sidebar, stat cards, íconos propios, avatares).
- [x] Bug de conteo de pendientes corregido (filtrar por corrida más
      reciente).
- [ ] Confirmación visual del usuario en su propio navegador (`npm run dev`
      en `motor-contactos/ui/`, backend en `:5000` corriendo aparte) — la
      primera vez que se intentó, el backend se había caído entre pasos;
      falta repetir la verificación con el backend estable.
- [ ] Edición de teléfono/WhatsApp/email desde la UI nueva (el panel HTML
      clásico ya lo tiene — falta portarlo al `EditDialog.tsx` si no está
      ya, revisar antes de asumir que falta).

## Infraestructura de continuidad (este pedido)

- [x] `ESPECIFICACION.md`, `DECISIONES.md`, `PENDIENTES.md` creados.
- [x] Repos git locales sin remoto para `motor-contactos/` y `Data/`
      (backup contra borrados accidentales).
- [x] `scripts/setup_project.ps1` — corrido, verificado (163 tests en verde
      en esa corrida, antes del conector de Google).
- [x] `scripts/handoff.ps1` — corrido, verificado, bug de encoding de
      tildes encontrado y arreglado (`Get-Content -Encoding UTF8`).
- [ ] `PROMPT_CONTINUACION.md` — escrito, todavía no probado con una cuenta
      nueva de verdad.

## Pospuesto a propósito (no arrancar sin pedirlo explícitamente)

- Fase 5 (escaneo de directorios completos de la PC).
- Fase 2 "v2" (blocking por embeddings, formalizar bandas con Claude Agent
  SDK, agente de auto-mejora).
- Fase 3 "v2" (diseño multi-usuario/producto) — ya diseñada en el
  historial, no construida; el usuario pidió resetear el foco al MVP, así
  que esto queda fuera de alcance hasta que lo pida de nuevo.
