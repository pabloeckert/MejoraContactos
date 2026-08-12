"""Carga de config.yaml a un objeto tipado simple."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

DOMINIOS_FRECUENTES_DEFAULT = (
    "gmail.com",
    "hotmail.com",
    "hotmail.com.ar",
    "outlook.com",
    "outlook.com.ar",
    "yahoo.com",
    "yahoo.com.ar",
    "live.com",
    "live.com.ar",
    "icloud.com",
    "fibertel.com.ar",
    "speedy.com.ar",
    "arnet.com.ar",
    "ciudad.com.ar",
    "uol.com.ar",
)


@dataclass(frozen=True)
class TelefonoConfig:
    codigo_area_default: str = "376"
    asumir_movil_por_defecto: bool = True


@dataclass(frozen=True)
class EmailConfig:
    dominios_frecuentes: tuple[str, ...] = DOMINIOS_FRECUENTES_DEFAULT
    umbral_levenshtein: int = 2


@dataclass(frozen=True)
class RutasConfig:
    carpeta_raiz: Path
    carpeta_salida: Path
    base_sqlite: Path


@dataclass(frozen=True)
class PesosConfig:
    telefono_exacto: float = 0.5
    email_exacto: float = 0.3
    nombre_similitud: float = 0.15
    organizacion: float = 0.05


@dataclass(frozen=True)
class DedupConfig:
    # Umbral inicial "agresivo" (mismo teléfono fusiona directo) por
    # decisión explícita del usuario — el módulo de aprendizaje
    # (dedup/learning.py) lo va afinando con evidencia real de sus propias
    # decisiones, nunca se sale de estas bandas por sí solo.
    umbral_fusion_automatica: float = 0.80
    umbral_no_fusionar: float = 0.55
    pesos: PesosConfig = field(default_factory=PesosConfig)
    tope_bucket: int = 500


@dataclass(frozen=True)
class LlmProveedorConfig:
    proveedor: str = "groq"
    modelo: str = "llama-3.3-70b-versatile"


@dataclass(frozen=True)
class LlmEscaladoConfig:
    proveedor: str = "anthropic"
    modelo: str = "claude-sonnet-4-5"
    umbral_confianza_groq: float = 0.6


@dataclass(frozen=True)
class LlmConfig:
    activar_para_dudosos: bool = False
    primario: LlmProveedorConfig = field(default_factory=LlmProveedorConfig)
    escalado: LlmEscaladoConfig = field(default_factory=LlmEscaladoConfig)


@dataclass(frozen=True)
class RevisorConfig:
    puerto: int = 5000
    tamano_lote: int = 25


@dataclass(frozen=True)
class OcrConfig:
    # Solo hace falta si el binario de Tesseract no queda en el PATH del
    # sistema — ver extractors/image_ocr_extractor.py.
    tesseract_cmd: str | None = None


@dataclass(frozen=True)
class GoogleConfig:
    # Cada nombre en `cuentas` es una cuenta de Google Contacts propia
    # (ej. "pablo", "sindy") — cada una se autoriza por separado (OAuth,
    # requiere login del usuario) y guarda su propio token_<cuenta>.json.
    # Ver google_contacts_source.py y GOOGLE_SETUP.md.
    cuentas: tuple[str, ...] = ()


@dataclass(frozen=True)
class Config:
    rutas: RutasConfig
    extensiones_permitidas: frozenset[str]
    telefono: TelefonoConfig
    email: EmailConfig
    dedup: DedupConfig
    llm: LlmConfig
    revisor: RevisorConfig
    ocr: OcrConfig = field(default_factory=OcrConfig)
    google: GoogleConfig = field(default_factory=GoogleConfig)


def cargar_config(path: str | Path = "config.yaml") -> Config:
    path = Path(path)
    with path.open("r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)

    base_dir = path.resolve().parent
    rutas_raw = raw["rutas"]
    rutas = RutasConfig(
        carpeta_raiz=(base_dir / rutas_raw["carpeta_raiz"]).resolve(),
        carpeta_salida=(base_dir / rutas_raw["carpeta_salida"]).resolve(),
        base_sqlite=(base_dir / rutas_raw["base_sqlite"]).resolve(),
    )

    telefono_raw = raw.get("telefono", {})
    telefono = TelefonoConfig(
        codigo_area_default=str(telefono_raw.get("codigo_area_default", "376")),
        asumir_movil_por_defecto=bool(telefono_raw.get("asumir_movil_por_defecto", True)),
    )

    email_raw = raw.get("email", {})
    dominios = email_raw.get("dominios_frecuentes")
    email = EmailConfig(
        dominios_frecuentes=tuple(d.lower() for d in dominios) if dominios else DOMINIOS_FRECUENTES_DEFAULT,
        umbral_levenshtein=int(email_raw.get("umbral_levenshtein", 2)),
    )

    dedup = _cargar_dedup(raw.get("dedup", {}))
    llm = _cargar_llm(raw.get("llm", {}))
    revisor_raw = raw.get("revisor", {})
    revisor = RevisorConfig(
        puerto=int(revisor_raw.get("puerto", 5000)),
        tamano_lote=int(revisor_raw.get("tamano_lote", 25)),
    )
    ocr_raw = raw.get("ocr", {})
    ocr = OcrConfig(tesseract_cmd=ocr_raw.get("tesseract_cmd") or None)

    google_raw = raw.get("google", {})
    google = GoogleConfig(cuentas=tuple(google_raw.get("cuentas", [])))

    return Config(
        rutas=rutas,
        extensiones_permitidas=frozenset(raw.get("extensiones_permitidas", [])),
        telefono=telefono,
        email=email,
        dedup=dedup,
        llm=llm,
        revisor=revisor,
        ocr=ocr,
        google=google,
    )


def _cargar_dedup(raw: dict) -> DedupConfig:
    pesos_raw = raw.get("pesos", {})
    pesos = PesosConfig(
        telefono_exacto=float(pesos_raw.get("telefono_exacto", 0.5)),
        email_exacto=float(pesos_raw.get("email_exacto", 0.3)),
        nombre_similitud=float(pesos_raw.get("nombre_similitud", 0.15)),
        organizacion=float(pesos_raw.get("organizacion", 0.05)),
    )
    return DedupConfig(
        umbral_fusion_automatica=float(raw.get("umbral_fusion_automatica", 0.80)),
        umbral_no_fusionar=float(raw.get("umbral_no_fusionar", 0.55)),
        pesos=pesos,
        tope_bucket=int(raw.get("tope_bucket", 500)),
    )


def _cargar_llm(raw: dict) -> LlmConfig:
    primario_raw = raw.get("primario", {})
    primario = LlmProveedorConfig(
        proveedor=str(primario_raw.get("proveedor", "groq")),
        modelo=str(primario_raw.get("modelo", "llama-3.3-70b-versatile")),
    )
    escalado_raw = raw.get("escalado", {})
    escalado = LlmEscaladoConfig(
        proveedor=str(escalado_raw.get("proveedor", "anthropic")),
        modelo=str(escalado_raw.get("modelo", "claude-sonnet-4-5")),
        umbral_confianza_groq=float(escalado_raw.get("umbral_confianza_groq", 0.6)),
    )
    return LlmConfig(
        activar_para_dudosos=bool(raw.get("activar_para_dudosos", False)),
        primario=primario,
        escalado=escalado,
    )
