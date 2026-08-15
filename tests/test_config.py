"""Solo lo nuevo de esta ronda: parseo de `mejoraws.ruta` en cargar_config()
-- default cuando no está en el .yaml, override cuando sí. El resto de
cargar_config() no tenía tests antes de esto; no se backfillea acá, fuera
de alcance de este cambio puntual."""

from pathlib import Path

from motor.config import MejoraWsConfig, cargar_config


def _escribir_config_minimo(tmp_path: Path, extra_yaml: str = "") -> Path:
    (tmp_path / "Crudos").mkdir()
    contenido = f"""
rutas:
  carpeta_raiz: "Crudos"
  carpeta_salida: "Salida"
  base_sqlite: "Salida/staging.sqlite"
extensiones_permitidas:
  - csv
{extra_yaml}
"""
    ruta = tmp_path / "config.yaml"
    ruta.write_text(contenido, encoding="utf-8")
    return ruta


def test_mejoraws_ruta_usa_default_si_no_esta_en_el_yaml(tmp_path):
    config = cargar_config(_escribir_config_minimo(tmp_path))

    assert config.mejoraws.ruta == MejoraWsConfig().ruta


def test_mejoraws_ruta_se_puede_sobreescribir_en_el_yaml(tmp_path):
    ruta_config = _escribir_config_minimo(
        tmp_path, extra_yaml='mejoraws:\n  ruta: "D:/Otra/Ubicacion/MejoraWS"\n'
    )

    config = cargar_config(ruta_config)

    assert config.mejoraws.ruta == Path("D:/Otra/Ubicacion/MejoraWS")
