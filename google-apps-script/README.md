# Fase 4 — Sync a Google Contacts

`Sync.gs` sincroniza la lista maestra (un Google Sheet, importado desde
`Data/Salida/lista-maestra.xlsx`) con Google Contacts. Corre **una copia
por cuenta** (Pablo, Sindy) — cada una autorizada con su propio login, cada
una escribiendo en su propia agenda.

Esto es código, no un servicio que Claude pueda desplegar por vos: los
pasos de abajo requieren tu navegador y tu login de Google, así que son
los únicos que te tocan a vos.

## Paso a paso (una vez por cuenta)

1. **Generar la lista maestra**: `python -m motor.cli panel` → botón
   "Exportar a Excel" (o `python -m motor.cli exportar`). Queda en
   `Data/Salida/lista-maestra.xlsx`.
2. **Crear el Google Sheet compartido** (una sola vez, no por cuenta):
   Google Sheets → Hoja de cálculo en blanco → Archivo → Importar → Subir
   → `lista-maestra.xlsx` → **"Reemplazar hoja actual"**. La pestaña
   queda llamada "Lista maestra" automáticamente (así sale del export).
3. **Compartir** ese Sheet con la otra cuenta, permiso Editor.
4. **En cada cuenta** (Pablo y Sindy, cada uno con su propio login):
   Extensiones → Apps Script → pegar `Sync.gs` completo → Guardar.
5. **Habilitar el servicio People API** (una vez por cuenta, obligatorio):
   en el editor de Apps Script, ícono "Servicios" (+) en el panel
   izquierdo → buscar "People API" → Agregar. Sin este paso el script no
   compila (el objeto `People` no existe todavía en tu proyecto).
6. **Probar primero con datos de prueba**: antes de correrlo contra la
   lista real, probá con un Sheet aparte con 2-3 filas ficticias, para
   confirmar que la migración a People API (ver abajo) funciona bien en tu
   cuenta antes de tocar tus contactos reales.
7. Correr `sincronizarContactos` una vez a mano (▶) para autorizar los
   permisos. Si Google avisa "app no verificada", es tu propio script:
   Avanzado → Ir a [nombre del proyecto] (no seguro).
8. **(Opcional, recomendado)** Activar un disparador automático: ícono de
   reloj a la izquierda → Añadir disparador → función
   `sincronizarContactos` → Basado en tiempo → cada día.

## Cómo funciona

- Usa el servicio avanzado **People API** de Apps Script. La versión
  anterior de este script usaba `ContactsApp` (el servicio nativo legacy)
  — Google lo deprecó el 16/12/2022 y lo **dio de baja el 31/01/2025**, así
  que ya no funciona. La People API es el reemplazo directo que documenta
  Google ([guía de migración](https://developers.google.com/apps-script/migration/contacts-people)).
  El permiso que ya tenías otorgado con el scope legacy
  (`google.com/m8/feeds`) sigue siendo válido como alias de `contacts`, así
  que no hace falta repetir ninguna autorización previa — solo agregar el
  servicio nuevo (paso 5 de arriba).
- Es **idempotente**: la primera corrida crea los contactos y anota el ID
  de Google (`resourceName`, ej. `people/c1234567890`) en una columna
  nueva ("Google Contact ID") directamente en el Sheet; las corridas
  siguientes actualizan esos mismos contactos en vez de duplicarlos.
- Si Google devuelve error de cuota (429), el script reintenta esa fila
  puntual con espera creciente (2s, 4s, 8s, 16s) antes de darse por
  vencido y loguear el error — no frena el resto de la corrida.
- Filas sin nombre, apellido, WhatsApp ni email se saltan (no tiene
  sentido crear un contacto vacío).
- Si borrás un contacto a mano en Google Contacts, la próxima
  sincronización lo vuelve a crear (no hay forma de que el script sepa
  que lo borraste a propósito — si no querés que un contacto puntual se
  siga sincronizando, borrá su fila del Sheet).

## Qué NO hace (todavía)

- No sincroniza cambios en sentido inverso (si editás un contacto directo
  en Google Contacts, esos cambios no vuelven al Sheet ni a
  `staging.sqlite`).
- No borra contactos en Google Contacts cuando se borra la fila del Sheet
  — solo crea/actualiza. Un borrado accidental de fila no borra un
  contacto real, a propósito (mismo criterio de "nunca destructivo" que
  el resto del motor).
- No usa `syncToken` para sync incremental real (la People API lo
  soporta) ni los endpoints de batch (`batchCreateContacts`/
  `batchUpdateContacts`, hasta 200 contactos por llamada) — con ~10.000
  filas, correrlo fila por fila puede tardar bastante y acercarse a
  límites de cuota por minuto. El reintento con espera creciente lo hace
  tolerante a eso, pero no lo hace rápido. Si en el futuro esto se vuelve
  un problema real de tiempo, migrar a los endpoints de batch es la
  mejora natural — no se hizo ahora para no sobre-construir antes de
  confirmar que el script anda.
