# Pendientes — motor-contactos

Lista viva. Se tacha (no se borra) lo completado, se agrega lo nuevo. Es lo
primero que lee una cuenta de Claude nueva después de `ESPECIFICACION.md`.

## Bloqueante crítico (necesita al usuario, no se puede resolver solo)

- [ ] **Confirmar destino de `Data/Crudos/pablo.csv` y `Sindy.csv`**: el
      usuario no confirmó todavía si tiene otra copia (ej. re-exportable
      desde Google Contacts si aún tiene acceso a esas cuentas) o si acepta
      la pérdida y arranca con un export nuevo. **No correr el pipeline
      contra `motor-contactos/config.yaml` real hasta tener esto resuelto**
      — conectar a un `staging.sqlite` inexistente crea uno vacío
      automáticamente y complica cualquier intento de recuperación futura.
- [ ] Una vez resuelto lo anterior: recrear `Data/Crudos/` con los archivos
      fuente (los que el usuario provea) y correr `motor run` de punta a
      punta para reconstruir `staging.sqlite`.

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
- [ ] `scripts/setup_project.ps1` — verificar que corre limpio.
- [ ] `scripts/handoff.ps1` — verificar que genera un reporte usable.
- [ ] `PROMPT_CONTINUACION.md` — verificar que es autosuficiente (una
      cuenta nueva, sin memoria previa, lo puede seguir literal).

## Pospuesto a propósito (no arrancar sin pedirlo explícitamente)

- Fase 5 (escaneo de directorios completos de la PC).
- Fase 2 "v2" (blocking por embeddings, formalizar bandas con Claude Agent
  SDK, agente de auto-mejora).
- Fase 3 "v2" (diseño multi-usuario/producto) — ya diseñada en el
  historial, no construida; el usuario pidió resetear el foco al MVP, así
  que esto queda fuera de alcance hasta que lo pida de nuevo.
