# MejoraContactos

Aplicación web **autónoma y 100% local en TypeScript** para limpiar, normalizar (E.164 y email), deduplicar y exportar listas de contactos.

**Una entrada · Un proceso · Una salida · Sin conexiones externas.**

## Flujo único

1. **Entrada:** Carga local de archivos o carpetas (`CSV`, `Excel .xlsx/.xls`, `VCF`, `JSON`, `TXT`).
2. **Proceso:** Mapeo automático de columnas, limpieza por reglas en Web Worker, validación telefónica E.164 (`libphonenumber-js`) y deduplicación offline con persistencia local en IndexedDB (`idb`).
3. **Salida:** Tabla virtualizada editable y exportación a `CSV`, `Excel (.xlsx)`, `VCF`, `JSON` e `Informe HTML`.

## Comandos

```bash
npm install
npm run dev      # Servidor local Vite
npm run lint     # ESLint
npm test         # Vitest
npm run build    # Build producción
```
