# 📋 Data Retention Policy — MejoraContactos

**Última actualización:** 2026-04-29

## Principios

MejoraContactos es una herramienta privacy-first. Los datos del usuario NUNCA salen de su browser.

## Datos almacenados

| Dato | Ubicación | Retención | Eliminación |
|------|-----------|-----------|-------------|
| Contactos procesados | IndexedDB (browser) | Hasta que el usuario los borre o limpie el browser | Manual o limpieza de browser |
| Historial de snapshots | IndexedDB (browser) | Máximo 30 días o 10 entradas | Automático (TTL) |
| API keys | localStorage (browser, cifradas AES-GCM) | Hasta que el usuario las elimine | Manual en pestaña Config |
| Cookie consent | localStorage (browser) | Permanente | Manual (limpiar browser) |
| Onboarding state | localStorage (browser) | Permanente | Manual (limpiar browser) |
| Analytics events | localStorage (browser) | Máximo 100 eventos | Automático (circular) |

## Datos que NO se recopilan

- ❌ No se suben contactos a ningún servidor
- ❌ No se almacenan datos personales en Supabase
- ❌ No se usa Google Analytics ni tracking de terceros
- ❌ No se recopilan IPs (el rate limiting es anónimo)
- ❌ No se usan cookies de tracking

## Datos en servidor (Supabase Edge Functions)

Las Edge Functions procesan contactos temporalmente para limpieza con IA:
- Los datos se envían en el request body
- Se procesan en memoria
- Se devuelven en la respuesta
- **NO se almacenan en ninguna base de datos**
- Los logs del servidor no contienen datos de contactos

## Derechos del usuario

- **Acceder:** Los datos están en IndexedDB del usuario (DevTools → Application → IndexedDB)
- **Eliminar:** Borrar datos del browser o usar el botón "Limpiar" en la app
- **Exportar:** La app permite exportar en 6 formatos
- **Portabilidad:** Los datos son del usuario, siempre

## Contacto

Para consultas sobre privacidad: ver Privacy Policy en /privacy
