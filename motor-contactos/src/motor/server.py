"""Servidor y Centro de Control de MejoraContactos:
Interfaz web limpia, minimalista e independiente (HTML5 + Tailwind CSS + Vanilla JS)
con telemetría en tiempo real, escáner universal de carpetas y desempate cognitivo.
"""

from __future__ import annotations

import io
import json
import logging
import os
import sqlite3
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, render_template_string, request, send_file
from werkzeug.utils import secure_filename

from motor.config import Config, cargar_config
from motor.staging_db import conectar

logger = logging.getLogger(__name__)


# ----------------------------------------------------------------------
# 1. GESTOR DE PROGRESO Y TELEMETRÍA (THREAD-SAFE SINGLETON)
# ----------------------------------------------------------------------

@dataclass
class ScanState:
    estado: str = "idle"  # "idle" | "running" | "completed" | "error"
    ruta: str = ""
    archivo_actual: str = ""
    archivos_analizados: int = 0
    archivos_totales: int = 0
    registros_procesados: int = 0
    tiempo_inicio: float | None = None
    tiempo_fin: float | None = None
    ultimo_mensaje: str = "Listo para escanear carpetas locales o unidades Drive."
    actividad_reciente: list[dict[str, str]] = field(default_factory=list)
    resultado: dict[str, Any] | None = None
    error: str | None = None


class ScanManager:
    """Maneja la ejecución en segundo plano del UniversalScanner y la deduplicación."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._state = ScanState()
        self._thread: threading.Thread | None = None

    def get_status(self) -> dict[str, Any]:
        with self._lock:
            s = self._state
            ahora = time.time()
            if s.estado == "running" and s.tiempo_inicio:
                transcurrido = round(ahora - s.tiempo_inicio, 1)
            elif s.tiempo_inicio and s.tiempo_fin:
                transcurrido = round(s.tiempo_fin - s.tiempo_inicio, 1)
            else:
                transcurrido = 0.0

            progreso_pct = s.archivos_totales > 0 and min(100, int((s.archivos_analizados / s.archivos_totales) * 100)) or 0
            if s.estado == "completed":
                progreso_pct = 100

            return {
                "estado": s.estado,
                "ruta": s.ruta,
                "archivo_actual": s.archivo_actual,
                "archivos_analizados": s.archivos_analizados,
                "archivos_totales": s.archivos_totales,
                "registros_procesados": s.registros_procesados,
                "progreso_porcentaje": progreso_pct,
                "tiempo_transcurrido_segundos": transcurrido,
                "tiempo_inicio": datetime.fromtimestamp(s.tiempo_inicio, tz=timezone.utc).isoformat() if s.tiempo_inicio else None,
                "ultimo_mensaje": s.ultimo_mensaje,
                "actividad_reciente": list(s.actividad_reciente),
                "resultado": s.resultado,
                "error": s.error,
            }

    def agregar_log(self, mensaje: str, archivo: str = "", analizados: int = -1, totales: int = -1, registros: int = -1) -> None:
        with self._lock:
            s = self._state
            hora = datetime.now().strftime("%H:%M:%S")
            s.ultimo_mensaje = mensaje
            if archivo:
                s.archivo_actual = archivo
            if analizados >= 0:
                s.archivos_analizados = analizados
            if totales >= 0:
                s.archivos_totales = totales
            if registros >= 0:
                s.registros_procesados = registros

            s.actividad_reciente.append({"hora": hora, "mensaje": mensaje})
            if len(s.actividad_reciente) > 80:
                s.actividad_reciente = s.actividad_reciente[-80:]

    def iniciar_escaneo(self, ruta: str, config: Config) -> tuple[bool, str]:
        with self._lock:
            if self._state.estado == "running" and self._thread and self._thread.is_alive():
                return False, "Ya hay un proceso en ejecución."

            # Normalizar ruta: limpiar comillas y expandir
            ruta_limpia = str(ruta).strip("\"' ")
            ruta_norm = os.path.normpath(os.path.expanduser(ruta_limpia)).replace("\\", "/")
            p = Path(ruta_norm).resolve()

            if not p.exists():
                msg_error = f"Error: La ruta '{ruta_norm}' no existe en el sistema"
                hora = datetime.now().strftime("%H:%M:%S")
                self._state.estado = "error"
                self._state.error = msg_error
                self._state.ultimo_mensaje = msg_error
                self._state.actividad_reciente.append({"hora": hora, "mensaje": msg_error})
                if len(self._state.actividad_reciente) > 80:
                    self._state.actividad_reciente = self._state.actividad_reciente[-80:]
                return False, msg_error

            if not p.is_dir():
                msg_error = f"Error: La ruta '{ruta_norm}' no es una carpeta válida"
                hora = datetime.now().strftime("%H:%M:%S")
                self._state.estado = "error"
                self._state.error = msg_error
                self._state.ultimo_mensaje = msg_error
                self._state.actividad_reciente.append({"hora": hora, "mensaje": msg_error})
                if len(self._state.actividad_reciente) > 80:
                    self._state.actividad_reciente = self._state.actividad_reciente[-80:]
                return False, msg_error

            self._state = ScanState(
                estado="running",
                ruta=ruta_norm,
                tiempo_inicio=time.time(),
                ultimo_mensaje=f"Explorando subcarpetas en: {ruta_norm}",
                actividad_reciente=[{"hora": datetime.now().strftime("%H:%M:%S"), "mensaje": f"Explorando subcarpetas en: {ruta_norm}"}],
            )

        self._thread = threading.Thread(
            target=self._ejecutar_escaneo_background,
            args=(p, config),
            daemon=True,
        )
        self._thread.start()
        return True, f"Escaneo universal iniciado en '{p.name}'"

    def _ejecutar_escaneo_background(self, carpeta: Path, config: Config) -> None:
        from motor.extractors.universal_scanner import escanear_directorio

        conn = None
        try:
            conn = conectar(config.rutas.base_sqlite)

            def callback_progreso(evento: str, info: dict[str, Any]) -> None:
                self.agregar_log(
                    mensaje=info.get("mensaje", ""),
                    archivo=info.get("archivo", ""),
                    analizados=info.get("indice", -1),
                    totales=info.get("totales", -1),
                    registros=info.get("total_raw", -1),
                )

            resultado = escanear_directorio(carpeta, config, conn, callback_progreso=callback_progreso)

            with self._lock:
                self._state.estado = "completed"
                self._state.tiempo_fin = time.time()
                self._state.resultado = resultado
                self._state.archivo_actual = "Escaneo completado"
                self.agregar_log(f"Completado exitoso: {resultado.get('total_personas_unificadas', 0)} personas unificadas")

        except Exception as exc:
            logger.exception("Error en escaneo background: %s", exc)
            with self._lock:
                self._state.estado = "error"
                self._state.tiempo_fin = time.time()
                self._state.error = str(exc)
                self.agregar_log(f"Error crítico: {exc}")
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

    def iniciar_deduplicacion(self, config: Config) -> tuple[bool, str]:
        with self._lock:
            if self._state.estado == "running" and self._thread and self._thread.is_alive():
                return False, "Ya hay un proceso en ejecución."

            self._state = ScanState(
                estado="running",
                ruta=str(config.rutas.base_sqlite),
                tiempo_inicio=time.time(),
                ultimo_mensaje="Iniciando deduplicación cognitiva de la base...",
                actividad_reciente=[{"hora": datetime.now().strftime("%H:%M:%S"), "mensaje": "Iniciando deduplicación y resolución de clusters..."}],
            )

        self._thread = threading.Thread(
            target=self._ejecutar_deduplicacion_background,
            args=(config,),
            daemon=True,
        )
        self._thread.start()
        return True, "Deduplicación iniciada en segundo plano"

    def _ejecutar_deduplicacion_background(self, config: Config) -> None:
        from motor.dedup.merge_engine import deduplicar_todo
        from motor.export import exportar_lista_maestra, exportar_whatsapp_csv

        conn = None
        try:
            conn = conectar(config.rutas.base_sqlite)
            self.agregar_log("Deduplicando registros con reglas deterministas y jerarquía Sindy...")
            res_dedup = deduplicar_todo(config, conn)
            self.agregar_log(f"Deduplicación finalizada: {res_dedup}")
            self.agregar_log("Exportando lista maestra y archivo WhatsApp...")
            ruta_export = exportar_lista_maestra(config, conn)
            ruta_wa = exportar_whatsapp_csv(config, conn)
            total_personas = conn.execute("SELECT COUNT(*) FROM personas").fetchone()[0]

            with self._lock:
                self._state.estado = "completed"
                self._state.tiempo_fin = time.time()
                self._state.resultado = {
                    "total_personas_unificadas": total_personas,
                    "deduplicacion": res_dedup,
                    "archivos_salida": {
                        "lista_maestra": str(ruta_export),
                        "whatsapp_csv": str(ruta_wa),
                    },
                }
                self.agregar_log(f"Completado exitoso: {total_personas} personas unificadas")
        except Exception as exc:
            logger.exception("Error en deduplicación: %s", exc)
            with self._lock:
                self._state.estado = "error"
                self._state.tiempo_fin = time.time()
                self._state.error = str(exc)
                self.agregar_log(f"Error en deduplicación: {exc}")
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass


# Instancia global compartida
scan_manager = ScanManager()


# ----------------------------------------------------------------------
# 2. CALIDAD Y CONSULTAS
# ----------------------------------------------------------------------

def calcular_resumen_calidad(config: Config) -> dict[str, Any]:
    """Calcula métricas de calidad consultando staging.sqlite."""
    conn = None
    try:
        conn = conectar(config.rutas.base_sqlite)
        filas = conn.execute("SELECT calidad, COUNT(*) FROM normalized_records GROUP BY calidad").fetchall()
        conteos = {r[0]: r[1] for r in filas}

        util = conteos.get("util", 0)
        dudoso = conteos.get("dudoso", 0)
        inutil = conteos.get("inutil", 0)
        total = util + dudoso + inutil

        porcentajes = {
            "util": round((util / total * 100), 1) if total > 0 else 0.0,
            "dudoso": round((dudoso / total * 100), 1) if total > 0 else 0.0,
            "inutil": round((inutil / total * 100), 1) if total > 0 else 0.0,
        }

        filas_motivos = conn.execute(
            "SELECT calidad_motivo, COUNT(*) FROM normalized_records WHERE calidad = 'dudoso' AND calidad_motivo != '' "
            "GROUP BY calidad_motivo ORDER BY COUNT(*) DESC LIMIT 5"
        ).fetchall()
        top_motivos_dudoso = [{"motivo": r[0], "cantidad": r[1]} for r in filas_motivos]

        fuentes_count = conn.execute("SELECT COUNT(*) FROM fuentes_procesadas").fetchone()[0]
        personas_count = conn.execute("SELECT COUNT(DISTINCT persona_id) FROM clusters WHERE persona_id IS NOT NULL").fetchone()[0]

        return {
            "total": total,
            "util": util,
            "dudoso": dudoso,
            "inutil": inutil,
            "porcentajes": porcentajes,
            "top_motivos_dudoso": top_motivos_dudoso,
            "fuentes_procesadas": fuentes_count,
            "personas_unificadas": personas_count,
        }
    except Exception as exc:
        logger.warning("Error calculando resumen de calidad: %s", exc)
        return {
            "total": 0,
            "util": 0,
            "dudoso": 0,
            "inutil": 0,
            "porcentajes": {"util": 0.0, "dudoso": 0.0, "inutil": 0.0},
            "top_motivos_dudoso": [],
            "fuentes_procesadas": 0,
            "personas_unificadas": 0,
            "error": str(exc),
        }
    finally:
        if conn:
            conn.close()


# ----------------------------------------------------------------------
# 3. INTERFAZ WEB LIMPIA Y MINIMALISTA (GET /)
# ----------------------------------------------------------------------
_HTML_DASHBOARD = """<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MejoraContactos — Centro de Control</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            brandNavy: '#0F172A',
            brandBlue: '#1E3A8A',
            brandEmerald: '#059669',
          },
          fontFamily: {
            sans: ['Inter', 'system-ui', 'sans-serif'],
            mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
          }
        }
      }
    }
  </script>
  <style>
    body { font-family: 'Inter', system-ui, sans-serif; background-color: #F8FAFC; color: #0F172A; }
    .toast { transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1); transform: translateY(100%); opacity: 0; }
    .toast.show { transform: translateY(0); opacity: 1; }
    .terminal-scroll { scroll-behavior: smooth; }
    .terminal-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
    .terminal-scroll::-webkit-scrollbar-track { background: #0F172A; }
    .terminal-scroll::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
    .terminal-scroll::-webkit-scrollbar-thumb:hover { background: #475569; }
  </style>
</head>
<body class="min-h-screen flex flex-col antialiased bg-[#F8FAFC] text-slate-900 selection:bg-slate-900 selection:text-white">

  <!-- ENCABEZADO INSTITUCIONAL -->
  <header class="bg-white border-b border-slate-200/80 sticky top-0 z-30 shadow-[0_1px_2px_0_rgba(0,0,0,0.03)]">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
      <div class="flex items-center space-x-3.5">
        <div class="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xs tracking-wider shadow-xs">
          MC
        </div>
        <div>
          <div class="flex items-center space-x-2">
            <h1 class="text-sm sm:text-base font-bold text-slate-900 tracking-tight">MejoraContactos</h1>
            <span class="text-slate-300 font-normal">|</span>
            <span class="text-xs sm:text-sm font-medium text-slate-600">Centro de Control</span>
          </div>
          <p class="text-[11px] text-slate-500 font-medium">Motor de Deduplicación, Normalización e Inferencia Cognitiva</p>
        </div>
      </div>

      <div class="flex items-center space-x-3">
        <!-- Badge Gobernanza -->
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
          <span class="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
          Gobernanza: Sindy Regente
        </span>

        <!-- Badge Estado en Vivo -->
        <span id="header-status-badge" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80">
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          En línea
        </span>

        <!-- Botón Refrescar -->
        <button onclick="actualizarTodo()" class="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition" title="Refrescar métricas">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
          </svg>
        </button>
      </div>
    </div>
  </header>

  <!-- CONTENIDO PRINCIPAL EN 3 FILAS ESTRUCTURADAS -->
  <main class="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full space-y-6">

    <!-- WIZARD / FLUJO PRINCIPAL GUIADO (4 PASOS) -->
    <div class="bg-white rounded-xl p-4 sm:p-5 border border-slate-200/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] mb-6">
      <div class="flex items-center justify-between mb-3">
        <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Flujo Guiado de Consolidación</span>
        <span class="text-xs text-slate-500 font-medium">Completá los pasos en orden para sincronizar de forma segura</span>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <div id="step-1" class="flex items-center space-x-2.5 p-2.5 rounded-lg border border-slate-200 bg-slate-50/80">
          <div class="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold shrink-0">1</div>
          <div class="truncate">
            <p class="text-xs font-bold text-slate-800 truncate">Importar Fuentes</p>
            <p class="text-[10px] text-slate-500 truncate">Google o archivos PC</p>
          </div>
        </div>
        <div id="step-2" class="flex items-center space-x-2.5 p-2.5 rounded-lg border border-slate-200 bg-slate-50/80">
          <div class="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold shrink-0">2</div>
          <div class="truncate">
            <p class="text-xs font-bold text-slate-800 truncate">Limpiar & Dedup</p>
            <p class="text-[10px] text-slate-500 truncate">Unificar duplicados</p>
          </div>
        </div>
        <div id="step-3" class="flex items-center space-x-2.5 p-2.5 rounded-lg border border-slate-200 bg-slate-50/80">
          <div class="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold shrink-0">3</div>
          <div class="truncate">
            <p class="text-xs font-bold text-slate-800 truncate">Revisar Dudosos</p>
            <p class="text-[10px] text-slate-500 truncate">Resolver zona gris</p>
          </div>
        </div>
        <div id="step-4" class="flex items-center space-x-2.5 p-2.5 rounded-lg border border-slate-200 bg-slate-50/80">
          <div class="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold shrink-0">4</div>
          <div class="truncate">
            <p class="text-xs font-bold text-slate-800 truncate">Exportar & Sync</p>
            <p class="text-[10px] text-slate-500 truncate">CRM, WS y Google</p>
          </div>
        </div>
      </div>
    </div>


    <!-- FILA 1: TARJETAS DE ESTADO EN VIVO (KPIS SOBRIOS) -->
    <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Contactos Útiles -->
      <div class="bg-white rounded-xl p-5 border border-slate-200/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] flex flex-col justify-between">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Útiles (CRM / WS)</span>
          <span id="kpi-util-pct" class="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">--%</span>
        </div>
        <div class="my-1">
          <span id="kpi-util" class="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight font-mono">--</span>
        </div>
        <p class="text-xs text-[#64748B] mt-1">Con móvil/WhatsApp o email verificado</p>
      </div>

      <!-- Contactos Dudosos -->
      <div class="bg-white rounded-xl p-5 border border-slate-200/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] flex flex-col justify-between">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Dudosos (Revisión)</span>
          <span id="kpi-dudoso-pct" class="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">--%</span>
        </div>
        <div class="my-1">
          <span id="kpi-dudoso" class="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight font-mono">--</span>
        </div>
        <p class="text-xs text-[#64748B] mt-1">Incompletos o desempate cognitivo</p>
      </div>

      <!-- Contactos Inútiles -->
      <div class="bg-white rounded-xl p-5 border border-slate-200/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] flex flex-col justify-between">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Inútiles (Descartes)</span>
          <span id="kpi-inutil-pct" class="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full">--%</span>
        </div>
        <div class="my-1">
          <span id="kpi-inutil" class="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight font-mono">--</span>
        </div>
        <p class="text-xs text-[#64748B] mt-1">Filas vacías, 2FA y pruebas técnicas</p>
      </div>

      <!-- Total Procesados -->
      <div class="bg-white rounded-xl p-5 border border-slate-200/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] flex flex-col justify-between">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Total en Staging</span>
          <span class="text-[11px] font-medium text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">staging.sqlite</span>
        </div>
        <div class="my-1">
          <span id="kpi-total" class="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight font-mono">--</span>
        </div>
        <p class="text-xs text-[#64748B] mt-1">Registros normalizados e indexados</p>
      </div>
    </section>

    <!-- FILA 2: DOS COLUMNAS PAREJAS (IZQ: INGESTA / DER: TELEMETRÍA) -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">

      <!-- COLUMNA IZQUIERDA: INGESTA Y CARGA DE ARCHIVOS -->
      <div class="bg-white rounded-xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between space-y-6">
        
        <div>
          <!-- Cabecera de Ingesta -->
          <div class="flex items-center space-x-3 mb-4">
            <div class="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
              <svg class="w-4 h-4 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
              </svg>
            </div>
            <div>
              <h2 class="text-sm font-bold text-slate-900">Ingesta de Archivos y Carpetas</h2>
              <p class="text-xs text-slate-500">Escaneá carpetas locales o cargá planillas y documentos directamente.</p>
            </div>
          </div>

          <!-- 1. Explorador de Carpetas Unificado (Sin Quiebre de Flexbox) -->
          <div class="space-y-2.5 pb-4 border-b border-slate-100">
            <label class="block text-xs font-semibold text-slate-700">Ruta de Carpeta o Unidad Cloud</label>
            
            <!-- Barra Unificada de Input y Botones -->
            <div class="flex flex-col sm:flex-row items-stretch gap-2">
              <div class="relative flex-1 flex items-center rounded-lg border border-slate-300 bg-white shadow-xs focus-within:ring-2 focus-within:ring-slate-900 focus-within:border-transparent">
                <span class="pl-3 pr-2 text-slate-400">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
                  </svg>
                </span>
                <input id="input-ruta-carpeta" type="text" placeholder="C:\\Usuarios\\...\\Google Drive o Data/Crudos" value="../Data/Crudos"
                  class="w-full text-xs font-mono py-2.5 bg-transparent border-0 focus:outline-none text-slate-800 placeholder-slate-400">
              </div>

              <!-- Botón 1: 📁 Examinar en mi PC -->
              <button id="btn-examinar-pc" onclick="abrirDialogoCarpetaPC()" type="button"
                class="h-10 px-3.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-semibold rounded-lg shadow-xs transition flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap">
                <span>📁 Examinar en mi PC</span>
              </button>

              <!-- Botón 2: Seleccionar Carpeta Web -->
              <input type="file" id="input-carpeta-web" webkitdirectory directory multiple class="hidden" onchange="manejarCarpetaWeb(event)">
              <button id="btn-examinar-web" onclick="document.getElementById('input-carpeta-web').click()" type="button"
                class="h-10 px-3.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold rounded-lg shadow-xs transition flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap">
                <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path>
                </svg>
                <span>Seleccionar Carpeta Web</span>
              </button>

              <!-- Botón 3: Escanear -->
              <button id="btn-escanear-carpeta" onclick="iniciarEscaneo()" type="button"
                class="h-10 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-xs transition flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap">
                <svg class="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path>
                </svg>
                <span>Escanear</span>
              </button>
            </div>

            <!-- Accesos rápidos a rutas comunes -->
            <div class="flex items-center gap-2 text-[11px] text-slate-400 pt-0.5">
              <span class="font-medium text-slate-400">Atajos rápidos:</span>
              <button onclick="setRuta('../Data/Crudos')" class="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium transition">📁 Data/Crudos</button>
              <button onclick="setRuta('G:\\\\Mi unidad\\\\Contactos')" class="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium transition">☁️ Drive G:</button>
              <button onclick="setRuta('C:\\\\Users\\\\tabeg\\\\Google Drive')" class="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium transition">💻 Drive Local</button>
            </div>
          </div>
        </div>

        <!-- 2. Cargar Archivos Sueltos (Dropzone) -->
        <div class="space-y-3">
          <div class="flex items-center justify-between text-xs font-semibold text-slate-700">
            <span>Cargar Archivos Sueltos a 'Data/Crudos'</span>
            <span class="text-[11px] font-normal text-slate-400">.xlsx, .csv, .docx, .pdf, .txt, .vcf</span>
          </div>

          <!-- Dropzone -->
          <div id="dropzone" class="border-2 border-dashed border-slate-200 hover:border-slate-400 rounded-xl p-5 text-center cursor-pointer transition bg-slate-50/50 hover:bg-slate-100/40">
            <input type="file" id="file-input" multiple accept=".xlsx,.xls,.csv,.tsv,.ods,.docx,.pdf,.txt,.md,.log,.vcf,.json" class="hidden">
            <div class="w-9 h-9 mx-auto rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 mb-2 shadow-2xs">
              <svg class="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
              </svg>
            </div>
            <p class="text-xs font-semibold text-slate-800">Soltá tus archivos acá o <span class="text-blue-600 underline">hacé clic para explorar</span></p>
            <p class="text-[11px] text-slate-400 mt-0.5">Se indexarán automáticamente en la base local</p>
          </div>

          <!-- Archivos subidos recientes -->
          <div id="archivos-subidos-contenedor" class="hidden space-y-1.5 pt-1">
            <div class="flex items-center justify-between text-[11px] text-slate-500 font-medium">
              <span>Archivos subidos recientemente:</span>
              <button onclick="iniciarEscaneo('../Data/Crudos')" class="text-blue-600 hover:underline font-semibold">Escanear Data/Crudos ahora →</button>
            </div>
            <div id="lista-archivos-subidos" class="max-h-24 overflow-y-auto space-y-1 rounded-lg border border-slate-200 bg-slate-50/50 p-2 text-xs font-mono"></div>
          </div>
        </div>

      </div>

      <!-- COLUMNA DERECHA: TELEMETRÍA EN VIVO Y TERMINAL MINIMALISTA -->
      <div class="bg-white rounded-xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between space-y-4">
        
        <div>
          <!-- Cabecera de Telemetría -->
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center space-x-2.5">
        <button onclick="abrirBienvenida()" class="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200" title="Ver guía de uso paso a paso">
          <svg class="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span class="hidden sm:inline">Guía de Inicio</span>
        </button>
              <span id="telemetry-badge-dot" class="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
              <span id="telemetry-badge-text" class="text-xs font-bold text-slate-700 uppercase tracking-wider">Inactivo</span>
            </div>
            <div class="flex items-center space-x-2.5 text-xs font-mono text-slate-500">
              <span id="telemetry-time">0.0s</span>
              <span>·</span>
              <span id="telemetry-files">0 / 0 archivos</span>
            </div>
          </div>

          <!-- Barra de Progreso -->
          <div class="space-y-1.5 mb-3">
            <div class="flex items-center justify-between text-xs font-medium">
              <span id="telemetry-status-message" class="text-slate-700 truncate max-w-[320px]">Esperando acción...</span>
              <span id="telemetry-percentage" class="text-slate-900 font-mono font-bold">0%</span>
            </div>
            <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/60">
              <div id="progress-bar" class="bg-slate-900 h-full rounded-full transition-all duration-300" style="width: 0%"></div>
            </div>
          </div>

          <!-- Cuadro de Resultado de Escaneo Exitoso -->
          <div id="box-resultado" class="hidden rounded-lg bg-emerald-50 border border-emerald-200 p-3 space-y-1.5 mb-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                <svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span>Escaneo Finalizado Exitosamente</span>
              </span>
              <span id="resultado-personas-badge" class="text-[11px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full">-- Personas</span>
            </div>
            <div class="text-[11px] text-slate-600 flex justify-between font-mono pt-1 border-t border-emerald-100">
              <span>Nuevos crudos: <b id="res-crudos">0</b></span>
              <span>Normalizados: <b id="res-norm">0</b></span>
              <span><a href="/api/descargar/lista-maestra" class="text-blue-600 underline font-semibold">Descargar Excel</a></span>
            </div>
          </div>
        </div>

        <!-- Terminal Minimalista Estilo VS Code -->
        <div class="flex-1 flex flex-col pt-1">
          <!-- Cabecera del Terminal -->
          <div class="bg-[#0F172A] border border-[#1E293B] border-b-0 rounded-t-lg px-3 py-2 flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <div class="flex space-x-1.5">
                <div class="w-2.5 h-2.5 rounded-full bg-[#FF5F56]/80"></div>
                <div class="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]/80"></div>
                <div class="w-2.5 h-2.5 rounded-full bg-[#27C93F]/80"></div>
              </div>
              <span class="text-[11px] font-medium text-slate-400 font-mono pl-1.5">Consola de Actividad del Motor</span>
            </div>
            <label class="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none">
              <input type="checkbox" id="check-autoscroll" checked class="rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-0">
              <span>Auto-scroll</span>
            </label>
          </div>

          <!-- Viewport del Terminal -->
          <div id="telemetry-logs" class="terminal-scroll bg-[#0B0F19] text-slate-300 font-mono text-[12px] p-3 rounded-b-lg h-[240px] overflow-y-auto space-y-1 border border-[#1E293B] shadow-inner leading-relaxed select-text">
            <div class="text-slate-500 italic">Listo. Las acciones del motor e inferencias en vivo aparecerán acá.</div>
          </div>
        </div>

      </div>

    </div>

    <!-- FILA 3: CENTRO DE GOBIERNO Y ACCIONES (3 BLOQUES ESTANDARIZADOS A ALTURA H-10) -->
    <section class="bg-white rounded-xl p-6 border border-slate-200 shadow-xs space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div class="flex items-center space-x-2">
            <h3 class="text-sm font-bold text-slate-900 tracking-tight">Centro de Gobierno, Sincronización y Exportación</h3>
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Gobernanza Regente Sindy</span>
          </div>
          <p class="text-xs text-slate-500 mt-0.5">Control centralizado de respaldos históricos, sincronización protegida hacia Google People API y exportación de listas consolidadas.</p>
        </div>

        <!-- Estado de último backup y toggle historial -->
        <div class="flex items-center space-x-3 text-xs text-slate-600 shrink-0">
          <div class="flex items-center space-x-1.5">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Último Respaldo: <strong id="lbl-ultimo-backup" class="text-slate-800 font-mono">Consultando...</strong></span>
          </div>
          <button onclick="toggleHistorialBackups()" class="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline flex items-center space-x-1">
            <span id="txt-toggle-historial">Historial (0)</span>
            <svg id="icon-toggle-historial" class="w-3.5 h-3.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
            </svg>
          </button>
        </div>
      </div>

      <!-- Grid de 3 sub-bloques estandarizados con botones a altura fija h-10 y diseño Stripe/Linear -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        <!-- Bloque 1: Respaldo y Snapshot -->
        <div class="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 flex flex-col justify-between space-y-3">
          <div>
            <div class="flex items-center space-x-2 mb-1">
              <span class="w-5 h-5 rounded bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">1</span>
              <h4 class="text-xs font-bold text-slate-800 uppercase tracking-wider">Respaldo y Snapshots</h4>
            </div>
            <p class="text-[11px] text-slate-500">Generá copias históricas de la base en Google Drive y revertí sincronizaciones con 1-clic.</p>
          </div>
          <div class="space-y-2 pt-1">
            <button id="btn-backup-drive" onclick="generarBackupDrive()" class="w-full h-10 px-3.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-semibold rounded-lg shadow-xs transition flex items-center justify-center gap-2">
              <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path>
              </svg>
              <span>Generar Backup en Drive</span>
            </button>
            <button id="btn-sync-undo" onclick="ejecutarRollback()" class="w-full h-10 px-3.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-2">
              <svg class="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"></path>
              </svg>
              <span>Deshacer Sincronización (Rollback)</span>
            </button>
          </div>
        </div>

        <!-- Bloque 2: Sincronización a Google People API -->
        <div class="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 flex flex-col justify-between space-y-3">
          <div>
            <div class="flex items-center space-x-2 mb-1">
              <span class="w-5 h-5 rounded bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">2</span>
              <h4 class="text-xs font-bold text-slate-800 uppercase tracking-wider">Sincronización Google</h4>
            </div>
            <p class="text-[11px] text-slate-500">Sincronizá contactos canónicos hacia las cuentas maestras bajo gobernanza estricta.</p>
          </div>
          <div class="space-y-2 pt-1">
            <button onclick="abrirModalSync('sindy')" class="w-full h-10 px-3.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-xs transition flex items-center justify-center gap-2">
              <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
              </svg>
              <span>Sincronizar a Google (Sindy)</span>
            </button>
            <button onclick="abrirModalSync('pablo')" class="w-full h-10 px-3.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-semibold rounded-lg shadow-xs transition flex items-center justify-center gap-2">
              <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
              </svg>
              <span>Sincronizar a Google (Pablo)</span>
            </button>
          </div>
        </div>

        <!-- Bloque 3: Deduplicación y Exportación de Listas -->
        <div class="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 flex flex-col justify-between space-y-3">
          <div>
            <div class="flex items-center space-x-2 mb-1">
              <span class="w-5 h-5 rounded bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">3</span>
              <h4 class="text-xs font-bold text-slate-800 uppercase tracking-wider">Listas Maestras y Descarga</h4>
            </div>
            <p class="text-[11px] text-slate-500">Ejecutá deduplicación profunda y descargá las listas consolidadas en Excel o WhatsApp CSV.</p>
          </div>
          <div class="space-y-2 pt-1">
            <button id="btn-deduplicar" onclick="deduplicarBase()" class="w-full h-10 px-3.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-semibold rounded-lg shadow-xs transition flex items-center justify-center gap-2">
              <svg class="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path>
              </svg>
              <span>Deduplicar Base</span>
            </button>
            <div class="grid grid-cols-2 gap-2">
              <a href="/api/descargar/lista-maestra" class="h-10 px-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition flex items-center justify-center gap-1.5 whitespace-nowrap">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                </svg>
                <span>Lista (.xlsx)</span>
              </a>
              <a href="/api/descargar/whatsapp" class="h-10 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition flex items-center justify-center gap-1.5 whitespace-nowrap">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
                </svg>
                <span>WhatsApp (.csv)</span>
              </a>
            </div>
          </div>
        </div>

      </div>

      <!-- Panel colapsable de Historial de Backups -->
      <div id="panel-historial-backups" class="hidden rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
        <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Historial de Snapshots Disponibles en Data/Backups/</div>
        <div id="lista-historial-backups" class="max-h-36 overflow-y-auto space-y-1 text-xs font-mono"></div>
      </div>
    </section>

  </main>

  <!-- MODAL DE CONFIRMACIÓN DE SINCRONIZACIÓN GOOGLE -->
  <div id="modal-sync" class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs hidden flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div class="flex items-center space-x-2.5">
          <div class="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
          </div>
          <div>
            <h4 class="text-sm font-bold text-slate-900">Sincronizar hacia Google Contacts</h4>
            <p id="modal-subtitulo" class="text-xs text-slate-500 font-medium">Cuenta destino: Sindy Regente</p>
          </div>
        </div>
        <button onclick="cerrarModalSync()" class="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <!-- Resumen predictivo -->
      <div id="modal-contenido-preview" class="space-y-3">
        <div class="flex items-center justify-center py-6 text-slate-400 space-x-2">
          <svg class="animate-spin w-5 h-5 text-slate-900" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <span class="text-xs font-medium">Analizando diferencias y gobernanza con Google...</span>
        </div>
      </div>

      <!-- Advertencia de Backup Preventivo -->
      <div class="rounded-lg bg-blue-50 border border-blue-200 p-3 text-[11px] text-blue-900 flex items-start space-x-2">
        <svg class="w-4 h-4 text-blue-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
        </svg>
        <span><strong>Gobernanza y Seguridad:</strong> Se generará un snapshot preventivo en <code class="bg-blue-100 px-1 rounded">Data/Backups/</code> antes de sincronizar. Podrás revertir la operación con el botón Rollback.</span>
      </div>

      <!-- Botones de Acción Modal -->
      <div class="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
        <button onclick="cerrarModalSync()" class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition">Cancelar</button>
        <button id="btn-confirmar-sync-real" onclick="ejecutarSyncReal()" disabled class="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-xs transition">
          Confirmar Sincronización Real
        </button>
      </div>
    </div>
  </div>

  <!-- TOAST NOTIFICATION CONTAINER -->
  <div id="toast" class="toast fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-lg text-xs font-medium flex items-center space-x-2 border border-slate-800">
    <span id="toast-message">Mensaje</span>
  </div>

  <!-- VANILLA JAVASCRIPT REACTIVO (100% FUNCIONALIDAD CONSERVADA) -->
  <script>
    let isScanning = false;
    let autoScroll = true;

    function showToast(mensaje, tipo = 'info') {
      const toast = document.getElementById('toast');
      const msg = document.getElementById('toast-message');
      msg.textContent = mensaje;
      toast.className = 'toast show fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg text-xs font-medium flex items-center space-x-2 border ' +
        (tipo === 'error' ? 'bg-rose-900 text-rose-100 border-rose-800' :
         tipo === 'success' ? 'bg-emerald-900 text-emerald-100 border-emerald-800' :
         'bg-slate-900 text-slate-100 border-slate-800');
      setTimeout(() => { toast.classList.remove('show'); }, 3500);
    }

    function setRuta(ruta) {
      document.getElementById('input-ruta-carpeta').value = ruta;
    }

    // 1. Cargar Métricas de Calidad
    async function fetchCalidad() {
      try {
        const res = await fetch('/api/calidad-resumen');
        if (!res.ok) return;
        const data = await res.json();
        if (!data || typeof data !== 'object') return;

        document.getElementById('kpi-util').textContent = Number(data.util || 0).toLocaleString();
        document.getElementById('kpi-util-pct').textContent = (data.porcentajes?.util ?? 0) + '%';
        document.getElementById('kpi-dudoso').textContent = Number(data.dudoso || 0).toLocaleString();
        document.getElementById('kpi-dudoso-pct').textContent = (data.porcentajes?.dudoso ?? 0) + '%';
        document.getElementById('kpi-inutil').textContent = Number(data.inutil || 0).toLocaleString();
        document.getElementById('kpi-inutil-pct').textContent = (data.porcentajes?.inutil ?? 0) + '%';
        document.getElementById('kpi-total').textContent = Number(data.total || 0).toLocaleString();
      } catch (err) {
        console.warn('Error cargando calidad:', err);
      }
    }

    // 2. Cargar Estado de Escaneo y Telemetría
    async function fetchStatus() {
      try {
        const res = await fetch('/api/scan-status');
        if (!res.ok) return;
        const data = await res.json();
        if (!data || typeof data !== 'object') return;

        isScanning = (data.estado === 'running');

        // Badges y estado
        const badgeDot = document.getElementById('telemetry-badge-dot');
        const badgeText = document.getElementById('telemetry-badge-text');
        const progressBar = document.getElementById('progress-bar');
        const percentageText = document.getElementById('telemetry-percentage');
        const statusMsg = document.getElementById('telemetry-status-message');
        const timeText = document.getElementById('telemetry-time');
        const filesText = document.getElementById('telemetry-files');

        if (isScanning) {
          badgeDot.className = 'w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse';
          badgeText.textContent = 'En ejecución...';
          badgeText.className = 'text-xs font-bold text-amber-600 uppercase tracking-wider';
        } else if (data.estado === 'completed') {
          badgeDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500';
          badgeText.textContent = 'Completado';
          badgeText.className = 'text-xs font-bold text-emerald-600 uppercase tracking-wider';
        } else if (data.estado === 'error') {
          badgeDot.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
          badgeText.textContent = 'Error';
          badgeText.className = 'text-xs font-bold text-rose-600 uppercase tracking-wider';
        } else {
          badgeDot.className = 'w-2.5 h-2.5 rounded-full bg-slate-400';
          badgeText.textContent = 'Inactivo';
          badgeText.className = 'text-xs font-bold text-slate-700 uppercase tracking-wider';
        }

        const pct = Math.min(100, Math.max(0, Number(data.progreso_porcentaje || 0)));
        progressBar.style.width = pct + '%';
        percentageText.textContent = pct + '%';

        statusMsg.textContent = data.archivo_actual ? 'Procesando: ' + data.archivo_actual : (data.ultimo_mensaje || 'Listo');
        timeText.textContent = (Number(data.tiempo_transcurrido_segundos || 0).toFixed(1)) + 's';
        filesText.textContent = (data.archivos_analizados || 0) + ' / ' + ((data.archivos_totales > 0) ? data.archivos_totales : '?') + ' archivos';

        // Cuadro de resultado completado
        const boxRes = document.getElementById('box-resultado');
        if (data.estado === 'completed' && data.resultado) {
          boxRes.classList.remove('hidden');
          const totalP = data.resultado.total_personas_unificadas ?? '--';
          document.getElementById('resultado-personas-badge').textContent = totalP + ' Personas';
          document.getElementById('res-crudos').textContent = data.resultado.raw_records_nuevos ?? 0;
          document.getElementById('res-norm').textContent = data.resultado.normalized_records_nuevos ?? 0;
        } else if (data.estado === 'running') {
          boxRes.classList.add('hidden');
        }

        // Actualizar logs del terminal
        const logsBox = document.getElementById('telemetry-logs');
        if (data.actividad_reciente && data.actividad_reciente.length > 0) {
          const contenidoHtml = data.actividad_reciente.map(item => {
            let colorClase = 'text-slate-300';
            if (item.mensaje.includes('✓') || item.mensaje.includes('exitoso') || item.mensaje.includes('finalizado')) {
              colorClase = 'text-emerald-400 font-medium';
            } else if (item.mensaje.includes('⚠️') || item.mensaje.includes('Error')) {
              colorClase = 'text-rose-400 font-bold';
            } else if (item.mensaje.includes('Iniciando') || item.mensaje.includes('Explorando')) {
              colorClase = 'text-sky-300 font-semibold';
            }
            return `<div class="flex items-start space-x-2 py-0.5">
              <span class="text-slate-500 shrink-0 font-mono">[${item.hora}]</span>
              <span class="${colorClase}">${item.mensaje}</span>
            </div>`;
          }).join('');

          logsBox.innerHTML = contenidoHtml;
          if (autoScroll) {
            logsBox.scrollTop = logsBox.scrollHeight;
          }
        }
      } catch (err) {
        console.warn('Error consultando status:', err);
      }
    }

    function reportarErrorEnConsola(motivo) {
      const badgeDot = document.getElementById('telemetry-badge-dot');
      const badgeText = document.getElementById('telemetry-badge-text');
      const statusMsg = document.getElementById('telemetry-status-message');
      const logsBox = document.getElementById('telemetry-logs');

      if (badgeDot) badgeDot.className = 'w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse';
      if (badgeText) {
        badgeText.textContent = 'Error';
        badgeText.className = 'text-xs font-bold text-rose-600 uppercase tracking-wider';
      }

      if (statusMsg) {
        statusMsg.textContent = motivo;
        statusMsg.className = 'text-rose-600 truncate max-w-[280px] font-semibold';
      }

      if (logsBox) {
        const hora = new Date().toTimeString().split(' ')[0];
        const logHtml = `<div class="flex items-start space-x-2 bg-rose-950/40 p-1.5 rounded border border-rose-800/50 my-1">
          <span class="text-rose-400 shrink-0 font-bold">[${hora}]</span>
          <span class="text-rose-300 font-bold">⚠️ ${motivo}</span>
        </div>`;

        if (logsBox.innerHTML.includes('Listo. Las acciones')) {
          logsBox.innerHTML = '';
        }
        logsBox.innerHTML += logHtml;
        if (autoScroll) {
          logsBox.scrollTop = logsBox.scrollHeight;
        }
      }
      showToast(motivo, 'error');
    }

    // Abrir Diálogo de Carpeta Nativo en PC (Tkinter)
    async function abrirDialogoCarpetaPC() {
      const btn = document.getElementById('btn-examinar-pc');
      if (btn) btn.disabled = true;
      showToast('Abriendo explorador de archivos en tu PC...', 'info');

      try {
        const res = await fetch('/api/seleccionar-carpeta-dialog', { method: 'POST' });
        const data = await res.json();
        if (data.ruta) {
          const inputEl = document.getElementById('input-ruta-carpeta');
          if (inputEl) inputEl.value = data.ruta;
          showToast('Carpeta seleccionada: ' + data.ruta, 'success');
          // Iniciar escaneo automáticamente con la ruta seleccionada
          iniciarEscaneo(data.ruta);
        } else {
          showToast('Selección de carpeta cancelada', 'info');
        }
      } catch (err) {
        showToast('Error al abrir diálogo de selección: ' + (err.message || err), 'error');
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    // Manejar Selección de Carpeta desde el Navegador (webkitdirectory)
    async function manejarCarpetaWeb(event) {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      const extensionesSoportadas = ['.xlsx', '.csv', '.docx', '.pdf', '.txt', '.ods', '.tsv', '.vcf', '.xls', '.md', '.log'];
      const archivosValidos = Array.from(files).filter(f => {
        const ext = '.' + f.name.split('.').pop().toLowerCase();
        return extensionesSoportadas.includes(ext) && !f.name.startsWith('~$') && !f.name.startsWith('.');
      });

      const primeraRuta = files[0].webkitRelativePath || files[0].name;
      const nombreCarpeta = primeraRuta.split('/')[0] || 'Carpeta Web';

      // Mostrar en la consola de telemetría de inmediato
      const logsBox = document.getElementById('telemetry-logs');
      const hora = new Date().toTimeString().split(' ')[0];
      if (logsBox) {
        if (logsBox.innerHTML.includes('Listo. Las acciones')) {
          logsBox.innerHTML = '';
        }
        const listaNombres = archivosValidos.map(f => f.webkitRelativePath || f.name).join(', ');
        logsBox.innerHTML += `
          <div class="flex items-start space-x-2 bg-blue-950/40 p-1.5 rounded border border-blue-800/50 my-1">
            <span class="text-blue-400 shrink-0 font-bold">[${hora}]</span>
            <span class="text-blue-300 font-semibold">Explorando subcarpetas en: ${nombreCarpeta}</span>
          </div>
          <div class="flex items-start space-x-2 bg-slate-800/60 p-1.5 rounded border border-slate-700 my-1">
            <span class="text-slate-400 shrink-0 font-bold">[${hora}]</span>
            <span class="text-slate-200">Archivos encontrados (${archivosValidos.length}): ${listaNombres || 'Ningún archivo soportado'}</span>
          </div>
        `;
        if (autoScroll) {
          logsBox.scrollTop = logsBox.scrollHeight;
        }
      }

      if (archivosValidos.length === 0) {
        showToast('No se encontraron archivos soportados (.xlsx, .csv, .docx, .pdf, .txt, .ods, .tsv, .vcf)', 'error');
        return;
      }

      showToast(`Subiendo ${archivosValidos.length} archivo(s) de '${nombreCarpeta}'...`, 'info');
      await subirArchivos(archivosValidos);
      document.getElementById('input-ruta-carpeta').value = '../Data/Crudos';
      iniciarEscaneo('../Data/Crudos');
    }

    // Iniciar Escaneo de Carpeta
    async function iniciarEscaneo(rutaCustom) {
      const inputEl = document.getElementById('input-ruta-carpeta');
      let ruta = (rutaCustom !== undefined ? rutaCustom : inputEl.value).trim();

      // Limpiar comillas si el usuario las pegó en el input
      ruta = ruta.replace(/^["']+|["']+$/g, '').trim();

      if (!ruta) {
        reportarErrorEnConsola("El campo de ruta no puede estar vacío. Indicá una carpeta local o de Google Drive.");
        return;
      }
      showToast('Iniciando escaneo en ' + ruta + '...', 'info');

      try {
        const res = await fetch('/api/scan-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ruta })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          const motivo = data.error || 'Error al iniciar escaneo en la carpeta indicada.';
          reportarErrorEnConsola(motivo);
          fetchStatus();
          return;
        }
        showToast(data.mensaje || 'Escaneo en curso', 'success');
        fetchStatus();
      } catch (err) {
        reportarErrorEnConsola(err.message || 'Error de conexión con el motor al intentar escanear.');
      }
    }

    // Deduplicar Base
    async function deduplicarBase() {
      showToast('Iniciando deduplicación masiva...', 'info');
      try {
        const res = await fetch('/api/deduplicar', { method: 'POST' });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Error en deduplicación');
        }
        showToast('Deduplicación en segundo plano', 'success');
        fetchStatus();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    // Manejo de Drag & Drop y Subida de Archivos
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');

    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('border-slate-500', 'bg-slate-100/60');
    });

    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-slate-500', 'bg-slate-100/60');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-slate-500', 'bg-slate-100/60');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        subirArchivos(e.dataTransfer.files);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        subirArchivos(e.target.files);
      }
    });

    async function subirArchivos(files) {
      const formData = new FormData();
      Array.from(files).forEach(f => formData.append('files', f));

      showToast('Subiendo ' + files.length + ' archivo(s)...', 'info');

      try {
        const res = await fetch('/api/upload-files', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Error al subir');
        }
        showToast(data.mensaje || 'Archivos guardados en Data/Crudos', 'success');

        const contenedor = document.getElementById('archivos-subidos-contenedor');
        const lista = document.getElementById('lista-archivos-subidos');
        contenedor.classList.remove('hidden');

        Array.from(files).forEach(f => {
          const item = document.createElement('div');
          item.className = 'flex items-center justify-between text-slate-700 py-0.5 border-b border-slate-100 last:border-0';
          item.innerHTML = '<span class="font-mono truncate max-w-[200px]">' + f.name + '</span><span class="text-[10px] text-emerald-600 font-semibold">✓ Guardado</span>';
          lista.prepend(item);
        });

        fetchStatus();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    document.getElementById('check-autoscroll').addEventListener('change', (e) => {
      autoScroll = e.target.checked;
    });

    function actualizarTodo() {
      fetchCalidad();
      fetchStatus();
      fetchBackups();
      showToast('Telemetría actualizada', 'info');
    }

    // Sincronización Segura y Backup
    let cuentaSyncSeleccionada = 'sindy';
    let historialAbierto = false;

    async function fetchBackups() {
      try {
        const res = await fetch('/api/backups-lista');
        const data = await res.json();
        if (!data.ok) return;

        const backups = data.backups || [];
        const lblUltimo = document.getElementById('lbl-ultimo-backup');
        const txtToggle = document.getElementById('txt-toggle-historial');
        const listaHistorial = document.getElementById('lista-historial-backups');

        if (txtToggle) txtToggle.textContent = `Historial (${backups.length})`;

        if (lblUltimo) {
          if (backups.length > 0) {
            lblUltimo.textContent = `${backups[0].nombre} (${backups[0].tamano_formateado} - ${backups[0].fecha})`;
          } else {
            lblUltimo.textContent = 'Ninguno generado aún';
          }
        }

        if (listaHistorial) {
          listaHistorial.innerHTML = '';
          if (backups.length === 0) {
            listaHistorial.innerHTML = '<div class="text-slate-400 italic py-1">No hay snapshots creados todavía.</div>';
          } else {
            backups.forEach(b => {
              const item = document.createElement('div');
              item.className = 'flex items-center justify-between py-1 border-b border-slate-200/60 last:border-0 font-mono text-[11px]';
              item.innerHTML = `
                <span class="text-slate-700 truncate max-w-[280px]">💾 ${b.nombre}</span>
                <div class="flex items-center space-x-2 text-slate-500">
                  <span>${b.tamano_formateado}</span>
                  <span>·</span>
                  <span>${b.fecha}</span>
                </div>
              `;
              listaHistorial.appendChild(item);
            });
          }
        }
      } catch (err) {
        console.error('Error cargando backups:', err);
      }
    }

    function toggleHistorialBackups() {
      historialAbierto = !historialAbierto;
      const panel = document.getElementById('panel-historial-backups');
      const icon = document.getElementById('icon-toggle-historial');

      if (historialAbierto) {
        panel.classList.remove('hidden');
        icon.classList.add('rotate-180');
      } else {
        panel.classList.add('hidden');
        icon.classList.remove('rotate-180');
      }
    }

    async function generarBackupDrive() {
      const btn = document.getElementById('btn-backup-drive');
      btn.disabled = true;
      showToast('Generando snapshot histórico y sincronizando a Drive...', 'info');

      try {
        const res = await fetch('/api/backup-drive', { method: 'POST' });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Error creando backup');

        showToast(`Snapshot generado: ${data.nombre} (${data.tamano_formateado})`, 'success');
        fetchBackups();
        fetchStatus();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    }

    async function abrirModalSync(cuenta) {
      cuentaSyncSeleccionada = cuenta;
      const modal = document.getElementById('modal-sync');
      const sub = document.getElementById('modal-subtitulo');
      const preview = document.getElementById('modal-contenido-preview');
      const btnConfirmar = document.getElementById('btn-confirmar-sync-real');

      sub.textContent = cuenta === 'sindy' ? 'Cuenta: Sindy (Regente Maestra)' : 'Cuenta: Pablo (Jerarquía Sindy Activa)';
      btnConfirmar.disabled = true;
      modal.classList.remove('hidden');

      preview.innerHTML = `
        <div class="flex items-center justify-center py-6 text-slate-400 space-x-2">
          <svg class="animate-spin w-5 h-5 text-slate-900" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <span class="text-xs font-medium">Analizando diferencias con Google Contacts (${cuenta.toUpperCase()})...</span>
        </div>
      `;

      try {
        const res = await fetch('/api/sync-google-push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cuenta: cuenta, dry_run: true })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Fallo en la simulación');

        preview.innerHTML = `
          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="bg-emerald-50 border border-emerald-100 p-2.5 rounded-xl">
              <span class="block text-xl font-extrabold text-emerald-600 font-mono">${data.altas_estimadas}</span>
              <span class="text-[10px] text-emerald-800 font-semibold uppercase">Altas Nuevas</span>
            </div>
            <div class="bg-sky-50 border border-sky-100 p-2.5 rounded-xl">
              <span class="block text-xl font-extrabold text-sky-700 font-mono">${data.modificaciones_estimadas}</span>
              <span class="text-[10px] text-sky-800 font-semibold uppercase">Actualizaciones</span>
            </div>
            <div class="bg-slate-50 border border-slate-200 p-2.5 rounded-xl">
              <span class="block text-xl font-extrabold text-slate-600 font-mono">${data.sin_cambios}</span>
              <span class="text-[10px] text-slate-600 font-semibold uppercase">Sin Cambios</span>
            </div>
          </div>
          <div class="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-1">
            <div><strong>Gobernanza activa:</strong> ${cuenta === 'sindy' ? 'Prioridad Regente Sindy sobre la cuenta principal.' : 'Campos unificados con prevalencia maestra de Sindy.'}</div>
            <div class="text-slate-400">Total analizado: ${data.total_canónicos || data.total_canónicos === 0 ? data.total_canónicos : data['total_canónicos'] || 0} contactos canónicos.</div>
          </div>
        `;
        btnConfirmar.disabled = false;
      } catch (err) {
        preview.innerHTML = `<div class="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">${err.message}</div>`;
      }
    }

    function cerrarModalSync() {
      document.getElementById('modal-sync').classList.add('hidden');
    }

    async function ejecutarSyncReal() {
      const btnConfirmar = document.getElementById('btn-confirmar-sync-real');
      btnConfirmar.disabled = true;
      btnConfirmar.textContent = 'Sincronizando...';

      try {
        const res = await fetch('/api/sync-google-push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cuenta: cuentaSyncSeleccionada, dry_run: false })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Fallo al sincronizar');

        cerrarModalSync();
        showToast(`Sincronización a Google (${cuentaSyncSeleccionada.toUpperCase()}) completada con éxito`, 'success');
        fetchCalidad();
        fetchStatus();
        fetchBackups();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btnConfirmar.disabled = false;
        btnConfirmar.textContent = 'Confirmar Sincronización Real';
      }
    }

    async function ejecutarRollback() {
      const confirma = confirm("¿Deseas deshacer la última sincronización en Google Contacts? Se restaurará el estado previo de cada contacto modificado y se eliminarán las altas recientes mediante el manifiesto.");
      if (!confirma) return;

      showToast('Ejecutando rollback en Google People API...', 'info');

      try {
        const res = await fetch('/api/sync-undo', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Error al ejecutar rollback');

        if (data.ya_revertido) {
          showToast(data.mensaje || 'Este manifiesto ya había sido revertido.', 'info');
        } else {
          showToast(`Rollback completado: ${data.restaurados} restaurados, ${data.eliminados} eliminados`, 'success');
        }
        fetchStatus();
        fetchBackups();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    // Inicialización y Polling
    fetchCalidad();
    fetchStatus();
    fetchBackups();
    setInterval(() => {
      fetchStatus();
      if (!isScanning) fetchCalidad();
    }, 3500);
  </script>

  <!-- MODAL DE BIENVENIDA / ONBOARDING (PRIMER USO) -->
  <div id="modal-bienvenida" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 hidden">
    <div class="bg-white rounded-2xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in duration-200">
      <div class="flex items-center justify-between pb-3 border-b border-slate-100">
        <div class="flex items-center space-x-2.5">
          <div class="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold">✨</div>
          <h3 class="text-lg font-bold text-slate-900">Bienvenido a MejoraContactos</h3>
        </div>
        <button onclick="cerrarBienvenida()" class="text-slate-400 hover:text-slate-600 text-xl font-bold p-1">&times;</button>
      </div>
      
      <p class="text-sm text-slate-600 leading-relaxed">
        Este es el centro de control para transformar tu libreta de contactos desordenada en una base de datos única, limpia y confiable para todo tu ecosistema (MejoraCRM, MejoraWS).
      </p>

      <div class="space-y-3.5">
        <div class="flex items-start space-x-3 bg-slate-50 p-3 rounded-xl border border-slate-200/60">
          <span class="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</span>
          <div>
            <h4 class="text-xs font-bold text-slate-900">Cargá tus fuentes</h4>
            <p class="text-[11px] text-slate-600">Conectá tus cuentas de Google Contacts o arrastrá archivos Excel, CSV o VCF desde tu PC.</p>
          </div>
        </div>

        <div class="flex items-start space-x-3 bg-slate-50 p-3 rounded-xl border border-slate-200/60">
          <span class="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</span>
          <div>
            <h4 class="text-xs font-bold text-slate-900">El motor limpia y consolida</h4>
            <p class="text-[11px] text-slate-600">Detecta números móviles internacionales, descarta filas vacías o códigos SMS y une duplicados evidentes.</p>
          </div>
        </div>

        <div class="flex items-start space-x-3 bg-slate-50 p-3 rounded-xl border border-slate-200/60">
          <span class="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</span>
          <div>
            <h4 class="text-xs font-bold text-slate-900">Resolvé dudas con un clic</h4>
            <p class="text-[11px] text-slate-600">Si hay dos contactos similares (zona gris), los comparás lado a lado y decidís con un botón si son la misma persona.</p>
          </div>
        </div>

        <div class="flex items-start space-x-3 bg-slate-50 p-3 rounded-xl border border-slate-200/60">
          <span class="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">4</span>
          <div>
            <h4 class="text-xs font-bold text-slate-900">Exportá y sincronizá con seguridad</h4>
            <p class="text-[11px] text-slate-600">Descargá tus listas maestras para WhatsApp y sincronizá a Google Contacts con respaldo automático previo.</p>
          </div>
        </div>
      </div>

      <div class="pt-2 flex items-center justify-between border-t border-slate-100">
        <label class="flex items-center space-x-2 text-xs text-slate-500 cursor-pointer">
          <input type="checkbox" id="chk-no-mostrar-mas" class="rounded text-slate-900 focus:ring-slate-900">
          <span>No volver a mostrar al iniciar</span>
        </label>
        <button onclick="cerrarBienvenida()" class="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors shadow-sm">
          ¡Comenzar ahora! &rarr;
        </button>
      </div>
    </div>
  </div>

  <!-- MODAL DE REVISIÓN LADO A LADO DE CASOS DUDOSOS -->
  <div id="modal-revisar-dudosos" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 hidden">
    <div class="bg-white rounded-2xl max-w-3xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in duration-200">
      <div class="flex items-center justify-between pb-3 border-b border-slate-100">
        <div>
          <h3 class="text-lg font-bold text-slate-900">Revisión de Caso Ambiguo</h3>
          <p class="text-xs text-slate-500">¿Estos dos registros pertenecen a la misma persona o a personas distintas?</p>
        </div>
        <button onclick="cerrarRevisarDudosos()" class="text-slate-400 hover:text-slate-600 text-xl font-bold p-1">&times;</button>
      </div>

      <div id="contenedor-comparacion-dudosos" class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Renderizado dinámico de contacto A y B -->
      </div>

      <div class="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
        <button onclick="resolverDudoso('separar')" class="w-full sm:w-auto px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors border border-slate-200">
          ❌ Son personas distintas
        </button>
        <button onclick="resolverDudoso('ignorar')" class="w-full sm:w-auto px-4 py-2.5 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-xl transition-colors border border-amber-200">
          ⏳ No estoy seguro (posponer)
        </button>
        <button onclick="resolverDudoso('fusionar')" class="w-full sm:w-auto px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-sm">
          ✅ Son la misma persona (Fusionar)
        </button>
      </div>
    </div>
  </div>

</body>
</html>
"""


def abrir_dialogo_carpeta_tkinter() -> str | None:
    """Abre el diálogo nativo de selección de carpetas con tkinter en un proceso desacoplado
    para garantizar seguridad de hilos en Windows (evita conflictos STA/Tcl con el thread de Flask).
    Devuelve la ruta absoluta normalizada o None si el usuario cancela."""
    script = (
        "import tkinter as tk\n"
        "from tkinter import filedialog\n"
        "import sys, os\n"
        "try:\n"
        "    root = tk.Tk()\n"
        "    root.withdraw()\n"
        "    root.attributes('-topmost', True)\n"
        "    root.focus_force()\n"
        "    ruta = filedialog.askdirectory(title='Seleccionar carpeta para MejoraContactos')\n"
        "    root.destroy()\n"
        "    if ruta and str(ruta).strip():\n"
        "        sys.stdout.write(os.path.normpath(os.path.abspath(ruta.strip())))\n"
        "except Exception:\n"
        "    pass\n"
    )
    try:
        resultado = subprocess.run(
            [sys.executable, "-c", script],
            capture_output=True,
            text=True,
            timeout=300,
        )
        ruta = resultado.stdout.strip()
        if not ruta:
            return None
        return os.path.normpath(os.path.abspath(ruta)).replace("\\", "/")
    except Exception as exc:
        logger.warning("Error abriendo diálogo de carpeta tkinter: %s", exc)
        return None


# ----------------------------------------------------------------------
# 4. REGISTRO DE RUTAS API Y CONTROLADORES
# ----------------------------------------------------------------------

def registrar_rutas_scanner(app: Flask, config: Config) -> None:
    """Registra todos los endpoints del centro de control en Flask."""
    if "dashboard_ui" in app.view_functions:
        return

    # 1. UI HTML5 Limpia en GET /
    @app.get("/")
    def dashboard_ui():
        return render_template_string(_HTML_DASHBOARD)

    # 1b. Diálogo Nativo de Selección de Carpeta en PC
    @app.post("/api/seleccionar-carpeta-dialog")
    def api_seleccionar_carpeta_dialog():
        ruta = abrir_dialogo_carpeta_tkinter()
        if ruta:
            ruta_norm = os.path.normpath(os.path.abspath(ruta)).replace("\\", "/")
            return jsonify({"ruta": ruta_norm})
        return jsonify({"ruta": None})

    # 2. Escanear Carpeta
    @app.post("/api/scan-folder")
    def api_scan_folder():
        datos = request.get_json(silent=True) or {}
        ruta_raw = datos.get("ruta") or datos.get("folder") or datos.get("path")
        if not ruta_raw or not str(ruta_raw).strip():
            ruta_raw = str(config.rutas.carpeta_raiz)

        # Normalización de ruta: limpiar comillas simples/dobles y normalizar barras
        ruta_limpia = str(ruta_raw).strip("\"' ")
        ruta_norm = os.path.normpath(os.path.expanduser(ruta_limpia)).replace("\\", "/")

        exito, mensaje = scan_manager.iniciar_escaneo(ruta_norm, config)
        if not exito:
            return jsonify({"ok": False, "error": mensaje}), 400

        return jsonify({
            "ok": True,
            "mensaje": mensaje,
            "ruta": ruta_norm,
        })

    # 3. Subir Archivos a Data/Crudos
    @app.post("/api/upload-files")
    def api_upload_files():
        archivos = request.files.getlist("files") or request.files.getlist("file")
        if not archivos:
            return jsonify({"ok": False, "error": "No se enviaron archivos en la petición"}), 400

        destino_dir = config.rutas.carpeta_raiz
        destino_dir.mkdir(parents=True, exist_ok=True)

        guardados: list[str] = []
        extensiones_validas = {
            ".xlsx", ".xls", ".csv", ".tsv", ".ods",
            ".docx", ".pdf", ".txt", ".md", ".log", ".vcf", ".json"
        }

        for arch in archivos:
            if not arch.filename:
                continue
            nombre_limpio = secure_filename(arch.filename)
            if not nombre_limpio:
                nombre_limpio = f"archivo_{int(time.time())}_{arch.filename}"

            ext = Path(nombre_limpio).suffix.lower()
            if ext not in extensiones_validas:
                continue

            destino_path = destino_dir / nombre_limpio
            arch.save(destino_path)
            guardados.append(nombre_limpio)
            scan_manager.agregar_log(f"📥 Archivo subido: {nombre_limpio} ({destino_dir.name}/)")

        if not guardados:
            return jsonify({
                "ok": False,
                "error": "Ningún archivo tenía formato compatible (.xlsx, .csv, .docx, .pdf, .txt)",
            }), 400

        return jsonify({
            "ok": True,
            "mensaje": f"{len(guardados)} archivo(s) guardado(s) exitosamente en '{destino_dir.name}'",
            "archivos": guardados,
            "total_subidos": len(guardados),
            "carpeta_destino": str(destino_dir),
        })

    # 4. Estado y Telemetría en Vivo
    @app.get("/api/scan-status")
    def api_scan_status():
        return jsonify(scan_manager.get_status())

    # 5. Métricas de Calidad
    @app.get("/api/calidad-resumen")
    def api_calidad_resumen():
        return jsonify(calcular_resumen_calidad(config))

    # 6. Deduplicación Masiva en Background
    @app.post("/api/deduplicar")
    def api_deduplicar():
        exito, msg = scan_manager.iniciar_deduplicacion(config)
        if not exito:
            return jsonify({"ok": False, "error": msg}), 400
        return jsonify({"ok": True, "mensaje": msg})

    # 7. Exportación y Descargas Directas
    @app.post("/api/exportar")
    def api_exportar():
        conn = None
        try:
            from motor.export import exportar_lista_maestra, exportar_whatsapp_csv
            conn = conectar(config.rutas.base_sqlite)
            r_maestra = exportar_lista_maestra(config, conn)
            r_wa = exportar_whatsapp_csv(config, conn)
            scan_manager.agregar_log(f"Listas exportadas: {r_maestra.name} y {r_wa.name}")
            return jsonify({
                "ok": True,
                "mensaje": f"Exportado exitosamente: {r_maestra.name} y {r_wa.name}",
                "archivos": [r_maestra.name, r_wa.name],
            })
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 500
        finally:
            if conn:
                conn.close()

    @app.get("/api/descargar/lista-maestra")
    def api_descargar_lista_maestra():
        p = config.rutas.carpeta_salida / "lista-maestra.xlsx"
        if not p.exists():
            conn = conectar(config.rutas.base_sqlite)
            try:
                from motor.export import exportar_lista_maestra
                exportar_lista_maestra(config, conn)
            finally:
                conn.close()
        return send_file(p, as_attachment=True, download_name="lista-maestra.xlsx")

    @app.get("/api/descargar/whatsapp")
    def api_descargar_whatsapp():
        p = config.rutas.carpeta_salida / "contactos-whatsapp.csv"
        if not p.exists():
            conn = conectar(config.rutas.base_sqlite)
            try:
                from motor.export import exportar_whatsapp_csv
                exportar_whatsapp_csv(config, conn)
            finally:
                conn.close()
        return send_file(p, as_attachment=True, download_name="contactos-whatsapp.csv")

    # 8. Backup Histórico en Drive y Local
    @app.post("/api/backup-drive")
    def api_backup_drive():
        try:
            from motor.sync.backup import crear_snapshot_historico
            datos = request.get_json(silent=True) or {}
            destino_drive = datos.get("destino_drive_path")
            res = crear_snapshot_historico(config, destino_drive_path=destino_drive)
            scan_manager.agregar_log(f"💾 Snapshot generado: {res['nombre']} ({res['tamano_formateado']})")
            if res.get("ruta_drive"):
                scan_manager.agregar_log(f"☁️ Snapshot copiado a Drive: {res['ruta_drive']}")
            return jsonify(res)
        except Exception as exc:
            logger.exception("Error generando backup histórico: %s", exc)
            return jsonify({"ok": False, "error": str(exc)}), 500

    @app.get("/api/backups-lista")
    def api_backups_lista():
        try:
            from motor.sync.backup import listar_backups
            from motor.sync.google_sync import obtener_ultimo_manifiesto
            backups = listar_backups(config)
            ultimo_manifest = obtener_ultimo_manifiesto(config)
            return jsonify({
                "ok": True,
                "backups": backups,
                "ultimo_manifiesto": ultimo_manifest,
            })
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 500

    # 9. Sincronización Segura a Google People API
    @app.post("/api/sync-google-push")
    def api_sync_google_push():
        datos = request.get_json(silent=True) or {}
        cuenta = str(datos.get("cuenta", "sindy")).strip().lower()
        dry_run = bool(datos.get("dry_run", False))

        if cuenta not in ("sindy", "pablo"):
            return jsonify({"ok": False, "error": f"Cuenta '{cuenta}' no reconocida. Use 'sindy' o 'pablo'."}), 400

        backup_preventivo_info = None
        # Si es sincronización real, ejecutar backup preventivo primero
        if not dry_run:
            try:
                from motor.sync.backup import crear_snapshot_historico
                backup_preventivo_info = crear_snapshot_historico(config)
                scan_manager.agregar_log(f"🛡️ Backup preventivo automático creado: {backup_preventivo_info['nombre']}")
            except Exception as exc:
                logger.warning("Fallo en backup preventivo previo a sync: %s", exc)

        try:
            from motor.sync.google_sync import sincronizar_hacia_google
            conn = conectar(config.rutas.base_sqlite)
            try:
                res = sincronizar_hacia_google(cuenta, config, conn=conn, dry_run=dry_run)
            finally:
                conn.close()

            if dry_run:
                scan_manager.agregar_log(f"🔍 Simulación sync Google ({cuenta.upper()}): {res['altas_estimadas']} altas, {res['modificaciones_estimadas']} cambios")
            else:
                scan_manager.agregar_log(f"🚀 Sincronización Google ({cuenta.upper()}) completada: {res['altas_ejecutadas']} altas, {res['modificaciones_ejecutadas']} modificaciones")

            res["backup_preventivo"] = backup_preventivo_info
            return jsonify(res)
        except Exception as exc:
            logger.exception("Error en sincronización hacia Google: %s", exc)
            return jsonify({"ok": False, "error": str(exc)}), 500

    # 10. Revertir Última Sincronización (Rollback Undo)
    @app.post("/api/sync-undo")
    def api_sync_undo():
        datos = request.get_json(silent=True) or {}
        manifest_path = datos.get("manifest_path")
        try:
            from motor.sync.google_sync import deshacer_sincronizacion
            res = deshacer_sincronizacion(config, manifest_path=manifest_path)
            if res.get("ok") and not res.get("ya_revertido"):
                scan_manager.agregar_log(f"↩️ Rollback ejecutado ({res.get('manifest_nombre')}): {res.get('restaurados', 0)} restaurados, {res.get('eliminados', 0)} eliminados")
            return jsonify(res)
        except Exception as exc:
            logger.exception("Error en rollback: %s", exc)
            return jsonify({"ok": False, "error": str(exc)}), 500


# ----------------------------------------------------------------------
# 5. CREACIÓN Y RUNNER DEL SERVIDOR
# ----------------------------------------------------------------------

def crear_servidor(config: Config | None = None, conn: sqlite3.Connection | None = None) -> Flask:
    if config is None:
        config = cargar_config("config.yaml")

    app = Flask(__name__)

    # CORS para orígenes locales
    @app.after_request
    def _cors(respuesta):
        origen = request.headers.get("Origin", "")
        if origen.startswith("http://localhost:") or origen.startswith("http://127.0.0.1:"):
            respuesta.headers["Access-Control-Allow-Origin"] = origen
            respuesta.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, PUT, DELETE"
            respuesta.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        return respuesta

    @app.route("/api/<path:_ruta>", methods=["OPTIONS"])
    def _api_preflight(_ruta):
        return "", 204

    # Registrar rutas del centro de control y scanner
    registrar_rutas_scanner(app, config)

    # Si se pasa o existe conexión, registrar también endpoints adicionales si se requieren
    if conn is None:
        try:
            conn = conectar(config.rutas.base_sqlite)
        except Exception:
            conn = None

    if conn is not None:
        from motor.api import registrar_rutas_api
        registrar_rutas_api(app, config, conn)

    return app


def iniciar_servidor(puerto: int | None = None) -> None:
    config = cargar_config("config.yaml")
    port = puerto or config.revisor.puerto or 5000

    app = crear_servidor(config)

    print("=" * 65)
    print(f"  [OK] MejoraContactos — Centro de Control iniciado en el puerto {port}")
    print("=" * 65)
    print(f"  * URL Web Directa:          http://127.0.0.1:{port}/")
    print(f"  * Estado y Calidad:         http://127.0.0.1:{port}/api/calidad-resumen")
    print(f"  * Telemetria en vivo:       http://127.0.0.1:{port}/api/scan-status")
    print(f"  * Descarga Lista Maestra:   http://127.0.0.1:{port}/api/descargar/lista-maestra")
    print(f"  * Descarga WhatsApp CSV:    http://127.0.0.1:{port}/api/descargar/whatsapp")
    print("=" * 65)

    app.run(host="0.0.0.0", port=port, threaded=True)


if __name__ == "__main__":
    puerto_arg = int(sys.argv[1]) if len(sys.argv) > 1 else None
    iniciar_servidor(puerto_arg)
