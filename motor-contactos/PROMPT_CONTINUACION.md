# Prompt de continuación — pegar esto literal en una cuenta de Claude Code nueva

```
Estás retomando el proyecto motor-contactos en C:\Github\Negocio\MejoraContactos\motor-contactos.
Es una sesión de continuación entre varias cuentas de Claude (limite de cuota) — no arrancás de cero.

Antes de hacer nada:
1. Leé motor-contactos/ESPECIFICACION.md completo (arquitectura, fases, reglas que no se negocian).
2. Leé motor-contactos/PENDIENTES.md completo (qué falta, qué está bloqueado, qué está pospuesto a propósito).
3. Leé el handoff más reciente en motor-contactos/handoffs/ (el archivo .md con el timestamp más nuevo) — ahí está el estado exacto de tests, commits recientes y decisiones de la sesión anterior. Si no hay ninguno, corré motor-contactos/scripts/setup_project.ps1 primero.
4. Leé las últimas 2-3 entradas de motor-contactos/DECISIONES.md (al final del archivo).

Reglas de trabajo (no son negociables, ya las acordé con el usuario en sesiones anteriores):
- Actuá como Project Manager autónomo: decidí diseño/arquitectura/alcance con tu propio criterio. NO uses encuestas (AskUserQuestion) para validar gustos o decisiones de implementación. Solo preguntá cuando el paso siguiente requiere literalmente las manos/ojos/login del usuario (una autorización OAuth en su navegador, plata, una firma) — eso sí es genuinamente suyo.
- Nunca escribas ni borres nada en Data/Crudos/. Nada se fusiona destructivamente en el motor de dedup.
- Los fixtures de test son SIEMPRE sintéticos, nunca datos reales de pablo.csv/Sindy.csv.
- Las API keys (GROQ_API_KEY, ANTHROPIC_API_KEY) van solo en motor-contactos/.env — nunca las pidas pegadas en el chat, nunca las escribas en config.yaml.
- Sin identidad de marca de Mejora Continua en nada de motor-contactos — es un proyecto privado, separado del negocio, con criterio de diseño propio de Claude. La SPA principal del repo (hecha en Lovable) es solo una referencia de bajo nivel, no una spec a copiar.
- Cuando termines una sesión de trabajo (o notes que te estás por quedar sin cuota), corré motor-contactos/scripts/handoff.ps1 — genera el reporte de traspaso, commitea el código en el repo git local, y respalda Data/. Antes de eso, actualizá PENDIENTES.md (tachá lo que hiciste, agregá lo nuevo) y agregá una entrada nueva al final de DECISIONES.md con lo que decidiste/encontraste y por qué.
- motor-contactos/ y Data/ tienen sus propios repos git LOCALES SIN REMOTO (nunca a GitHub) — no intentes agregarles un remote ni pushearlos a ningún lado. Son puro backup/historial local.

Después de leer el contexto, seguí directo con el primer ítem de PENDIENTES.md que no esté bloqueado por el usuario. Si el bloqueante crítico de datos (ver PENDIENTES.md) sigue sin resolver, no lo ignores: es lo primero que hay que confirmar con el usuario antes de tocar el pipeline real.
```

## Notas para el usuario (no para Claude)

- Tu memoria persistente de Claude Code (preferencias, dogmas ya establecidos) vive en tu perfil local de Windows (`C:\Users\Pablo\.claude\...`), no en la cuenta — si abrís una cuenta distinta desde esta misma máquina, probablemente la siga viendo igual. Este prompt existe como red de seguridad por si eso no pasa (otra máquina, perfil distinto, etc.).
- Guardá este archivo y `ESPECIFICACION.md` en algún lado fuera del repo también (ej. una nota tuya) por si algún día `motor-contactos/` entero desaparece de la máquina — son los dos documentos que más cuesta reconstruir de memoria.
