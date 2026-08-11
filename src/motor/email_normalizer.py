"""Normalización y corrección de emails.

Mismo supuesto de scope que phone_normalizer: recibe un VALOR YA
IDENTIFICADO como campo/substring de email, no hace minería sobre prosa
arbitraria (eso es del extractor de texto libre, pieza futura).

Orden de las transformaciones (importa: cada paso asume que el anterior ya
se aplicó):
1. minúsculas
2. sacar prefijo "mailto:"
3. convertir "arroba"/"(at)"/"[at]" a "@"
4. sacar envoltorios y puntuación de borde (<> [] () "" '' , ; : .)
5. sacar espacios internos
6. transliterar tildes/ñ
7. colapsar "@" y "." duplicados
8. si el dominio no tiene punto, reconstruirlo contra TLDs conocidos
   (gmailcom -> gmail.com)
9. corregir TLD mal tipeado por tabla (con/cmo/vom -> com)
10. si el dominio no matchea ninguno de los anteriores, corregirlo por
    distancia de Levenshtein contra la lista de dominios frecuentes de
    config.yaml (candado: solo si hay un único dominio a distancia mínima
    y esa distancia está dentro del umbral configurado)

Lo que no se puede arreglar queda con normalizado=None y flag 'invalido' —
nunca se descarta, se conserva el original para la tabla de descartes.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from rapidfuzz.distance import Levenshtein

from motor.config import EmailConfig

_SEPARADORES_RE = re.compile(r":::|[;,/|]|\s+y\s+", re.IGNORECASE)

_MAILTO_RE = re.compile(r"^mailto:\s*", re.IGNORECASE)
_ARROBA_TEXTO_RE = re.compile(r"\s*(?:\(\s*at\s*\)|\[\s*at\s*\]|\barroba\b)\s*", re.IGNORECASE)

_BORDE_CHARS = set("<>[](){}\"'`,;: \t\n\r")

_TRANSLITERACION = str.maketrans(
    {
        "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ü": "u", "ñ": "n",
    }
)

# TLDs sin punto -> forma con punto, para reconstruir dominios como
# "gmailcom". Se prueban de más largo a más corto para no cortar "com.ar"
# a la mitad como si fuera solo "ar".
_TLDS_RECONSTRUCCION = (
    ("comar", "com.ar"),
    ("netar", "net.ar"),
    ("orgar", "org.ar"),
    ("gobar", "gob.ar"),
    ("eduar", "edu.ar"),
    ("com", "com"),
    ("net", "net"),
    ("org", "org"),
    ("info", "info"),
    ("biz", "biz"),
    ("ar", "ar"),
    ("edu", "edu"),
    ("gov", "gov"),
)

# Errores de tipeo frecuentes del TLD final (last label del dominio).
_TLD_TYPOS = {
    "con": "com",
    "cmo": "com",
    "vom": "com",
    "ocm": "com",
    "comm": "com",
    "c0m": "com",
    "xom": "com",
    "coom": "com",
}

# Proveedores reales, globales, que quedarían a distancia 1-2 de algún
# dominio de config.yaml (mail.com/ymail.com de gmail.com, etc.) y por eso
# NUNCA se corrigen por Levenshtein aunque "parezcan" un typo — corregirlos
# rompería una dirección que funciona de verdad. Se encontró corriendo el
# normalizador contra pablo.csv/Sindy.csv reales.
_DOMINIOS_PROTEGIDOS = frozenset(
    {
        "mail.com",
        "ymail.com",
        "rocketmail.com",
        "aol.com",
        "protonmail.com",
        "zoho.com",
        "gmx.com",
        "gmx.net",
        "msn.com",
        "me.com",
        "yandex.com",
        "mail.ru",
        "fastmail.com",
        "hey.com",
    }
)

# El local-part de un email admite estos caracteres sin comillas (RFC
# 5321/5322): además de alfanumérico y punto, toda esta puntuación especial
# es válida y puede ir al final (ej. "usuario_@dominio.com" es legal). Solo
# el punto no puede ir al principio/final ni duplicarse (ya se colapsa antes).
_LOCAL_CHARS_RE = re.compile(r"[a-z0-9.!#$%&'*+/=?^_`{|}~-]+")
_DOMINIO_VALIDO_RE = re.compile(
    r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$"
)


@dataclass(frozen=True)
class EmailResult:
    original: str
    normalizado: str | None
    valido: bool
    flags: list[str] = field(default_factory=list)
    correcciones: list[str] = field(default_factory=list)


def normalizar_campo_email(raw: str, config: EmailConfig) -> list[EmailResult]:
    """Punto de entrada público: un campo puede traer más de un email."""
    candidatos = dividir_campo_email(raw)
    resultados = [normalizar_email_unico(c, config) for c in candidatos]
    return _deduplicar(resultados)


def _deduplicar(resultados: list[EmailResult]) -> list[EmailResult]:
    vistos: set[str] = set()
    finales: list[EmailResult] = []
    for r in resultados:
        if r.normalizado is not None:
            if r.normalizado in vistos:
                continue
            vistos.add(r.normalizado)
        finales.append(r)
    return finales


def dividir_campo_email(raw: str) -> list[str]:
    if not raw or not raw.strip():
        return []
    return [p.strip() for p in _SEPARADORES_RE.split(raw) if p.strip()]


def normalizar_email_unico(raw: str, config: EmailConfig) -> EmailResult:
    correcciones: list[str] = []
    s = raw.strip().lower()

    sin_mailto = _MAILTO_RE.sub("", s)
    if sin_mailto != s:
        correcciones.append("mailto_removido")
    s = sin_mailto

    con_arroba = _ARROBA_TEXTO_RE.sub("@", s)
    if con_arroba != s:
        correcciones.append("arroba_convertida")
    s = con_arroba

    s = _limpiar_bordes(s)

    sin_espacios = re.sub(r"\s+", "", s)
    if sin_espacios != s:
        correcciones.append("espacios_removidos")
    s = sin_espacios

    transliterado = s.translate(_TRANSLITERACION)
    if transliterado != s:
        correcciones.append("tildes_transliteradas")
    s = transliterado

    s = _limpiar_bordes(s)  # por si el translate/strip de espacios expuso basura nueva en el borde

    colapsado = re.sub(r"@{2,}", "@", s)
    if colapsado != s:
        correcciones.append("arroba_duplicada_colapsada")
    s = colapsado

    colapsado = re.sub(r"\.{2,}", ".", s)
    if colapsado != s:
        correcciones.append("puntos_duplicados_colapsados")
    s = colapsado

    if not s or s.count("@") != 1:
        return EmailResult(raw, None, False, ["invalido"], correcciones)

    local, dominio = s.split("@")
    if not local or not dominio:
        return EmailResult(raw, None, False, ["invalido"], correcciones)

    if not _LOCAL_CHARS_RE.fullmatch(local) or local[0] == "." or local[-1] == ".":
        return EmailResult(raw, None, False, ["invalido"], correcciones)

    dominio, correccion_dominio = _corregir_dominio(dominio, config)
    if correccion_dominio:
        correcciones.append(correccion_dominio)

    if not _DOMINIO_VALIDO_RE.fullmatch(dominio):
        return EmailResult(raw, None, False, ["invalido"], correcciones)

    candidato = f"{local}@{dominio}"

    flags = ["corregido"] if correcciones else []
    return EmailResult(raw, candidato, True, flags, correcciones)


def _limpiar_bordes(s: str) -> str:
    while s and (s[0] in _BORDE_CHARS or s[-1] in _BORDE_CHARS):
        if s[0] in _BORDE_CHARS:
            s = s[1:]
        if s and s[-1] in _BORDE_CHARS:
            s = s[:-1]
    return s


def _corregir_dominio(dominio: str, config: EmailConfig) -> tuple[str, str | None]:
    if "." not in dominio:
        reconstruido = _reconstruir_punto_faltante(dominio)
        if reconstruido is not None:
            return reconstruido, f"dominio_reconstruido:{dominio}->{reconstruido}"
        return dominio, None  # sin punto y sin TLD reconocible -> queda para que falle la validación final

    partes = dominio.split(".")
    tld = partes[-1]
    if tld in _TLD_TYPOS:
        corregido = tld_corregido = _TLD_TYPOS[tld]
        nuevo_dominio = ".".join(partes[:-1] + [tld_corregido])
        return nuevo_dominio, f"tld_corregido:{tld}->{corregido}"

    corregido_por_distancia = _corregir_por_levenshtein(dominio, config)
    if corregido_por_distancia is not None:
        return corregido_por_distancia, f"dominio_corregido:{dominio}->{corregido_por_distancia}"

    return dominio, None


def _reconstruir_punto_faltante(dominio: str) -> str | None:
    for sufijo, sufijo_con_punto in _TLDS_RECONSTRUCCION:
        if dominio.endswith(sufijo) and len(dominio) > len(sufijo):
            nombre = dominio[: -len(sufijo)]
            return f"{nombre}.{sufijo_con_punto}"
    return None


def _corregir_por_levenshtein(dominio: str, config: EmailConfig) -> str | None:
    if dominio in config.dominios_frecuentes or dominio in _DOMINIOS_PROTEGIDOS:
        return None

    # Umbral efectivo escalado por longitud: en un dominio corto, una
    # distancia de 2 es un cambio demasiado grande (25-30% del string) y
    # empieza a "corregir" dominios reales que solo se parecen por
    # casualidad (ej. "lge.com"/"gire.com" -> "live.com" en datos reales).
    # A partir de 9 caracteres se usa el umbral configurado tal cual.
    umbral_efectivo = min(config.umbral_levenshtein, 1) if len(dominio) <= 8 else config.umbral_levenshtein

    mejor_dominio: str | None = None
    mejor_distancia = umbral_efectivo + 1
    empate = False
    for conocido in config.dominios_frecuentes:
        distancia = Levenshtein.distance(dominio, conocido, score_cutoff=umbral_efectivo)
        if distancia > umbral_efectivo:
            continue
        if distancia < mejor_distancia:
            mejor_distancia = distancia
            mejor_dominio = conocido
            empate = False
        elif distancia == mejor_distancia:
            empate = True

    if mejor_dominio is not None and not empate:
        return mejor_dominio
    return None
