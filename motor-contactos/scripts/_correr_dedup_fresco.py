"""Script temporal: corre deduplicar_todo(continuar=False) -- una corrida
100% fresca, ignorando cualquier corrida incompleta previa. Se invoca desde
setup_project.ps1/manualmente cuando hace falta forzar un recálculo limpio
en vez de reanudar. No forma parte del pipeline normal (eso es
`python -m motor.cli deduplicar`, que reanuda por default)."""

from dotenv import load_dotenv

from motor.config import cargar_config
from motor.dedup.merge_engine import deduplicar_todo
from motor.staging_db import conectar

load_dotenv()  # sin esto, todas las API keys quedan ausentes y el LLM-judge nunca resuelve nada
config = cargar_config("config.yaml")
conn = conectar(config.rutas.base_sqlite)
resultado = deduplicar_todo(config, conn, continuar=False)
print(f"deduplicacion (fresca): {resultado}")
