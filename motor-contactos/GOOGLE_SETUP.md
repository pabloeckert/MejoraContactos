# Conectar Google Contacts — lo único que tenés que hacer vos

El sistema ahora lee tus contactos (y los de Sindy) directo desde Google
Contacts en vez de necesitar un CSV exportado a mano. Para eso hace falta
un client OAuth de Google Cloud Console — Claude no puede crear esto por
vos (requiere tu login y tu consentimiento explícito). Son 2 pasos, uno se
hace una sola vez, el otro una vez por cuenta.

## Paso 1 — Crear el client OAuth (una sola vez)

1. Andá a [Google Cloud Console](https://console.cloud.google.com/) con
   cualquiera de tus cuentas de Google (da igual cuál, esto es solo el
   "carnet" de la aplicación, no accede a contactos todavía).
2. Creá un proyecto nuevo (o usá uno que ya tengas) — nombre sugerido:
   "motor-contactos".
3. En el buscador de arriba, escribí **"People API"** → abrila → **Habilitar**.
4. Menú izquierdo → **APIs y servicios** → **Pantalla de consentimiento
   OAuth**:
   - Tipo de usuario: **Externo** (a menos que tengas Google Workspace).
   - Nombre de la app: "motor-contactos" (o lo que quieras).
   - Email de soporte y de contacto: el tuyo.
   - En "Usuarios de prueba", agregá tu email y el de Sindy — mientras la
     app esté en modo "Prueba" (no publicada), solo esas cuentas pueden
     autorizarla, lo cual está perfecto para este uso privado.
5. Menú izquierdo → **APIs y servicios** → **Credenciales** → **Crear
   credenciales** → **ID de cliente de OAuth**:
   - Tipo de aplicación: **Aplicación de escritorio** ("Desktop app").
   - Nombre: lo que quieras.
   - Crear → te va a dar la opción de **Descargar JSON**.
6. Guardá ese archivo descargado como:
   `C:\Github\Negocio\MejoraContactos\motor-contactos\credentials.json`
   (el nombre tiene que ser exactamente ese). Este archivo NO se sube a
   git — ya está en `.gitignore`.

Con esto alcanza para las dos cuentas — es el mismo "carnet" para ambas,
lo que cambia en el paso 2 es el login de cada una.

## Paso 2 — Autorizar cada cuenta (una vez por cuenta)

Desde una terminal en `motor-contactos/`:

```bash
PYTHONPATH=src .venv/Scripts/python.exe -m motor.cli importar-google pablo
```

Se te va a abrir el navegador pidiendo que elijas la cuenta de Google
(elegí la tuya) y que aceptes el permiso — va a decir algo como *"motor-
contactos quiere ver tus contactos"* (permiso de **solo lectura**, nunca
escribe ni borra nada en tu Google Contacts real). Si Google avisa "esta
app no está verificada", es porque está en modo de prueba (paso 1) — clic
en "Avanzado" → "Ir a motor-contactos (no seguro)". Es tu propia app, no
hay ningún riesgo ajeno.

Después de aceptar, queda guardado un `token_pablo.json` en
`motor-contactos/` (tampoco se sube a git) y el comando trae tus
contactos. Corridas futuras no te van a volver a pedir login.

Repetí exactamente lo mismo para Sindy, con su propio login:

```bash
PYTHONPATH=src .venv/Scripts/python.exe -m motor.cli importar-google sindy
```

(Ella tiene que estar logueada en su cuenta de Google en el navegador que
se abra, o elegir su cuenta si aparece un selector.)

## Después de esto

Una vez importados los contactos de ambas cuentas, seguís con el pipeline
de siempre:

```bash
PYTHONPATH=src .venv/Scripts/python.exe -m motor.cli normalizar
PYTHONPATH=src .venv/Scripts/python.exe -m motor.cli deduplicar
PYTHONPATH=src .venv/Scripts/python.exe -m motor.cli exportar
```

O desde el panel web (`motor.cli panel`), los botones de siempre siguen
funcionando igual — solo que ahora el punto de partida es
`importar-google` en vez de copiar CSV a `Data/Crudos/`.

## Opcional — "Otros contactos" (gente con la que hubo mail, nunca guardada)

Google guarda aparte a la gente con la que tuviste intercambio de mail en
Gmail pero nunca agregaste como contacto explícito ("otros contactos").
Es un pedido de permiso DISTINTO al del Paso 2 (otro scope: `contacts.
other.readonly`) — no lo pide `importar-google`, hace falta correr esto
aparte, una vez por cuenta:

```bash
PYTHONPATH=src .venv/Scripts/python.exe -m motor.cli importar-otros-contactos pablo
PYTHONPATH=src .venv/Scripts/python.exe -m motor.cli importar-otros-contactos sindy
```

Mismo mecanismo (navegador, login, "app no verificada" → Avanzado). Si tu
pantalla de consentimiento OAuth (Paso 1) está en modo "Prueba" con solo
People API habilitada, este scope nuevo debería pedirse solo sin nada
adicional — si Google tira un error de "acceso bloqueado" al probarlo,
volvé a Pantalla de consentimiento OAuth → Agregar o quitar ámbitos → buscá
"otherContacts" → agregalo.

Esta gente entra con confianza baja a propósito (nunca la guardaste vos,
puede ser ruido — una lista de mail, un proveedor de una sola compra) — el
motor de dedup no la fusiona en silencio contra un contacto ya verificado,
sin importar qué tan parecido dé el puntaje; siempre pasa por la cola de
revisión primero.
