"""Seguimiento de progreso en tiempo real para procesos de larga duración
(extracción masiva, normalización, deduplicación con IA, exportaciones).
Permite que el navegador web muestre una barra fluida de 0 a 100%, pasos
completados, tiempo estimado restante (ETA) y logs en vivo sin necesidad
de que el usuario abra la terminal negra de Windows (cmd.exe)."""

from __future__ import annotations

import json
import threading
import time
from collections import deque
from typing import Any, Generator


class ProgressTracker:
    def __init__(self, max_logs: int = 50) -> None:
        self._lock = threading.Lock()
        self.activo: bool = False
        self.paso_actual: int = 0
        self.total_pasos: int = 4
        self.progreso_pct: int = 100
        self.etapa_nombre: str = "Listo"
        self.mensaje: str = "Base de datos lista"
        self.detalle: str = ""
        self.logs: deque[str] = deque(maxlen=max_logs)
        self.error: str | None = None
        self.exito: bool = True
        self.inicio: float = 0.0
        self.resultado: dict[str, Any] | None = None

    def iniciar(self, etapa_nombre: str = "Iniciando proceso...", total_pasos: int = 4) -> None:
        with self._lock:
            self.activo = True
            self.paso_actual = 1
            self.total_pasos = total_pasos
            self.progreso_pct = 2
            self.etapa_nombre = etapa_nombre
            self.mensaje = etapa_nombre
            self.detalle = ""
            self.error = None
            self.exito = False
            self.inicio = time.time()
            self.resultado = None
            self.logs.clear()
            self._log_interno(f"🚀 {etapa_nombre}")

    def actualizar(
        self,
        paso: int | None = None,
        pct: int | float | None = None,
        etapa_nombre: str | None = None,
        mensaje: str | None = None,
        detalle: str | None = None,
        log_msg: str | None = None,
    ) -> None:
        with self._lock:
            if paso is not None:
                self.paso_actual = paso
            if pct is not None:
                self.progreso_pct = max(0, min(100, int(pct)))
            if etapa_nombre:
                self.etapa_nombre = etapa_nombre
            if mensaje:
                self.mensaje = mensaje
            if detalle is not None:
                self.detalle = detalle
            if log_msg:
                self._log_interno(log_msg)

    def log(self, texto: str) -> None:
        with self._lock:
            self._log_interno(texto)

    def _log_interno(self, texto: str) -> None:
        ts = time.strftime("%H:%M:%S")
        self.logs.append(f"[{ts}] {texto}")

    def finalizar(
        self,
        exito: bool = True,
        mensaje: str = "Proceso completado con éxito",
        resultado: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> None:
        with self._lock:
            self.activo = False
            self.progreso_pct = 100 if exito else self.progreso_pct
            self.exito = exito
            self.mensaje = mensaje
            self.resultado = resultado
            self.error = str(error) if error else None
            if exito:
                self._log_interno(f"✅ {mensaje}")
            else:
                self._log_interno(f"❌ Error: {error}")

    def estado(self) -> dict[str, Any]:
        with self._lock:
            transcurrido = int(time.time() - self.inicio) if self.inicio and self.activo else 0
            eta = None
            if self.activo and self.progreso_pct > 5 and transcurrido > 2:
                total_est = (transcurrido / self.progreso_pct) * 100
                eta = max(0, int(total_est - transcurrido))

            return {
                "activo": self.activo,
                "paso_actual": self.paso_actual,
                "total_pasos": self.total_pasos,
                "progreso_pct": self.progreso_pct,
                "etapa_nombre": self.etapa_nombre,
                "mensaje": self.mensaje,
                "detalle": self.detalle,
                "logs": list(self.logs),
                "error": self.error,
                "exito": self.exito,
                "tiempo_transcurrido": transcurrido,
                "eta_segundos": eta,
                "resultado": self.resultado,
            }

    def generar_eventos_sse(self) -> Generator[str, None, None]:
        """Generador para Server-Sent Events (SSE) compatible con browsers."""
        ultimo_estado = None
        while True:
            actual = self.estado()
            # Enviar evento si hubo cambios o al menos un heartbeat cada 2 segundos
            payload = json.dumps(actual, ensure_ascii=False)
            yield f"data: {payload}\n\n"
            if not actual["activo"] and actual["progreso_pct"] == 100:
                # Mantener conexión 1 segundo más para enviar estado final y luego terminar
                time.sleep(1.0)
                break
            time.sleep(0.7)


# Instancia única compartida por todo el proceso del motor
tracker = ProgressTracker()
