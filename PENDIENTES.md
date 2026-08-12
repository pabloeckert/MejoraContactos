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

## Resuelto — primera carga real desde Google Contacts (2026-08-12)

- [x] ~~Setup de Google Cloud Console~~ — `credentials.json` verificado
      (tipo "installed"/Desktop app correcto).
- [x] ~~Autorizar cada cuenta~~ — `token_pablo.json` y `token_sindy.json`
      generados, ambas cuentas autorizadas.
- [x] ~~importar-google pablo/sindy~~ — **36.103 raw_records reales**
      importados (18.135 Pablo + 17.968 Sindy). Nota para la próxima
      cuenta: el mensaje final "raw_records nuevos: 0" que a veces imprime
      el comando es ENGAÑOSO (parece un artefacto de este entorno donde el
      comando en background se ejecuta/reporta más de una vez) — **no
      confiar en ese número impreso, siempre verificar contra la base**
      (`SELECT COUNT(*) FROM raw_records`) antes de asumir que algo falló.
- [x] ~~normalizar / deduplicar / exportar~~ — corridos sobre los datos
      reales. Resultado: 36.102 normalizados (1 excluido, contacto técnico
      de Contacts+), **8.593 contactos finales**, 92.533 fusiones por
      regla, 46.766 separados, **658 en cola de revisión pendiente**.
      `Data/Salida/lista-maestra.xlsx` generado (815KB) y respaldado en el
      repo git local de `Data/` (commit `7ed78b7`).

## Bloqueante ACTUAL — necesita al usuario (no bloquea el resto)

- [ ] **API keys** (`GROQ_API_KEY`/`ANTHROPIC_API_KEY` en `.env`, seguía sin
      existir a esta fecha): sin esto, los 658 casos pendientes solo se
      resuelven a mano en el panel — no bloquea el resto del pipeline, pero
      cargarlas y volver a correr `deduplicar` UNA vez (antes de arrancar
      revisión manual) reduciría bastante esos 658.
- [ ] **Revisar los 658 pendientes**: a mano en el panel (`/revisar`,
      lote por patrón) o esperar a cargar las keys primero. Una vez que
      arranque la revisión manual, NO volver a correr `deduplicar` (pisa
      las decisiones humanas — ver ESPECIFICACION.md § dedup).

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
