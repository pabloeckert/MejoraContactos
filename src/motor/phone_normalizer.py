"""Normalización de teléfonos a formato E.164 estilo WhatsApp.

Supuesto de scope: este módulo recibe un VALOR YA IDENTIFICADO como campo o
substring de teléfono (p. ej. el contenido de una columna "Phone", o un
substring que el extractor de texto libre ya reconoció como teléfono por
regex). No hace minería de teléfonos dentro de prosa arbitraria — eso es
responsabilidad del extractor (pieza futura), que le pasará a este módulo
cada candidato que encuentre.

Reglas de Argentina (ver area_codes_ar.py para la tabla de códigos):
- Formato de salida target: +549 + 10 dígitos (área + abonado) para
  celulares, que es el formato que espera WhatsApp.
- El "0" de larga distancia y el "15" de móvil se eliminan; el "15" viene
  DESPUÉS del código de área, por eso hace falta la tabla para ubicarlo.
- Números de 6 a 8 dígitos sin código de área se completan con un código de
  área configurable.
- Números extranjeros se detectan y validan con la librería `phonenumbers`
  (soporta prácticamente cualquier país, no solo la lista mínima pedida).
- Un campo puede traer varios números pegados o separados por distintos
  caracteres; ambos casos se resuelven antes de normalizar cada uno.

Ante ambigüedad (¿es celular o fijo?) sin ninguna pista, se asume lo que
diga `config.asumir_movil_por_defecto` y se deja constancia con la bandera
'movil-asumido' — nunca se inventa silenciosamente.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

import phonenumbers

from motor.area_codes_ar import area_code_len
from motor.config import TelefonoConfig

_SEPARADORES_RE = re.compile(r":::|[;,/|]|\s+y\s+", re.IGNORECASE)
_NO_DIGITO_RE = re.compile(r"\D")

# Excel/Sheets convierte campos numéricos largos (un teléfono es solo dígitos)
# a notación científica y trunca precisión: "3765045171" -> "3,76505E+09".
# Esos dígitos truncados son irrecuperables — hay que detectarlos ANTES de
# partir por separadores (la coma del decimal no es un separador acá) y
# marcarlos para revisión en vez de "completarlos" con el código de área
# default, que fabricaría un número falso a partir de basura.
_NOTACION_CIENTIFICA_RE = re.compile(r"\d+(?:[.,]\d+)?[eE]\+?\d+")

_PISTAS_MOVIL = {"mobile", "celular", "movil", "móvil", "cell", "whatsapp"}
_PISTAS_FIJO = {"home", "casa", "trabajo", "work", "oficina", "office", "fijo", "landline"}


@dataclass(frozen=True)
class PhoneResult:
    original: str
    e164: str | None
    pais: str | None
    flags: list[str] = field(default_factory=list)
    valido: bool = False


def normalizar_campo_telefono(
    raw: str, config: TelefonoConfig, label_hint: str | None = None
) -> list[PhoneResult]:
    """Punto de entrada público: un campo puede contener 1 o más números."""
    candidatos = dividir_campo_telefono(raw)
    resultados = [normalizar_telefono_unico(c, config, label_hint) for c in candidatos]
    return _deduplicar_e164(resultados)


def _deduplicar_e164(resultados: list[PhoneResult]) -> list[PhoneResult]:
    """Un mismo campo suele repetir el mismo número en formatos distintos
    (p. ej. exports que unen valores duplicados con ':::'). No es pérdida
    de información conservar solo una copia cuando el resultado normalizado
    ya es idéntico — los candidatos sin normalizar (e164 None) se conservan
    todos, porque ahí sí puede haber texto distinto que valga revisar."""
    vistos: set[str] = set()
    finales: list[PhoneResult] = []
    for r in resultados:
        if r.e164 is not None:
            if r.e164 in vistos:
                continue
            vistos.add(r.e164)
        finales.append(r)
    return finales


def dividir_campo_telefono(raw: str) -> list[str]:
    if not raw or not raw.strip():
        return []
    protegido, notaciones = _proteger_notacion_cientifica(raw)
    partes = [p.strip() for p in _SEPARADORES_RE.split(protegido) if p.strip()]
    resultado: list[str] = []
    for parte in partes:
        m = re.fullmatch(r"\x00(\d+)\x00", parte)
        if m:
            # Token de notación científica: se conserva tal cual, sin
            # partir por pegados/coma, para que quede marcado 'revisar'.
            resultado.append(notaciones[int(m.group(1))])
        else:
            resultado.extend(_dividir_pegados(parte))
    return resultado


def _proteger_notacion_cientifica(raw: str) -> tuple[str, list[str]]:
    extraidos: list[str] = []

    def _reemplazar(m: re.Match) -> str:
        extraidos.append(m.group(0))
        return f"\x00{len(extraidos) - 1}\x00"

    protegido = _NOTACION_CIENTIFICA_RE.sub(_reemplazar, raw)
    return protegido, extraidos


def _dividir_pegados(parte: str) -> list[str]:
    digitos = _NO_DIGITO_RE.sub("", parte)
    if len(digitos) >= 20 and len(digitos) % 10 == 0 and "+" not in parte:
        return [digitos[i : i + 10] for i in range(0, len(digitos), 10)]
    return [parte]


def normalizar_telefono_unico(
    raw: str, config: TelefonoConfig, label_hint: str | None = None
) -> PhoneResult:
    if _NOTACION_CIENTIFICA_RE.search(raw):
        # Defensa en profundidad: si esta función se llama directo (sin pasar
        # por dividir_campo_telefono) sobre un valor corrompido por Excel,
        # no hay que dejar que el fallback de "número corto" lo complete con
        # el código de área default y fabrique un teléfono inexistente.
        return PhoneResult(raw, None, None, ["revisar"], False)

    limpio = _limpiar(raw)
    if not limpio or limpio == "+":
        return PhoneResult(raw, None, None, ["revisar"], False)

    tiene_mas = limpio.startswith("+")
    digitos = limpio[1:] if tiene_mas else limpio

    if len(digitos) < 6:
        return PhoneResult(raw, None, None, ["revisar"], False)

    if tiene_mas:
        # El usuario escribió un '+' explícito: es una señal deliberada de
        # código de país, confiar en ella primero.
        extranjero = _intentar_extranjero(digitos)
        if extranjero is not None:
            e164, pais = extranjero
            return PhoneResult(raw, e164, pais, ["extranjero"], True)
        if not digitos.startswith("54"):
            # '+' pero no resultó ni argentino ni otro país válido -> no
            # inventar, mandar a revisión.
            return PhoneResult(raw, None, None, ["revisar"], False)
        digitos = digitos[2:]  # sacar '54'
        return _normalizar_ar(raw, digitos, config, label_hint)

    # Sin '+': en esta base los números domésticos argentinos sin marcar
    # son la inmensa mayoría. Un bloque de dígitos "pelado" puede coincidir
    # por casualidad con el plan de numeración de otro país (ej. un 10286
    # doméstico validando como Hungría o Bélgica) — por eso acá se prueba
    # PRIMERO si encaja en algún patrón doméstico conocido, y solo si no
    # encaja se intenta la detección global de país.
    if digitos.startswith("0"):
        return _normalizar_ar(raw, digitos, config, label_hint)

    if digitos.startswith("54") and len(digitos) in (12, 13):
        # "5493743504517": exports reales (Google Contacts) suelen guardar
        # el valor sin el '+'. El largo (12 = 54+10, 13 = 54+9+10) es lo que
        # descarta que sea, por coincidencia, un número corto que empieza
        # con "54".
        return _normalizar_ar(raw, digitos[2:], config, label_hint)

    patron_domestico = (
        6 <= len(digitos) <= 8
        or len(digitos) == 10
        or (digitos.startswith("9") and len(digitos) == 11)
    )
    if patron_domestico:
        return _normalizar_ar(raw, digitos, config, label_hint)

    extranjero = _intentar_extranjero(digitos)
    if extranjero is not None:
        e164, pais = extranjero
        return PhoneResult(raw, e164, pais, ["extranjero"], True)

    return PhoneResult(raw, None, None, ["revisar"], False)


def _limpiar(raw: str) -> str:
    raw = raw.strip()
    if not raw:
        return ""
    tiene_mas = raw.startswith("+")
    digitos = _NO_DIGITO_RE.sub("", raw)
    return ("+" + digitos) if tiene_mas else digitos


def _intentar_extranjero(digitos: str) -> tuple[str, str] | None:
    try:
        numero = phonenumbers.parse("+" + digitos, None)
    except phonenumbers.NumberParseException:
        return None
    if not phonenumbers.is_valid_number(numero):
        return None
    pais = phonenumbers.region_code_for_number(numero)
    if not pais or pais == "AR":
        return None
    e164 = phonenumbers.format_number(numero, phonenumbers.PhoneNumberFormat.E164)
    return e164, pais


def _clasificar_pista(label_hint: str | None) -> str | None:
    if not label_hint:
        return None
    texto = label_hint.strip().lower()
    if any(pista in texto for pista in _PISTAS_MOVIL):
        return "movil"
    if any(pista in texto for pista in _PISTAS_FIJO):
        return "fijo"
    return None


def _normalizar_ar(
    original: str, digitos: str, config: TelefonoConfig, label_hint: str | None
) -> PhoneResult:
    if digitos.startswith("0"):
        digitos = digitos[1:]

    if not digitos.isdigit() or not digitos:
        return PhoneResult(original, None, None, ["revisar"], False)

    flags: list[str] = []
    es_movil: bool

    # Formato internacional ya limpio: 9 + 10 dígitos (área+abonado).
    if digitos.startswith("9") and len(digitos) == 11:
        digitos_final = digitos[1:]
        es_movil = True

    else:
        area_len = area_code_len(digitos[:2], digitos[:3])
        area = digitos[:area_len]
        resto = digitos[area_len:]

        if resto.startswith("15") and area_len + (len(resto) - 2) == 10:
            digitos_final = area + resto[2:]
            es_movil = True

        elif len(digitos) == 10:
            digitos_final = digitos
            pista = _clasificar_pista(label_hint)
            if pista == "fijo":
                es_movil = False
                flags.append("fijo")
            elif pista == "movil":
                es_movil = True
            elif config.asumir_movil_por_defecto:
                es_movil = True
                flags.append("movil-asumido")
            else:
                es_movil = False
                flags.append("fijo")

        elif 6 <= len(digitos) <= 8:
            digitos_final = config.codigo_area_default + digitos
            pista = _clasificar_pista(label_hint)
            es_movil = pista != "fijo" and (pista == "movil" or config.asumir_movil_por_defecto)
            flags.extend(["incompleto", "corregido"])
            if len(digitos_final) != 10:
                flags.append("revisar")

        else:
            return PhoneResult(original, None, None, ["revisar"], False)

    if len(digitos_final) != 10 and "revisar" not in flags:
        flags.append("revisar")

    prefijo = "+549" if es_movil else "+54"
    if not es_movil and "fijo" not in flags:
        flags.append("fijo")

    e164 = prefijo + digitos_final
    valido = len(digitos_final) == 10
    return PhoneResult(original, e164, "AR", flags, valido)
