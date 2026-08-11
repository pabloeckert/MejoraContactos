"""Auto-etiquetado del campo Tag (Tipo Tag: familiar/laboral/cliente/
proveedor/personal) — heurística de palabras clave sobre Cargo/Empresa/Nota
de referencia, sin usar ningún LLM (no vale la pena el gasto/latencia de IA
para algo que un diccionario resuelve razonablemente bien). Es un punto de
partida, no la última palabra: el usuario lo puede corregir a mano en el
revisor web (ver reviewer_app.py, ruta /editar/<cluster_id>) y esa
corrección manual siempre gana sobre lo que calcule esta heurística."""

from __future__ import annotations

_PALABRAS_FAMILIAR = {
    "papa", "papá", "mama", "mamá", "hermano", "hermana", "primo", "prima",
    "tio", "tío", "tia", "tía", "abuelo", "abuela", "sobrino", "sobrina",
    "cuñado", "cuñada", "suegro", "suegra", "yerno", "nuera", "esposa",
    "esposo", "marido", "hijo", "hija", "familia", "flia", "flia.",
}
_PALABRAS_CLIENTE = {"cliente", "clienta", "compra", "compró", "pedido", "encargo"}
_PALABRAS_PROVEEDOR = {
    "proveedor", "proveedora", "distribuidor", "distribuidora", "fabricante",
    "mayorista",
}

_TAGS_VALIDOS = ("familiar", "laboral", "cliente", "proveedor", "personal")


def auto_etiquetar(cargo: str | None, organizacion: str | None, notas: str | None) -> str:
    """Devuelve uno de _TAGS_VALIDOS. Orden de prioridad: familiar > cliente
    > proveedor > laboral (si hay cargo u organización) > personal (default,
    ningún dato de trabajo/relación detectado)."""
    texto = " ".join(filter(None, [cargo, organizacion, notas])).lower()
    palabras = set(texto.replace(",", " ").replace(".", " ").split())

    if palabras & _PALABRAS_FAMILIAR:
        return "familiar"
    if palabras & _PALABRAS_CLIENTE:
        return "cliente"
    if palabras & _PALABRAS_PROVEEDOR:
        return "proveedor"
    if organizacion or cargo:
        return "laboral"
    return "personal"
