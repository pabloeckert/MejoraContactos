# Reporte de auditoría — MejoraContactos

Fecha: 2026-09-10
Contexto: auditoría de higiene/calidad de C:\Github, continuación de una sesión anterior cortada por rate limit (ese intento había dejado el lint verificado; este reporte cubre el resto).

**Regla dura respetada: no se hizo ningún `git commit`, `git add` ni `git push`. Todo cambio queda en el working tree.**

## Estado de git al arrancar

- Rama `main`, sincronizada con `origin/main`.
- Único cambio en el working tree: `package-lock.json` modificado (de una `npm install`/`audit fix` de la sesión anterior o de esta), sin cambios en `package.json`. No se revirtió, se dejó así, sin commitear.
- `git log -10`: trabajo reciente normal (tests, docs, fixes de deploy, modo demo). Nada llamativo.

## Archivos sensibles trackeados

- `git ls-files` no muestra ningún `.env`, `.key`, `credentials*` ni `.pem` trackeado (solo `.env.example` x2, legítimos).
- `test-contacts.csv` (raíz): verificado el contenido, son datos claramente ficticios de prueba (Juan Pérez García, María López, etc., con duplicados intencionales para testear el dedup). Sin datos reales.
- `motor-contactos/`: carpeta de 769MB en disco (incluye su propio venv/artefactos sin trackear), pero solo 154 archivos están efectivamente trackeados en el repo raíz (código, no datos). Tiene además su propio repo git local independiente (`motor-contactos/.git`, branch `master`, sin remoto, working tree limpio) para el flujo de handoff entre sesiones, esto es intencional y está documentado en el `.gitignore` del repo raíz; no se tocó.
- Carpeta `Data/` (mencionada en `.gitignore` como contenedora de contactos reales de terceros) está correctamente excluida, no se encontró trackeada.

## Lint / typecheck / build / tests

- `npm run lint`: **0 errores, 5 warnings**, todos el mismo patrón pre-existente de shadcn/ui (`react-refresh/only-export-components` en `badge.tsx`, `button.tsx`, `sonner.tsx`, `i18n.tsx`, `Blog.tsx`). No autofixable ni bug real; es el patrón estándar de shadcn de exportar constantes junto a componentes.
- `npx tsc --noEmit`: **sin errores.**
- `npm run build`: **OK**, build de producción completo en ~33s, bundle principal dentro de los límites documentados (`xlsx` es el chunk más pesado, 428KB, ya lazy-loaded según CLAUDE.md).
- `npm test` (Vitest): **361/361 tests pasando**, 25 archivos de test, coincide exactamente con lo que dice el README (`361 passing`). Sin necesidad de tocar nada.
- No se corrió `test:e2e` (Playwright) por tiempo/alcance, no se detectó ninguna señal de que esté roto; queda como no verificado en esta pasada.

## npm audit

8 vulnerabilidades (6 moderate, 2 high). `npm audit fix` (sin `--force`) no resuelve nada porque las 4 causas raíz requieren bump mayor/breaking, ninguna tiene fix no-breaking disponible:

| Paquete | Severidad | Fix disponible | Nota |
|---|---|---|---|
| `@vitest/mocker` (vía vitest/@vitest/coverage-v8) | moderate | vitest 5.0.0 (breaking) | Path traversal en mocks, solo devDependency, no afecta producción |
| `esbuild` (vía vite) | moderate | vite 8.3.0 (breaking) | Dev-server only, no afecta build de producción |
| `react-router` / `react-router-dom` | moderate | react-router-dom 7.18.3 (breaking, v6→v7) | Open redirect / deserialización, la app usa v6, bump de major |
| `xlsx` (SheetJS) | high | sin fix disponible upstream | Prototype pollution + ReDoS, conocido en el ecosistema, sin parche |

No se aplicó ningún bump mayor (fuera del alcance de "no-breaking"). Todos quedan documentados como pendiente de decisión humana.

## Basura / duplicados

- `dist/` no está trackeado (correctamente ignorado).
- No se encontraron `.zip` sueltos en la raíz ni duplicados evidentes.
- `.gitignore` es prolijo y ya documenta explícitamente los casos raros del repo (motor-contactos con su propio `.git`, `Data/` con contactos reales, `MejoraContactos.md` con transcripciones que pueden tener datos personales).

## Documentación

- README.md: stack, funcionalidades, comandos y conteo de tests (361) consistentes con el código actual.
- `CHANGELOG.md`: la entrada más reciente está etiquetada `[12.9.5]` pero el texto dice "package.json: Version 12.8.0 → 12.9.0", el número de versión del encabezado no coincide con lo que describe el changelog (`package.json` real está en `12.9.0`). Inconsistencia menor de rotulado, no afecta funcionalidad, mencionar si se resincroniza el changelog en algún momento.
- **`CLAUDE.md`, inconsistencia real encontrada:** la sección "motor-contactos — status handoff" dice textualmente que `motor-contactos/` está *"gitignored/untracked on purpose"*, pero el propio `.gitignore` del repo (con un comentario fechado 2026-08-15) documenta que el código de `motor-contactos/` se fusionó (trackeó) al repo raíz, y en efecto `git ls-files` confirma 154 archivos de `motor-contactos/` trackeados hoy. La frase de CLAUDE.md quedó desactualizada respecto a esa decisión posterior. Recomendación: corregir esa línea en CLAUDE.md para que diga que el código está trackeado y solo los artefactos pesados (venv, caches, `Data/`) están ignorados, el repo git local interno (`motor-contactos/.git`) sí sigue existiendo aparte, eso sí sigue siendo correcto.
- `SECURITY.md`: tabla de versiones soportadas dice "10.x Active support", pero el proyecto ya está en 12.9.x, desactualizada pero sin impacto de seguridad real (es un proyecto de una sola versión viva).

## Pendiente de decisión humana

1. Bumps mayores para cerrar las 3 vulnerabilidades moderate con fix disponible (vitest 5, vite 8, react-router-dom 7), todos breaking, requieren testing manual.
2. `xlsx`/SheetJS: no tiene fix upstream; evaluar reemplazo por otra librería (ej. `exceljs`) si la vulnerabilidad high preocupa, o aceptar el riesgo (uso es client-side, sobre archivos que el propio usuario sube).
3. Corregir la sección de CLAUDE.md sobre `motor-contactos/` (ver arriba).
4. Actualizar tabla de versiones soportadas en SECURITY.md.
5. Opcional: correr `test:e2e` (Playwright) para verificar los 21 tests E2E, no se corrió en esta pasada.

## Conclusión

Repo sano. Sin secretos ni datos reales trackeados, lint/typecheck/build/tests todos en verde, sin basura evidente. Único trabajo pendiente real es de dependencias (bumps mayores, fuera de alcance de "no-breaking") y dos correcciones menores de documentación.
