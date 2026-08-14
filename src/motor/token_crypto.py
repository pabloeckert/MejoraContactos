"""Cifrado en reposo de los token_*.json de OAuth (Google) usando DPAPI de
Windows -- sin librerías nuevas, `ctypes` + `crypt32.dll` alcanzan.

Por qué: los token_*.json guardan un refresh_token que da acceso de
lectura (y, para "otros contactos", de lectura ampliada) a las cuentas
reales de Google de Pablo y Sindy. Antes de este cambio quedaban en texto
plano en la carpeta del proyecto -- cualquier proceso corriendo bajo este
mismo usuario de Windows podía leerlos. DPAPI cifra atado a la cuenta de
Windows actual (`CRYPTPROTECT_UI_FORBIDDEN` explícito, sin prompt) -- el
archivo cifrado no sirve si se copia a otra PC o a otro usuario de esta
misma PC.

Migración transparente: un token_*.json ya existente (de antes de este
cambio) está en texto plano. `leer_token_protegido()` intenta desproteger
primero; si el contenido no es un blob DPAPI válido, lo trata como JSON
plano tal cual ya estaba -- así ninguna cuenta ya autorizada pierde su
sesión. La próxima vez que se guarde (refresh normal de credenciales)
queda re-escrito ya cifrado."""

from __future__ import annotations

import ctypes
import ctypes.wintypes as wintypes
from pathlib import Path

_CRYPTPROTECT_UI_FORBIDDEN = 0x1


class _DATA_BLOB(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]


def _blob(datos: bytes) -> _DATA_BLOB:
    buffer = ctypes.create_string_buffer(datos, len(datos))
    return _DATA_BLOB(len(datos), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_char)))


def proteger(datos: bytes) -> bytes:
    """Cifra `datos` con DPAPI, atado al usuario de Windows actual."""
    entrada = _blob(datos)
    salida = _DATA_BLOB()
    ok = ctypes.windll.crypt32.CryptProtectData(
        ctypes.byref(entrada), None, None, None, None, _CRYPTPROTECT_UI_FORBIDDEN, ctypes.byref(salida)
    )
    if not ok:
        raise OSError("CryptProtectData falló: " + str(ctypes.GetLastError()))
    try:
        return ctypes.string_at(salida.pbData, salida.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(salida.pbData)


def desproteger(datos: bytes) -> bytes:
    """Descifra un blob generado por `proteger()`. Levanta OSError si
    `datos` no es un blob DPAPI válido (ver leer_token_protegido para el
    fallback a texto plano de tokens viejos)."""
    entrada = _blob(datos)
    salida = _DATA_BLOB()
    ok = ctypes.windll.crypt32.CryptUnprotectData(
        ctypes.byref(entrada), None, None, None, None, _CRYPTPROTECT_UI_FORBIDDEN, ctypes.byref(salida)
    )
    if not ok:
        raise OSError("CryptUnprotectData falló: " + str(ctypes.GetLastError()))
    try:
        return ctypes.string_at(salida.pbData, salida.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(salida.pbData)


def leer_token_protegido(ruta: Path) -> str:
    """Lee un token_*.json -- cifrado (caso normal) o texto plano (token
    de antes de este cambio, todavía no migrado). Devuelve el JSON como
    string, listo para json.loads()/Credentials.from_authorized_user_info."""
    crudo = ruta.read_bytes()
    try:
        return desproteger(crudo).decode("utf-8")
    except OSError:
        # No es un blob DPAPI -- token viejo en texto plano. Se devuelve
        # tal cual; escribir_token_protegido() lo re-guarda ya cifrado
        # la próxima vez que se refresque.
        return crudo.decode("utf-8")


def escribir_token_protegido(ruta: Path, contenido_json: str) -> None:
    ruta.write_bytes(proteger(contenido_json.encode("utf-8")))
