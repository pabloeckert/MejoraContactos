# motor-contactos — Trabajo realizado

Reporte de entrega. Última actualización: 2026-08-14.

## 1. Qué es

Sistema privado (Python + React, corre 100% local) que unifica, limpia y
deduplica los contactos reales de Pablo y Sindy — hoy desparramados entre
dos cuentas de Google con 15+ años de carga desprolija — en una única
lista maestra confiable, sincronizable de vuelta a Google Contacts.

## 2. Estado real de los datos (verificado en base, no estimado)

| Métrica | Valor |
|---|---|
| Contactos crudos importados (Pablo + Sindy) | 36.103 |
| Registros normalizados | 36.102 |
| **Contactos finales, deduplicados** | **8.541** |
| Casos pendientes de revisión manual | **0** |
| Contactos con cumpleaños | 951 |
| Contactos con foto | 5.012 |

Es decir: de 36.103 entradas crudas (muchas duplicadas, mal escritas, con
teléfonos/nombres/emails mezclados en el campo equivocado), el sistema
llegó solo a 8.541 personas reales distintas — sin que quede un solo caso
sin resolver.

## 3. Arquitectura del pipeline

1. **Fuente**: conexión directa a Google Contacts (People API) de ambas
   cuentas — ya no depende de exportar CSV a mano.
2. **Limpieza**: nombre, apellido, cargo y empresa se separan y corrigen
   con reglas calibradas contra los datos reales (teléfonos guardados
   como nombre, honoríficos, cargos concatenados, caracteres sueltos como
   `*` o `:::`, filas plantilla de Google/Mailchimp, contactos técnicos
   de apps como "Contacts+").
3. **Deduplicación en 3 bandas de confianza**:
   - Coincidencia exacta de teléfono/email → fusiona sola.
   - Sin ninguna señal en común → separa sola.
   - Banda dudosa → decide una IA (Groq y modelos gratis de OpenRouter
     primero, Anthropic pago solo si hace falta, para minimizar costo) y,
     si tampoco resuelve con confianza, va a revisión humana en lote.
   - Salvaguarda propia: un teléfono compartido por dos personas con
     nombres claramente distintos (línea familiar u oficina) nunca se
     fusiona en silencio.
4. **Aprendizaje**: cada decisión humana ajusta el umbral de ese patrón
   específico para casos futuros parecidos.
5. **Detección de anomalías**: alerta si un teléfono aparece en más de 5
   contactos finales distintos (señal de conmutador/error de carga). Hoy:
   0 anomalías.
6. **Nada se pierde ni se fusiona de forma irreversible**: cada corrida
   queda auditada, y se puede deshacer una fusión puntual o toda una
   corrida completa de una sola vez.

## 4. Interfaces

- **App de escritorio** (`Iniciar App.bat` / `App/MotorContactos.exe`):
  ventana nativa, sin terminal, con la identidad visual de Mejora
  Continua (tipografía, paleta y logo del manual de marca). Tabla
  completa con 12 columnas configurables, redimensionables y con filtro
  combinado por columna + búsqueda global instantánea; cola de revisión
  en lote; edición de cualquier campo por contacto; sección de sync a
  Google.
- **Panel clásico** (`Iniciar Panel.bat`): mismo motor, versión más
  simple en el navegador, como respaldo si la app de escritorio fallara.

## 5. Automatización

- **Aviso mensual autónomo** (día 30, 9:00): importa contactos nuevos de
  las dos cuentas de Google, normaliza, deduplica, reexporta y chequea
  anomalías — sin que nadie tenga que abrir nada.
- **Backup**: cada corrida grande queda respaldada en un repo git local
  (sin conexión a internet, solo historial en esta PC).

## 6. Integraciones construidas

| Integración | Estado |
|---|---|
| Google Contacts (import) | ✅ En vivo, funcionando |
| Sync de vuelta a Google Contacts (Apps Script) | ✅ Código listo — falta tu login una vez |
| "Otros contactos" (gente con la que hubo mail, nunca guardada) | ✅ Código listo — falta un login aparte (otro permiso) |
| HubSpot / Mailchimp / Brevo (CSV) | ✅ Reconocimiento automático de sus encabezados |
| MejoraWS (envío de WhatsApp) | ✅ Export en el formato exacto que necesita |
| PDF / capturas / Word / texto libre | ✅ Construido (capturas necesitan Tesseract-OCR instalado aparte) |

## 7. Calidad y verificación

- **195 tests automáticos**, todos en verde — cubren normalización,
  deduplicación, exportación, API y la interfaz.
- Cada feature de esta lista se probó contra la base real (no solo con
  datos de prueba) antes de darla por terminada.
- 6 bugs reales encontrados y corregidos en el camino (no hipotéticos —
  cada uno se detectó ejecutando el sistema real, no leyendo el código):
  límite oculto de 500 filas en la tabla, dos problemas de concurrencia
  (`sqlite3` entre hilos), resolución de configuración en el ejecutable
  empaquetado, un ítem de la encuesta original (Cumpleaños/Foto) que
  nunca se había capturado, y la cola de revisión sin info suficiente
  para decidir.

## 8. Lo único pendiente de vos

No hay nada más bloqueado técnicamente. Estos dos pasos necesitan tu
login real de Google — ningún sistema puede hacerlos por vos:

1. **Sync a Google Contacts**: 4 pasos con links directos en la sección
   "Sync a Google" de la app. Recomendado probar primero con un Sheet de
   prueba y 2-3 contactos ficticios.
2. **"Otros contactos" de Gmail** (opcional): un comando aparte,
   `importar-otros-contactos`, pide otro login con otro permiso.

## 9. Documentación completa

- `TUTORIAL.md` — paso a paso de uso.
- `PENDIENTES.md` / `DECISIONES.md` — historial técnico completo,
  sesión por sesión, con el motivo de cada decisión.
- `ESPECIFICACION.md` — arquitectura de referencia.
