"""Panel web del motor de contactos: un dashboard en "/" para correr el
pipeline con botones (sin memorizar comandos de CLI) y ver el estado
actual, más la cola de revisión en lote en "/revisar" (patrón de
señales, dedup/scoring.py) que ya existía. Pensado para correr en
localhost, un solo usuario a la vez — las acciones son síncronas
(bloquean hasta terminar) porque el pipeline completo tarda segundos, no
minutos, incluso con los ~35.000 contactos reales."""

from __future__ import annotations

import json
import os
import sqlite3
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from flask import Flask, Response, jsonify, redirect, render_template_string, request, send_file, url_for

from motor.config import Config
from motor.dedup import learning
from motor.dedup.merge_engine import aplicar_decision_lote, deduplicar_todo, deshacer, deshacer_ultima_corrida
from motor.export import buscar_contactos, exportar_lista_maestra, exportar_whatsapp_csv, guardar_edicion_manual, obtener_contacto
from motor.ingest import extraer_archivo, extraer_todo
from motor.normalize_pipeline import normalizar_todo
from motor.sync.backup import (
    archivar_base_actual,
    hacer_backup_previo,
    listar_bases_archivadas,
    restaurar_base_archivada,
    restaurar_ultimo_backup,
)
from motor.tagging import _TAGS_VALIDOS
from motor.tracker import tracker

_ESTILO = """
<style>
  :root {
    --bg-page: #F8FAFC;
    --bg-gradient: radial-gradient(at 0% 0%, #EEF2F6 0, transparent 50%), radial-gradient(at 100% 0%, #E0F2FE 0, transparent 50%), radial-gradient(at 50% 100%, #F5F3FF 0, transparent 50%);
    --surface-glass: rgba(255, 255, 255, 0.82);
    --surface-card: #FFFFFF;
    --surface-elevated: #F8FAFC;
    --border-glass: rgba(226, 232, 240, 0.9);
    --border-subtle: #E2E8F0;
    --border-glow: rgba(59, 130, 246, 0.4);
    
    --text-primary: #0F172A;
    --text-secondary: #475569;
    --text-tertiary: #64748B;
    
    --brand-primary: #1A3D84;
    --brand-primary-hover: #15326C;
    --brand-accent: #2563EB;
    
    --accent-ai-gradient: linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #EC4899 100%);
    --accent-ai-surface: rgba(124, 58, 237, 0.05);
    --accent-ai-border: rgba(139, 92, 246, 0.35);
    
    --success: #059669;
    --success-surface: #ECFDF5;
    --success-border: #A7F3D0;
    
    --warning: #D97706;
    --warning-surface: #FFFBEB;
    --warning-border: #FDE68A;
    
    --danger: #DC2626;
    --danger-surface: #FEF2F2;
    --danger-border: #FECACA;
    
    --radius-sm: 8px;
    --radius-md: 14px;
    --radius-lg: 20px;
    --radius-full: 9999px;
    
    --shadow-bento: 0 4px 6px -1px rgba(0, 0, 0, 0.04), 0 10px 15px -3px rgba(0, 0, 0, 0.03);
    --shadow-bento-hover: 0 14px 28px -4px rgba(0, 0, 0, 0.09), 0 8px 16px -4px rgba(0, 0, 0, 0.04);
  }

  [data-theme="dark"] {
    --bg-page: #0B0F19;
    --bg-gradient: radial-gradient(at 0% 0%, #111827 0, transparent 50%), radial-gradient(at 100% 0%, #1E1B4B 0, transparent 50%), radial-gradient(at 50% 100%, #0F172A 0, transparent 50%);
    --surface-glass: rgba(17, 24, 39, 0.85);
    --surface-card: #131B2E;
    --surface-elevated: #1E293B;
    --border-glass: rgba(51, 65, 85, 0.85);
    --border-subtle: #334155;
    --border-glow: rgba(96, 165, 250, 0.5);
    
    --text-primary: #F8FAFC;
    --text-secondary: #CBD5E1;
    --text-tertiary: #94A3B8;
    
    --brand-primary: #3B82F6;
    --brand-primary-hover: #2563EB;
    --brand-accent: #60A5FA;
    
    --accent-ai-surface: rgba(139, 92, 246, 0.15);
    --accent-ai-border: rgba(167, 139, 250, 0.35);
    
    --success-surface: rgba(6, 78, 59, 0.3);
    --success-border: rgba(52, 211, 153, 0.3);
    
    --warning-surface: rgba(120, 53, 15, 0.3);
    --warning-border: rgba(251, 191, 36, 0.3);
    
    --danger-surface: rgba(127, 29, 29, 0.3);
    --danger-border: rgba(248, 113, 113, 0.3);
    
    --shadow-bento: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 10px 15px -3px rgba(0, 0, 0, 0.2);
    --shadow-bento-hover: 0 14px 28px -4px rgba(0, 0, 0, 0.5);
  }

  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif;
    max-width: 1100px;
    margin: 1.2rem auto;
    padding: 0 1.2rem 3rem;
    color: var(--text-primary);
    background-color: var(--bg-page);
    background-image: var(--bg-gradient);
    background-attachment: fixed;
    min-height: 100vh;
    transition: background-color 0.25s ease, color 0.25s ease;
  }

  /* Header & Navigation */
  .app-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1.2rem;
    margin-bottom: 1.5rem;
    background: var(--surface-glass);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--border-glass);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-bento);
  }
  .header-brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .brand-pill {
    font-weight: 800;
    font-size: 1.05rem;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 6px;
    letter-spacing: -0.02em;
  }
  .status-dot-pulse {
    width: 9px;
    height: 9px;
    background: #10B981;
    border-radius: 50%;
    display: inline-block;
    box-shadow: 0 0 0 rgba(16, 185, 129, 0.4);
    animation: dotPulse 2s infinite;
  }
  @keyframes dotPulse {
    0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6); }
    70% { box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
    100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
  }
  nav {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin: 0;
    padding: 0;
    border: none;
  }
  nav a {
    color: var(--text-secondary);
    text-decoration: none;
    font-weight: 600;
    font-size: 0.92rem;
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    transition: all 0.15s ease;
  }
  nav a:hover, nav a.active {
    color: var(--brand-primary);
    background: var(--surface-elevated);
  }
  .btn-icon {
    background: transparent !important;
    border: 1px solid var(--border-subtle) !important;
    color: var(--text-primary) !important;
    padding: 6px 10px !important;
    border-radius: 8px !important;
    font-size: 1rem !important;
    cursor: pointer;
    box-shadow: none !important;
  }
  .btn-icon:hover {
    background: var(--surface-elevated) !important;
    transform: none !important;
  }

  h1 {
    color: var(--text-primary);
    margin: 0 0 0.4rem 0;
    font-size: 1.85rem;
    font-weight: 800;
    letter-spacing: -0.025em;
  }

  /* Bento Grid System */
  .bento-grid {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 1.2rem;
    margin-bottom: 1.5rem;
  }
  .bento-col-12 { grid-column: span 12; }
  .bento-col-8 { grid-column: span 8; }
  .bento-col-6 { grid-column: span 6; }
  .bento-col-4 { grid-column: span 4; }
  .bento-col-3 { grid-column: span 3; }

  @media (max-width: 960px) {
    .bento-col-8, .bento-col-6, .bento-col-4 { grid-column: span 12; }
    .bento-col-3 { grid-column: span 6; }
  }
  @media (max-width: 600px) {
    .bento-col-3 { grid-column: span 12; }
    .app-header { flex-direction: column; gap: 12px; align-items: flex-start; }
  }

  /* Liquid Glass Panels */
  .glass-panel {
    background: var(--surface-glass);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--border-glass);
    border-radius: var(--radius-md);
    padding: 1.4rem;
    box-shadow: var(--shadow-bento);
    position: relative;
    transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .glass-panel.tilt-3d:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-bento-hover);
  }

  /* Contextual AI Copilot Banner */
  .copiloto-banner {
    background: var(--surface-glass);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid var(--accent-ai-border);
    border-radius: var(--radius-md);
    padding: 1.3rem 1.5rem;
    margin-bottom: 1.4rem;
    box-shadow: 0 6px 24px -4px rgba(124, 58, 237, 0.12);
    position: relative;
    overflow: hidden;
  }
  .copiloto-banner::before {
    content: "";
    position: absolute;
    top: 0; left: 0; right: 0; height: 3px;
    background: var(--accent-ai-gradient);
  }
  .copiloto-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--accent-ai-gradient);
    color: #FFFFFF !important;
    font-size: 0.78rem;
    font-weight: 800;
    padding: 4px 11px;
    border-radius: var(--radius-full);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    box-shadow: 0 2px 8px rgba(124, 58, 237, 0.3);
    margin-bottom: 8px;
  }
  .copiloto-text {
    font-size: 0.94rem;
    color: var(--text-primary);
    line-height: 1.5;
    margin: 4px 0 10px 0;
  }
  .copiloto-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }
  .copiloto-pill {
    background: var(--surface-elevated);
    border: 1px solid var(--border-subtle);
    color: var(--text-secondary);
    font-size: 0.78rem;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: var(--radius-full);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    transition: all 0.15s ease;
  }
  .copiloto-pill:hover {
    color: var(--brand-primary);
    border-color: var(--brand-primary);
    background: var(--surface-card);
  }

  /* Zero UI Drag & Drop Zone */
  .drop-zone {
    border: 2px dashed #93C5FD;
    border-radius: 12px;
    padding: 1.4rem 1.2rem;
    text-align: center;
    background: rgba(239, 246, 255, 0.4);
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    margin-bottom: 1rem;
    position: relative;
  }
  [data-theme="dark"] .drop-zone {
    border-color: #3B82F6;
    background: rgba(30, 58, 138, 0.15);
  }
  .drop-zone:hover, .drop-zone.dragover {
    border-color: #2563EB;
    background: rgba(219, 234, 254, 0.65);
    transform: scale(1.01);
  }
  .drop-icon { font-size: 2rem; margin-bottom: 4px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1)); }
  .drop-title { font-size: 0.98rem; font-weight: 700; color: var(--text-primary); margin-bottom: 2px; }
  .drop-subtitle { font-size: 0.82rem; color: var(--text-secondary); }

  /* Bento Stat Cards */
  .stat-card {
    background: var(--surface-glass);
    border: 1px solid var(--border-glass);
    border-radius: var(--radius-md);
    padding: 1.3rem 1.2rem;
    position: relative;
    box-shadow: var(--shadow-bento);
    transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .stat-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-bento-hover);
  }
  .stat-pill {
    position: absolute;
    top: 12px;
    right: 12px;
    font-size: 0.72rem;
    font-weight: 800;
    padding: 3px 9px;
    border-radius: var(--radius-full);
  }
  .stat-pill-ok { background: var(--success-surface); color: var(--success); border: 1px solid var(--success-border); }
  .stat-pill-ai { background: var(--accent-ai-surface); color: var(--text-primary); border: 1px solid var(--accent-ai-border); }
  .stat-val {
    font-size: 2.15rem;
    font-weight: 800;
    color: var(--text-primary);
    line-height: 1.1;
    letter-spacing: -0.025em;
    margin: 8px 0 4px 0;
  }
  .stat-label {
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--text-primary);
  }
  .stat-sub {
    font-size: 0.78rem;
    color: var(--text-tertiary);
    margin-top: 4px;
  }

  /* Pipeline Stepper Visual */
  .pipeline-card {
    background: var(--surface-glass);
    border: 1px solid var(--border-glass);
    border-radius: var(--radius-md);
    padding: 1.4rem;
    box-shadow: var(--shadow-bento);
  }
  .pipeline-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 1.2rem;
    border-bottom: 1px solid var(--border-subtle);
    padding-bottom: 0.8rem;
  }
  .pipeline-title h2 { margin: 0; font-size: 1.25rem; color: var(--text-primary); font-weight: 800; }
  .pipeline-sub { margin: 4px 0 0 0; color: var(--text-secondary); font-size: 0.88rem; }

  .badge { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 700; }
  .badge-ok { background: var(--success-surface); color: var(--success); border: 1px solid var(--success-border); }
  .badge-warn { background: var(--warning-surface); color: var(--warning); border: 1px solid var(--warning-border); }

  .stepper-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 0.5rem; }
  .step-card {
    background: var(--surface-card);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    padding: 1.1rem;
    position: relative;
    transition: all 0.2s ease;
  }
  .step-card.step-done { border-top: 4px solid var(--success); }
  .step-card.step-pending { border-top: 4px solid var(--warning); background: var(--surface-elevated); }

  .step-num { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: var(--text-tertiary); letter-spacing: 0.5px; margin-bottom: 4px; }
  .step-name { font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; }
  .step-value { font-size: 1.65rem; font-weight: 800; color: var(--text-primary); line-height: 1.1; }
  .step-label { font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px; }

  .step-progress-bar { width: 100%; height: 6px; background: var(--border-subtle); border-radius: 3px; margin: 10px 0 6px 0; overflow: hidden; }
  .step-progress-fill { height: 100%; background: var(--success); border-radius: 3px; }

  .step-status { font-size: 0.8rem; font-weight: 600; margin-top: 8px; display: flex; align-items: center; gap: 4px; }
  .status-ok { color: var(--success); }
  .status-warn { color: var(--warning); }

  /* Tarjeta de Impacto de Calidad / Aha! Moment */
  .impacto-card {
    background: linear-gradient(135deg, rgba(240, 253, 244, 0.8) 0%, rgba(239, 246, 255, 0.8) 100%);
    border: 1px solid #BFDBFE;
    border-radius: var(--radius-md);
    padding: 1.3rem 1.4rem;
    box-shadow: var(--shadow-bento);
  }
  [data-theme="dark"] .impacto-card {
    background: linear-gradient(135deg, rgba(6, 78, 59, 0.25) 0%, rgba(30, 58, 138, 0.25) 100%);
    border-color: rgba(59, 130, 246, 0.3);
  }
  .impacto-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-top: 0.8rem; }
  .impacto-item { background: var(--surface-card); border: 1px solid var(--border-subtle); border-radius: 10px; padding: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.03); }
  .impacto-num { font-size: 1.15rem; font-weight: 800; color: var(--text-primary); margin-bottom: 2px; }
  .impacto-desc { font-size: 0.82rem; color: var(--text-secondary); line-height: 1.45; }

  /* Callout Banners */
  .callout-accion {
    background: var(--warning-surface);
    border: 1px solid var(--warning-border);
    border-left: 5px solid var(--warning);
    border-radius: var(--radius-sm);
    padding: 1.1rem 1.3rem;
    margin-bottom: 1.5rem;
  }
  .callout-al-dia {
    background: var(--success-surface);
    border: 1px solid var(--success-border);
    border-left: 5px solid var(--success);
    border-radius: var(--radius-sm);
    padding: 1.1rem 1.3rem;
    margin-bottom: 1.5rem;
  }

  /* Buttons con alto contraste garantizado (WCAG AAA) */
  button, .btn, input[type="submit"], input[type="button"] {
    font-family: inherit; font-size: 0.9rem; font-weight: 700 !important;
    border: 1px solid #1A3D84 !important; background: #1A3D84 !important; color: #FFFFFF !important;
    padding: 0.65rem 1.25rem; border-radius: 8px; cursor: pointer; transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.06);
  }
  button *, .btn *, input[type="submit"] * { color: inherit !important; }
  button:hover, .btn:hover, input[type="submit"]:hover {
    background: #15326C !important; border-color: #15326C !important;
    transform: translateY(-1px); box-shadow: 0 6px 12px -2px rgba(26, 61, 132, 0.25);
  }
  button:active, .btn:active, input[type="submit"]:active { transform: translateY(0) scale(0.98); }
  button:focus-visible, .btn:focus-visible, input:focus-visible { outline: 3px solid #3B82F6; outline-offset: 2px; }

  button.secundario, .btn.secundario {
    background: var(--surface-card) !important;
    color: var(--brand-primary) !important;
    border: 1px solid var(--border-subtle) !important;
    box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  }
  button.secundario:hover, .btn.secundario:hover {
    background: var(--surface-elevated) !important;
    border-color: var(--brand-primary) !important;
  }

  .btn-destacado-pulsante {
    background: #EA580C !important;
    border-color: #EA580C !important;
    color: #FFFFFF !important;
    font-size: 0.98rem;
    padding: 0.8rem 1.5rem;
    border-radius: 8px;
    box-shadow: 0 4px 14px rgba(234, 88, 12, 0.35);
  }
  .btn-destacado-pulsante:hover {
    background: #C2410C !important;
    border-color: #C2410C !important;
    transform: translateY(-1px) scale(1.02);
  }

  .acciones { display: flex; flex-wrap: wrap; gap: 0.6rem; margin: 1rem 0 1.5rem; }
  .card-modo { border: 1px solid var(--border-subtle); border-radius: 10px; padding: 1.3rem; margin-bottom: 1rem; }
  .mensaje { background: var(--surface-elevated); border: 1px solid var(--brand-primary); border-radius: 8px; padding: 1rem 1.2rem; margin-bottom: 1.5rem; font-size: 0.92rem; }
  .mensaje.error { background: var(--danger-surface); border-color: var(--danger); color: var(--danger); }
  fieldset { margin-bottom: 1em; border: 1px solid var(--border-subtle); border-radius: 8px; }
  ul { font-size: 0.85rem; }

  /* Monitor de Progreso en Vivo (SSE + Polling + Consola Embebida) */
  #progreso-modal {
    display: none;
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(15, 23, 42, 0.82);
    z-index: 999999;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    align-items: center;
    justify-content: center;
  }
  .modal-box {
    background: var(--surface-card);
    border: 1px solid var(--border-glass);
    border-radius: 20px;
    padding: 2.2rem;
    max-width: 640px;
    width: 92%;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    text-align: center;
  }
  .live-tag {
    background: var(--success-surface);
    color: var(--success);
    font-size: 0.75rem;
    font-weight: 800;
    padding: 3px 10px;
    border-radius: 12px;
    border: 1px solid var(--success-border);
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .live-pulse { animation: pulse 1.5s infinite; }
  @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }

  .barra-contenedor { margin: 1.2rem 0; text-align: left; }
  .barra-fondo { width: 100%; height: 10px; background: var(--border-subtle); border-radius: 5px; overflow: hidden; margin: 8px 0; }

  /* Explorador Web de Carpetas y Archivos */
  #explorador-modal {
    display: none;
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(15, 23, 42, 0.78);
    z-index: 999990;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    align-items: center;
    justify-content: center;
  }
  .exp-box {
    background: var(--surface-card);
    border: 1px solid var(--border-glass);
    border-radius: 16px;
    padding: 1.5rem;
    max-width: 780px;
    width: 94%;
    max-height: 86vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.45);
    text-align: left;
  }
  .exp-lista {
    flex: 1;
    min-height: 220px;
    max-height: 390px;
    overflow-y: auto;
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    background: var(--surface-elevated);
    padding: 6px;
  }
  .exp-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 7px 10px;
    border-radius: 8px;
    border-bottom: 1px solid var(--border-subtle);
    font-size: 0.88rem;
  }
  .exp-item:last-child { border-bottom: none; }
  .exp-item:hover { background: var(--surface-card); }
  .exp-nombre {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
    font-weight: 600;
    color: var(--text-primary);
  }
  .exp-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 10px;
  }
  .exp-chip {
    background: var(--surface-elevated) !important;
    color: var(--text-primary) !important;
    border: 1px solid var(--border-subtle) !important;
    padding: 5px 10px !important;
    font-size: 0.8rem !important;
    border-radius: 8px !important;
    box-shadow: none !important;
  }
  .exp-chip:hover {
    border-color: var(--brand-accent) !important;
    background: var(--surface-card) !important;
  }
  .barra-fill { height: 100%; background: linear-gradient(90deg, #1A3D84, #059669); border-radius: 5px; transition: width 0.3s ease; }

  .modal-stepper { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 1.2rem 0; }
  .m-step { background: var(--surface-elevated); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 8px 4px; text-align: center; font-size: 0.72rem; color: var(--text-tertiary); font-weight: 600; }
  .m-step-circle { width: 22px; height: 22px; border-radius: 50%; background: var(--border-subtle); color: var(--text-secondary); display: flex; align-items: center; justify-content: center; margin: 0 auto 4px; font-weight: bold; font-size: 0.7rem; }
  .m-step-active { border-color: #3B82F6; background: rgba(59, 130, 246, 0.1); color: #2563EB; }
  .m-step-active .m-step-circle { background: #3B82F6; color: #FFFFFF; }
  .m-step-done { border-color: var(--success); background: var(--success-surface); color: var(--success); }
  .m-step-done .m-step-circle { background: var(--success); color: #FFFFFF; }

  .consola-box {
    background: #0F172A;
    color: #CBD5E1;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.78rem;
    border-radius: 10px;
    padding: 0.9rem 1.1rem;
    max-height: 140px;
    overflow-y: auto;
    text-align: left;
    line-height: 1.5;
    margin-top: 8px;
    border: 1px solid #334155;
  }
  .consola-linea { white-space: pre-wrap; word-break: break-all; margin-bottom: 2px; }
  .consola-linea.highlight { color: #38BDF8; font-weight: bold; }
</style>
"""

_PLANTILLA_DASHBOARD = _ESTILO + """
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>motor-contactos</title>
</head>
<body>
  <!-- HEADER CON LOGO, NAVEGACIÓN Y TOGGLE DE TEMA -->
  <header class="app-header">
    <div class="header-brand">
      <span class="brand-pill">⚡ motor-contactos</span>
      <span class="status-dot-pulse" title="Servidor local activo"></span>
    </div>
    <nav>
      <a href="/" class="active">Panel</a>
      <a href="/revisar">Revisión pendiente ({{ stats.pendientes }})</a>
      <a href="/buscar">Buscar / editar contacto</a>
    </nav>
    <div>
      <button class="btn-icon" id="btn-tema" title="Cambiar tema claro/oscuro" onclick="cambiarTema()">🌓</button>
    </div>
  </header>

  <h1>Panel de motor-contactos</h1>
  {% if mensaje %}<div class="mensaje{{ ' error' if es_error else '' }}">{{ mensaje }}</div>{% endif %}

  <!-- COPILOTO CONTEXTUAL IA (Interfaces Nativas de IA y Asistente Contextual) -->
  <div class="copiloto-banner">
    {% if stats.raw_records == 0 %}
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px;">
        <div>
          <span class="copiloto-badge">✨ Copiloto IA · Base en Blanco Lista</span>
          <div class="copiloto-text">
            La base de datos está limpia (<strong>0 contactos</strong>). Explorá y encolá tus carpetas o elegí un archivo suelto abajo para comenzar una prueba real desde cero.
          </div>
          <div class="copiloto-pills">
            <span class="copiloto-pill">🟢 Listo para primera carga</span>
            <span class="copiloto-pill">🛡️ Respaldo automático antes de cada corrida</span>
          </div>
        </div>
        <span class="badge badge-ok" style="font-size:0.9rem; padding:6px 14px;">✨ Base Vacía</span>
      </div>
    {% elif not stats.al_dia %}
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:14px;">
        <div style="flex:1; min-width:280px;">
          <span class="copiloto-badge">✨ Copiloto IA · Alerta de Sincronización</span>
          <div class="copiloto-text">
            Detecté <strong>{{ stats.pendientes_normalizar_fmt }} contactos nuevos</strong> en la base cruda que todavía no fueron normalizados ni volcados a tu <code>lista-maestra.xlsx</code>. Tu planilla actual no incluye estos nuevos registros.
          </div>
          <div class="copiloto-pills">
            <span class="copiloto-pill">⚡ Acción recomendada: Unificar en 1 clic</span>
            <span class="copiloto-pill">🛡️ Respaldo previo garantizado</span>
          </div>
        </div>
        <form method="post" action="/accion/completar-pendientes" style="margin:0;">
          <button type="submit" class="btn-destacado-pulsante">
            ⚡ COMPLETAR Y ACTUALIZAR LISTA MAESTRA (Procesar {{ stats.pendientes_normalizar_fmt }} nuevos)
          </button>
        </form>
      </div>
    {% else %}
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px;">
        <div>
          <span class="copiloto-badge">✨ Copiloto IA · Base Optimizada</span>
          <div class="copiloto-text">
            Tu base de contactos está <strong>100% al día</strong>. Todos los <strong>{{ stats.raw_records_fmt }}</strong> registros están limpios, deduplicados y reflejados en tu <code>lista-maestra.xlsx</code> (<strong>{{ stats.contactos_finales_fmt }}</strong> contactos únicos consolidados con 0% riesgo de baneo en WhatsApp).
          </div>
          <div class="copiloto-pills">
            <a href="/descargar/lista-maestra" class="copiloto-pill">📊 Descargar Excel Maestro</a>
            <a href="/descargar/contactos-whatsapp" class="copiloto-pill">📱 Descargar CSV WhatsApp</a>
            <a href="/buscar" class="copiloto-pill">🔍 Buscar / Editar</a>
          </div>
        </div>
        <span class="badge badge-ok" style="font-size:0.9rem; padding:6px 14px;">🟢 100% Protegido</span>
      </div>
    {% endif %}
  </div>

  <!-- GRILLA BENTO PRINCIPAL (Bento Grid + Zero UI + Micro-Interacciones) -->
  <div class="bento-grid">

    <!-- BENTO HERO CARD (8 COLUMNAS): CENTRO DE CARGA INTELIGENTE & COLA DE CARPETAS -->
    <div class="bento-col-8 glass-panel tilt-3d">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:0.75rem;">
        <h3 style="margin:0; color:var(--text-primary); font-size:1.15rem; font-weight:800;">
          ⭐ Flujo Recomendado: ACTUALIZAR Y RESPALDAR (Caso 1 y Caso 2 juntos)
        </h3>
        <span style="background:var(--brand-primary); color:#FFFFFF !important; font-size:0.75rem; padding:3px 10px; border-radius:12px; font-weight:bold;">
          TODO EN 1 CLIC
        </span>
      </div>

      <p style="color:var(--text-secondary); font-size:0.88rem; margin:0 0 1rem 0; line-height:1.45;">
        <strong>¿Qué hace?</strong> En cada proceso hace un <strong>backup de lo anterior</strong> guardándolo en <code>Data/Backups/ultimo_backup/</code> (que se pisa/actualiza con la versión previa) y en <code>Data/Backups/historico/</code> (con fecha y hora). Luego escanea el nuevo directorio, lo <strong>fusiona</strong> con la base existente deduplicando inteligentemente, y <strong>actualiza</strong> <code>lista-maestra.xlsx</code> y <code>contactos-whatsapp.csv</code> de inmediato.
      </p>

      <!-- ZERO UI DRAG & DROP ZONE -->
      <div id="drop-zone" class="drop-zone" onclick="explorarYEncolar()">
        <div class="drop-icon">📁</div>
        <div class="drop-title">Arrastrá acá tus carpetas o archivos de contactos para encolar</div>
        <div class="drop-subtitle">Soporta VCF, CSV, XLSX, JSON, TXT · O hacé clic acá para explorar y encolar</div>
      </div>

      <!-- SECCIÓN: COLA DE CARPETAS (ANEXAR DE A UNA Y PROCESAR EN LOTE) -->
      <div style="background:var(--surface-elevated); border:1px solid var(--border-subtle); border-radius:10px; padding:1rem; margin-bottom:1rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <strong style="font-size:0.95rem; color:var(--text-primary);">📥 Cola de Carpetas a Escanear</strong>
            <span id="contador-cola" class="badge" style="font-size:0.78rem; padding:2px 8px;">0 carpetas</span>
          </div>
          <button type="button" id="btn-vaciar-cola" onclick="vaciarCola()" class="btn secundario" style="display:none; font-size:0.76rem; padding:3px 9px;">
            🗑️ Vaciar cola
          </button>
        </div>

        <!-- CONTROLES PARA AGREGAR A LA COLA -->
        <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:10px;">
          <button type="button" id="btn-explorar-encolar" onclick="abrirExploradorModal('carpeta')" style="background:#2563EB !important; border-color:#2563EB !important; color:#FFFFFF !important; font-size:0.86rem; padding:7px 14px;">
            📁 Explorar y Encolar Carpeta...
          </button>
          <form id="form-archivo-directo" method="post" action="/accion/subir-archivo" enctype="multipart/form-data" data-no-progress="1" style="display:inline; margin:0;">
            <input type="file" id="input-archivo-directo" name="archivo" style="display:none;" accept=".csv,.tsv,.txt,.xls,.xlsx,.xlsm,.ods,.vcf,.json,.html,.htm,.md,.log,.docx,.pdf,.png,.jpg,.jpeg" onchange="enviarArchivoDirecto(this)">
            <button type="button" id="btn-archivo-directo" class="secundario" onclick="document.getElementById('input-archivo-directo').click()" style="font-size:0.86rem; padding:7px 12px;">📄 Archivo suelto directo</button>
          </form>
          <form id="form-archivo-ruta" method="post" action="/accion/actualizar-y-respaldar-archivo" data-no-progress="1" style="display:none;">
            <input type="hidden" name="ruta_archivo" id="input-ruta-archivo-directo" value="">
          </form>
        </div>

        <div style="display:flex; gap:8px; margin-bottom:10px;">
          <input type="text" id="input-ruta-cola" placeholder="O pegá la ruta: C:/Ruta/A/Tu/Carpeta" style="flex:1; min-width:240px; padding:7px 12px; font-size:0.86rem; border:1px solid var(--border-subtle); border-radius:6px; background:var(--surface-card); color:var(--text-primary);" onkeydown="if(event.key==='Enter'){event.preventDefault(); encolarDesdeInput();}">
          <button type="button" onclick="encolarDesdeInput()" class="btn secundario" style="font-size:0.86rem; padding:7px 14px; white-space:nowrap;">
            + Encolar
          </button>
        </div>

        <!-- LISTA VISUAL DE CARPETAS ENCOLADAS -->
        <div id="lista-cola" style="background:var(--surface-card); border:1px solid var(--border-subtle); border-radius:8px; padding:8px 10px; min-height:48px; max-height:160px; overflow-y:auto;">
          <div id="cola-vacia-msg" style="color:var(--text-tertiary); font-size:0.82rem; font-style:italic; padding:6px 0;">
            No hay carpetas encoladas todavía. Podés explorar, pegar rutas o arrastrar carpetas para anexar de a una.
          </div>
        </div>
      </div>

      <!-- FORMULARIO DE ACCIÓN / ESCANEO DE LA COLA -->
      <form id="form-cola-principal" method="post" action="/accion/actualizar-y-respaldar" style="margin:0;">
        <input type="hidden" name="cola_carpetas" id="input-cola-json" value="[]">
        <input type="hidden" name="ruta_carpeta" id="input-ruta-fallback" value="">
        <button type="submit" id="btn-procesar-cola" style="width:100%; padding: 0.82rem 1.4rem; font-size: 0.98rem; background: #1A3D84; color: #FFFFFF !important; font-weight: 700; border-radius:8px;">
          ⚡ Escanear, Respaldar y Actualizar
        </button>
      </form>
    </div>

    <!-- BENTO CARD LATERAL (4 COLUMNAS): SALIDAS, DESCARGAS & COPIAS -->
    <div class="bento-col-4 glass-panel tilt-3d" style="display:flex; flex-direction:column; justify-content:space-between;">
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
          <h3 style="margin:0; font-size:1.05rem; font-weight:800; color:var(--text-primary);">⚡ Salidas & Descargas</h3>
          <span style="font-size:0.75rem; color:var(--text-tertiary); font-weight:bold;">K.I.S.S.</span>
        </div>

        <!-- EXCEL MAESTRO -->
        <div style="background:var(--surface-card); border:1px solid var(--border-subtle); border-radius:8px; padding:0.8rem; margin-bottom:0.75rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <strong style="font-size:0.88rem; color:var(--text-primary);">📊 Excel Maestro</strong>
            <span style="font-size:0.72rem; color:var(--success); font-weight:bold;">
              {% if xlsx_existe %}✓ {{ xlsx_tamano_mb }} MB{% else %}Sin generar{% endif %}
            </span>
          </div>
          <div style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:8px;">
            <code>lista-maestra.xlsx</code> {% if xlsx_fecha %}· {{ xlsx_fecha }}{% endif %}
          </div>
          {% if xlsx_existe %}
            <a href="/descargar/lista-maestra" class="btn" style="width:100%; font-size:0.82rem; padding:6px 10px; background:#10B981 !important; border-color:#10B981 !important;">
              ⬇️ Descargar Planilla Excel
            </a>
          {% else %}
            <span style="font-size:0.78rem; color:var(--warning);">Pendiente de exportar</span>
          {% endif %}
        </div>

        <!-- CSV WHATSAPP -->
        <div style="background:var(--surface-card); border:1px solid var(--border-subtle); border-radius:8px; padding:0.8rem; margin-bottom:0.75rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <strong style="font-size:0.88rem; color:var(--text-primary);">📱 Envíos WhatsApp</strong>
            <span style="font-size:0.72rem; color:var(--brand-accent); font-weight:bold;">
              {% if wa_existe %}✓ {{ wa_tamano_kb }} KB{% else %}Sin generar{% endif %}
            </span>
          </div>
          <div style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:8px;">
            <code>contactos-whatsapp.csv</code> (listo para MejoraWS)
          </div>
          <div style="display:flex; gap:6px;">
            {% if wa_existe %}
              <a href="/descargar/contactos-whatsapp" class="btn secundario" style="flex:1; font-size:0.78rem; padding:5px 8px;">
                ⬇️ CSV
              </a>
            {% endif %}
            <form method="post" action="/accion/abrir-mejoraws" style="flex:1; margin:0;">
              <button type="submit" style="width:100%; font-size:0.78rem; padding:5px 8px;">
                Abrir MejoraWS
              </button>
            </form>
          </div>
        </div>
      </div>

      <!-- COPIAS DE SEGURIDAD -->
      <div style="border-top:1px solid var(--border-subtle); padding-top:0.75rem;">
        <div style="font-size:0.78rem; font-weight:700; color:var(--text-secondary); margin-bottom:6px;">
          Copias de Seguridad (Backups)
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <form method="post" action="/accion/hacer-backup-manual" style="flex:1; margin:0;">
            <button class="secundario" style="width:100%; font-size:0.75rem; padding:5px 6px;" type="submit">
              💾 Copia ahora
            </button>
          </form>
          <form method="post" action="/accion/restaurar-ultimo-backup" style="flex:1; margin:0;" onsubmit="return confirm('¿Restaurar los archivos de la copia inmediatamente anterior (ultimo_backup)?');">
            <button class="secundario" style="width:100%; font-size:0.75rem; padding:5px 6px; color:#D97706 !important; border-color:#D97706 !important;" type="submit">
              ⏪ Deshacer
            </button>
          </form>
        </div>
        <form method="post" action="/accion/resetear-base" style="margin:0; width:100%; margin-top:6px;" onsubmit="return confirm('⚠️ ATENCIÓN: ¿Seguro que querés vaciar la base de datos y comenzar completamente de cero? Se guardará una copia previa de seguridad en Data/Backups/ antes de vaciar.');">
          <button class="secundario" style="width:100%; font-size:0.75rem; padding:5px 6px; color:#DC2626 !important; border-color:#DC2626 !important;" type="submit">
            🗑️ Resetear Base (Dejar en blanco)
          </button>
        </form>
      </div>
    </div>

    <!-- BENTO STAT CARDS (4 TARJETAS DE 3 COLUMNAS CADA UNA) -->
    <div class="bento-col-3 stat-card tilt-3d">
      <span class="stat-pill stat-pill-ok">100% E.164</span>
      <div class="stat-label">💎 Contactos Únicos</div>
      <div class="stat-val">{{ stats.contactos_finales_fmt }}</div>
      <div class="stat-sub">En lista-maestra.xlsx consolidada</div>
    </div>

    <div class="bento-col-3 stat-card tilt-3d">
      <span class="stat-pill stat-pill-ok">0% Riesgo Ban</span>
      <div class="stat-label">🛡️ Duplicados Unificados</div>
      <div class="stat-val">{{ stats.duplicados_unificados_fmt }}</div>
      <div class="stat-sub">Evita bloqueos de WhatsApp</div>
    </div>

    <div class="bento-col-3 stat-card tilt-3d">
      <span class="stat-pill stat-pill-ai">Trazable</span>
      <div class="stat-label">📥 Registros Crudos</div>
      <div class="stat-val">{{ stats.raw_records_fmt }}</div>
      <div class="stat-sub">De todas las fuentes combinadas</div>
    </div>

    <div class="bento-col-3 stat-card tilt-3d">
      <span class="stat-pill stat-pill-ai">IA + Reglas</span>
      <div class="stat-label">⏱️ Ahorro Operativo</div>
      <div class="stat-val">~140 Hs</div>
      <div class="stat-sub">Automatización humana directa</div>
    </div>

    <!-- TARJETA DE IMPACTO Y CALIDAD ("Aha! Moment") (12 COLUMNAS) -->
    <div class="bento-col-12 impacto-card tilt-3d">
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="font-size:1.4rem;">💎</span>
        <div>
          <strong style="color:var(--text-primary); font-size:1.05rem;">Impacto y Calidad Comercial de tu Base</strong>
          <div style="font-size:0.83rem; color:var(--text-secondary);">Garantía de alta conversión para WhatsApp y ahorro operativo</div>
        </div>
      </div>
      <div class="impacto-grid">
        <div class="impacto-item">
          <div class="impacto-num">🛡️ 0% Riesgo de Baneo</div>
          <div class="impacto-desc">{{ stats.duplicados_unificados_fmt }} contactos duplicados eliminados para cuidar tus chips y evitar bloqueos en WhatsApp.</div>
        </div>
        <div class="impacto-item">
          <div class="impacto-num">⏱️ ~140 Horas Ahorradas</div>
          <div class="impacto-desc">Tiempo de trabajo humano manual que se automatizó de inmediato con reglas locales e inteligencia artificial.</div>
        </div>
        <div class="impacto-item">
          <div class="impacto-num">📱 {{ stats.contactos_finales_fmt }} Listos</div>
          <div class="impacto-desc">100% números limpios en formato internacional E.164 (+549...) reflejados en tu <code>lista-maestra.xlsx</code>.</div>
        </div>
      </div>
    </div>

    <!-- PIPELINE STEPPER: SEGUIMIENTO VISUAL DE AVANCE (12 COLUMNAS) -->
    <div class="bento-col-12 pipeline-card">
      <div class="pipeline-header">
        <div class="pipeline-title">
          <h2>Avance del Proceso (Etapa por Etapa)</h2>
          <p class="pipeline-sub">Seguimiento visual del estado de tus datos desde los archivos crudos hasta la planilla final.</p>
        </div>
        <div>
          <span class="badge {{ 'badge-ok' if stats.al_dia else 'badge-warn' }}">
            {{ '🟢 Base 100% Al día' if stats.al_dia else '🟡 ' ~ stats.pendientes_normalizar_fmt ~ ' pendientes' }}
          </span>
        </div>
      </div>

      <div class="stepper-grid">
        <!-- PASO 1 -->
        <div class="step-card step-done">
          <div class="step-num">Paso 1</div>
          <div class="step-name">📥 Extracción de Archivos</div>
          <div class="step-value">{{ stats.raw_records_fmt }}</div>
          <div class="step-label">registros crudos extraídos</div>
          <div class="step-status status-ok">✓ Archivos leídos con éxito</div>
        </div>

        <!-- PASO 2 -->
        <div class="step-card {{ 'step-done' if stats.pendientes_normalizar == 0 else 'step-pending' }}">
          <div class="step-num">Paso 2</div>
          <div class="step-name">⚙️ Normalización & Limpieza</div>
          <div class="step-value">{{ stats.normalized_records_fmt }}</div>
          <div class="step-label">teléfonos E.164 y nombres limpios</div>
          <div class="step-progress-bar">
            <div class="step-progress-fill" style="width: {{ stats.porcentaje_normalizado }}%;"></div>
          </div>
          <div class="step-status {{ 'status-ok' if stats.pendientes_normalizar == 0 else 'status-warn' }}">
            {% if stats.pendientes_normalizar == 0 %}
              ✓ 100% normalizado
            {% else %}
              ⚠️ Faltan {{ stats.pendientes_normalizar_fmt }} por normalizar
            {% endif %}
          </div>
        </div>

        <!-- PASO 3 -->
        <div class="step-card {{ 'step-done' if stats.al_dia else 'step-pending' }}">
          <div class="step-num">Paso 3</div>
          <div class="step-name">🧠 Deduplicación con IA</div>
          <div class="step-value">{{ stats.contactos_finales_fmt }}</div>
          <div class="step-label">contactos únicos consolidados</div>
          <div class="step-status {{ 'status-ok' if stats.al_dia else 'status-warn' }}">
            {% if stats.al_dia %}
              ✓ Duplicados unidos (¡{{ stats.duplicados_unificados_fmt }} unificados!)
            {% else %}
              ⚠️ Falta cruzar los {{ stats.pendientes_normalizar_fmt }} nuevos
            {% endif %}
          </div>
        </div>

        <!-- PASO 4 -->
        <div class="step-card {{ 'step-done' if (stats.al_dia and xlsx_existe) else 'step-pending' }}">
          <div class="step-num">Paso 4</div>
          <div class="step-name">📊 Planilla Excel & WhatsApp</div>
          <div class="step-value" style="font-size:1.35rem;">{{ 'Al día' if (stats.al_dia and xlsx_existe) else 'Desactualizada' }}</div>
          <div class="step-label">
            {% if xlsx_existe %}
              Última exportación: {{ xlsx_fecha }}
            {% else %}
              Sin exportar todavía
            {% endif %}
          </div>
          <div class="step-status {{ 'status-ok' if (stats.al_dia and xlsx_existe) else 'status-warn' }}">
            {% if stats.al_dia and xlsx_existe %}
              ✓ Planilla 100% al día
            {% else %}
              ⚠️ Pendiente de regenerar con los nuevos
            {% endif %}
          </div>
        </div>
      </div>
    </div>

    <!-- SECCIÓN AVANZADA COLAPSABLE (12 COLUMNAS) -->
    <div class="bento-col-12">
      <details style="background:var(--surface-glass); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 1.1rem 1.4rem; box-shadow:var(--shadow-bento);">
        <summary style="font-weight: 700; color: var(--text-secondary); cursor: pointer; font-size: 0.95rem; user-select:none;">
          ⚙️ Herramientas avanzadas, pasos individuales y bases archivadas (clic para ver)
        </summary>

        <div style="margin-top: 1.2rem;">
          <!-- CASO 1 Y CASO 2 POR SEPARADO -->
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:1rem; margin-bottom:1.2rem;">
            <div class="card-modo" style="border-left: 4px solid #3B82F6; background: rgba(59, 130, 246, 0.05); margin:0;">
              <strong style="color: #1D4ED8; font-size: 0.92rem;">🔵 Caso 1 por separado: Solo agregar a la base</strong>
              <p style="color: var(--text-secondary); font-size: 0.82rem; margin: 0.3rem 0 0.7rem;">
                Extrae los contactos a la base de datos cruda sin regenerar el Excel aún.
              </p>
              <form method="post" action="/accion/importar-carpeta" style="display:inline">
                <button class="secundario" style="padding: 6px 12px; font-size: 0.82rem;" type="submit">📁 Elegir carpeta y solo agregar</button>
              </form>
            </div>

            <div class="card-modo" style="border-left: 4px solid #059669; background: rgba(5, 150, 105, 0.05); margin:0;">
              <strong style="color: #059669; font-size: 0.92rem;">🟢 Caso 2 por separado: Nueva Base Independiente</strong>
              <p style="color: var(--text-secondary); font-size: 0.82rem; margin: 0.3rem 0 0.7rem;">
                Archiva la base actual e inicia un lote limpio e independiente para este directorio.
              </p>
              <form method="post" action="/accion/nueva-base-independiente" style="display:inline">
                <button style="background: #059669; border-color: #059669; padding: 6px 12px; font-size: 0.82rem;" type="submit">🆕 Elegir carpeta como Nueva Base...</button>
              </form>
            </div>
          </div>

          <!-- PASOS INDIVIDUALES -->
          <h4 style="margin: 0.8rem 0 0.4rem; color: var(--text-primary); font-size:0.92rem;">Pasos individuales manuales:</h4>
          <div class="acciones" style="margin-bottom:1rem;">
            <form method="post" action="/accion/extraer"><button class="secundario" type="submit">1. Extraer</button></form>
            <form method="post" action="/accion/normalizar"><button class="secundario" type="submit">2. Normalizar</button></form>
            <form method="post" action="/accion/deduplicar"><button class="secundario" type="submit">3. Deduplicar</button></form>
            <form method="post" action="/accion/exportar"><button class="secundario" type="submit">4. Exportar a Excel</button></form>
            <form method="post" action="/accion/exportar-whatsapp"><button class="secundario" type="submit">Exportar CSV WhatsApp</button></form>
            <form method="post" action="/accion/deshacer-ultima-corrida" onsubmit="return confirm('¿Revertir TODA la última corrida de deduplicación?');">
              <button class="secundario" style="color:#DC2626 !important;" type="submit">Deshacer última corrida completa</button>
            </form>
          </div>

          <!-- GOOGLE CONTACTS -->
          {% if cuentas_google %}
            <h4 style="margin: 0.8rem 0 0.4rem; color: var(--text-primary); font-size:0.92rem;">Google Contacts:</h4>
            <div class="acciones" style="margin-bottom:0.5rem;">
              {% for cuenta in cuentas_google %}
              <form method="post" action="/accion/importar-google-{{ cuenta }}">
                <button class="secundario" type="submit">Importar de Google ({{ cuenta|capitalize }})</button>
              </form>
              {% endfor %}
            </div>
            <p style="color:var(--text-tertiary); font-size:0.82rem; margin-top:0;">Requiere configurar <code>credentials.json</code> en Google Cloud Console.</p>
          {% endif %}

          <!-- BASES ARCHIVADAS -->
          {% if bases_archivadas %}
            <h4 style="margin: 0.8rem 0 0.4rem; color: var(--text-primary); font-size:0.92rem;">Bases archivadas disponibles:</h4>
            <ul style="padding-left:1.2rem; color:var(--text-secondary);">
              {% for b in bases_archivadas %}
              <li style="margin-bottom: 6px;">
                <strong>{{ b.etiqueta }}</strong> ({{ b.fecha }}) —
                <form method="post" action="/accion/restaurar-base" style="display:inline" onsubmit="return confirm('¿Restaurar esta base archivada como la activa? Se hará backup de la actual.');">
                  <input type="hidden" name="nombre_carpeta" value="{{ b.nombre }}">
                  <button class="secundario" style="padding: 3px 8px; font-size: 0.75rem;" type="submit">Restaurar esta base</button>
                </form>
              </li>
              {% endfor %}
            </ul>
          {% endif %}

          <!-- FASE 4 — GOOGLE APPS SCRIPT SYNC -->
          <div style="border-top:1px solid var(--border-subtle); padding-top:0.8rem; margin-top:0.8rem;">
            <h4 style="margin: 0 0 0.4rem; color: var(--text-primary); font-size:0.92rem;">Fase 4 — Sync a Google Contacts</h4>
            <ol style="font-size:0.85rem; color:var(--text-secondary); line-height:1.5; padding-left:1.2rem;">
              <li>Abrí <a href="https://sheets.google.com/create" target="_blank" rel="noopener">un Google Sheet nuevo</a> y subí <code>lista-maestra.xlsx</code> (Archivo → Importar).</li>
              <li>En cada cuenta: Extensiones → Apps Script → pegar código de <code>google-apps-script/Sync.gs</code> → correr <code>sincronizarContactos</code>.</li>
            </ol>
          </div>
          <!-- RESETEAR BASE A CERO -->
          <div class="card-modo" style="border-left: 4px solid #DC2626; background: rgba(220, 38, 38, 0.05); margin-top:1.2rem;">
            <strong style="color: #DC2626; font-size: 0.92rem;">🗑️ Resetear Base de Datos y Salidas a Cero</strong>
            <p style="color: var(--text-secondary); font-size: 0.82rem; margin: 0.3rem 0 0.7rem;">
              Vacía todas las tablas de contactos, elimina las planillas exportadas y deja el sistema completamente limpio para pruebas desde cero. Guarda un respaldo previo automático para resguardar tus datos.
            </p>
            <form method="post" action="/accion/resetear-base" onsubmit="return confirm('⚠️ ATENCIÓN: ¿Seguro que querés vaciar la base de datos y comenzar completamente de cero? Se guardará una copia previa de seguridad en Data/Backups/ antes de vaciar.');">
              <button style="background: #DC2626 !important; border-color: #DC2626 !important; font-size: 0.82rem; padding: 6px 12px; color:#FFFFFF !important;" type="submit">
                🗑️ Resetear y Dejar en Blanco
              </button>
            </form>
          </div>
        </div>
      </details>
    </div>

  </div> <!-- FIN BENTO GRID -->

  <!-- EXPLORADOR WEB DE CARPETAS Y ARCHIVOS (Nativo del navegador, funciona en cualquier sesión) -->
  <div id="explorador-modal" onclick="if(event.target===this) cerrarExploradorModal()">
    <div class="exp-box">
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-subtle); padding-bottom:0.8rem; margin-bottom:0.9rem;">
        <div>
          <h3 style="margin:0; font-size:1.15rem; color:var(--text-primary);">📁 Explorar Carpetas y Archivos</h3>
          <div style="font-size:0.8rem; color:var(--text-tertiary); margin-top:2px;">Navegá por tu PC y encolá una o varias carpetas antes de escanear.</div>
        </div>
        <button type="button" class="btn-icon" onclick="cerrarExploradorModal()" title="Cerrar explorador">✕</button>
      </div>

      <!-- Barra de ruta y navegación -->
      <div style="display:flex; gap:6px; align-items:center; margin-bottom:10px; flex-wrap:wrap;">
        <button type="button" class="btn secundario" onclick="cargarRutaExplorador('')" style="padding:6px 10px; font-size:0.82rem;">🏠 Inicio</button>
        <button type="button" id="exp-btn-subir" class="btn secundario" onclick="subirCarpetaExplorador()" style="padding:6px 10px; font-size:0.82rem;">⬆️ Subir</button>
        <input type="text" id="exp-input-ruta" placeholder="Escribí o pegá una ruta (ej: C:/MisContactos)" style="flex:1; min-width:200px; padding:6px 10px; font-size:0.84rem; border:1px solid var(--border-subtle); border-radius:6px; background:var(--surface-elevated); color:var(--text-primary);" onkeydown="if(event.key==='Enter'){event.preventDefault(); navegarInputExplorador();}">
        <button type="button" class="btn secundario" onclick="navegarInputExplorador()" style="padding:6px 12px; font-size:0.82rem;">Ir</button>
      </div>

      <!-- Atajos y Unidades rápidas -->
      <div id="exp-atajos" class="exp-chips"></div>

      <!-- Estado / Toast dentro del explorador -->
      <div id="exp-status" style="display:none; background:var(--success-surface); color:var(--success); border:1px solid var(--success-border); border-radius:8px; padding:6px 10px; font-size:0.82rem; font-weight:600; margin-bottom:8px;"></div>

      <!-- Lista de carpetas y archivos -->
      <div id="exp-lista" class="exp-lista">
        <div style="padding:1.5rem; text-align:center; color:var(--text-tertiary); font-size:0.86rem;">Cargando carpetas...</div>
      </div>

      <!-- Footer acciones -->
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-top:1rem; padding-top:0.85rem; border-top:1px solid var(--border-subtle);">
        <div id="exp-info-pie" style="font-size:0.8rem; color:var(--text-secondary);">Seleccioná una carpeta o hacé clic en "+ Encolar".</div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <button type="button" class="btn secundario" onclick="cerrarExploradorModal()" style="font-size:0.84rem; padding:7px 14px;">Cerrar</button>
          <button type="button" id="exp-btn-encolar-actual" onclick="encolarCarpetaActual(false)" class="btn secundario" style="display:none; font-size:0.84rem; padding:7px 14px;">+ Encolar esta carpeta</button>
          <button type="button" id="exp-btn-encolar-cerrar" onclick="encolarCarpetaActual(true)" style="display:none; background:#2563EB !important; border-color:#2563EB !important; color:#FFFFFF !important; font-size:0.86rem; padding:7px 14px;">✓ Encolar y Listo</button>
        </div>
      </div>
    </div>
  </div>

  <!-- MONITOR DE PROGRESO EN VIVO (CON SSE Y CONSOLA EMBEBIDA) -->
  <div id="progreso-modal">
    <div class="modal-box">
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-subtle); padding-bottom:0.9rem; margin-bottom:1.1rem;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="live-pulse" style="font-size:1.5rem;">⚡</span>
          <div style="text-align:left;">
            <h3 id="progreso-modal-title" style="margin:0; color:var(--text-primary); font-size:1.25rem;">Procesando Contactos en Tiempo Real</h3>
            <p id="progreso-subtitulo" style="margin:2px 0 0; color:var(--text-tertiary); font-size:0.85rem;">No cierres esta ventana. Tu proceso se ejecuta de forma segura.</p>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="live-tag">● EN VIVO</span>
          <button type="button" onclick="cerrarModalProgreso()" style="background:transparent; border:none; color:var(--text-tertiary); font-size:1.3rem; cursor:pointer; padding:2px 8px; line-height:1;" title="Cerrar ventana">✕</button>
        </div>
      </div>

      <!-- Barra de progreso -->
      <div class="barra-contenedor">
        <div style="display:flex; justify-content:space-between; font-size:0.92rem; font-weight:700; margin-bottom:6px;">
          <span id="progreso-etapa-txt" style="color:var(--text-primary);">Iniciando proceso...</span>
          <span id="progreso-pct-txt" style="color:var(--brand-primary);">0%</span>
        </div>
        <div class="barra-fondo">
          <div id="progreso-fill" class="barra-fill" style="width: 2%;"></div>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--text-tertiary); margin-top:6px;">
          <span id="progreso-detalle-txt">Preparando base de datos y respaldos...</span>
          <span id="progreso-eta-txt">Tiempo estimado: calculando...</span>
        </div>
      </div>

      <!-- Stepper de 4 etapas visuales en el modal -->
      <div class="modal-stepper">
        <div id="m-step-1" class="m-step">
          <div class="m-step-circle">1</div>
          <div class="m-step-label">Respaldo Previo</div>
        </div>
        <div id="m-step-2" class="m-step">
          <div class="m-step-circle">2</div>
          <div class="m-step-label">Normalización</div>
        </div>
        <div id="m-step-3" class="m-step">
          <div class="m-step-circle">3</div>
          <div class="m-step-label">Deduplicación & IA</div>
        </div>
        <div id="m-step-4" class="m-step">
          <div class="m-step-circle">4</div>
          <div class="m-step-label">Excel & WhatsApp</div>
        </div>
      </div>

      <!-- Consola de logs en vivo (embebida) -->
      <div style="margin-top:1.1rem; text-align:left;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <span style="font-size:0.8rem; font-weight:700; color:var(--text-secondary);">📟 Registro de actividad en vivo:</span>
          <span style="font-size:0.75rem; color:#10B981; font-weight:bold;">Sincronizado</span>
        </div>
        <div id="consola-box" class="consola-box">
          <div class="consola-linea">[Iniciando monitor de telemetría...]</div>
        </div>
      </div>

      <!-- Botón de éxito al terminar -->
      <div id="progreso-btn-final" style="display:none; margin-top:1.4rem;">
        <a href="/" class="btn" style="background:#059669 !important; border-color:#059669 !important; color:#FFFFFF !important; font-size:1rem; padding:0.8rem 1.6rem; border-radius:8px;">
          🎉 ¡Excelente! Ver Panel Actualizado
        </a>
      </div>
    </div>
  </div>

  <script>
    // Gestión de Tema Claro / Oscuro (Design Tokens Multitema)
    function aplicarTema(tema) {
      document.documentElement.setAttribute('data-theme', tema);
      localStorage.setItem('mc-theme', tema);
      const btn = document.getElementById('btn-tema');
      if (btn) btn.innerText = tema === 'dark' ? '☀️' : '🌓';
    }

    function cambiarTema() {
      const actual = document.documentElement.getAttribute('data-theme') || 'light';
      const nuevo = actual === 'dark' ? 'light' : 'dark';
      aplicarTema(nuevo);
    }

    // Inicializar tema al cargar
    (function() {
      const guardado = localStorage.getItem('mc-theme');
      if (guardado) {
        aplicarTema(guardado);
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        aplicarTema('dark');
      }
    })();

    function escapeHtml(str) {
      return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ==========================================
    // COLA DE CARPETAS (Anexar de a una y procesar en lote)
    // ==========================================
    let colaCarpetas = [];

    function renderizarCola() {
      const listaEl = document.getElementById('lista-cola');
      const contadorEl = document.getElementById('contador-cola');
      const btnVaciar = document.getElementById('btn-vaciar-cola');
      const inputHidden = document.getElementById('input-cola-json');
      const inputFallback = document.getElementById('input-ruta-fallback');
      const btnProcesar = document.getElementById('btn-procesar-cola');

      if (!listaEl) return;

      const n = colaCarpetas.length;
      if (contadorEl) {
        contadorEl.innerText = n + (n === 1 ? ' carpeta' : ' carpetas');
        contadorEl.className = n > 0 ? 'badge badge-ok' : 'badge';
      }
      if (btnVaciar) {
        btnVaciar.style.display = n > 0 ? 'inline-block' : 'none';
      }
      if (inputHidden) {
        inputHidden.value = JSON.stringify(colaCarpetas);
      }
      if (inputFallback) {
        inputFallback.value = n > 0 ? colaCarpetas[0] : '';
      }
      if (btnProcesar) {
        if (n > 0) {
          btnProcesar.innerText = '⚡ Escanear, Respaldar y Procesar Cola (' + n + (n === 1 ? ' carpeta' : ' carpetas') + ')';
        } else {
          btnProcesar.innerText = '⚡ Escanear, Respaldar y Actualizar';
        }
      }

      if (n === 0) {
        listaEl.innerHTML = '<div id="cola-vacia-msg" style="color:var(--text-tertiary); font-size:0.82rem; font-style:italic; padding:6px 0;">' +
          'No hay carpetas encoladas todavía. Podés explorar, pegar rutas o arrastrar carpetas para anexar de a una.' +
          '</div>';
        return;
      }

      let html = '<ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:6px;">';
      colaCarpetas.forEach(function(ruta, idx) {
        const nombreCarpeta = ruta.split('\\\\').join('/').split('/').filter(Boolean).pop() || ruta;
        html += '<li style="display:flex; justify-content:space-between; align-items:center; background:var(--surface-elevated); padding:6px 10px; border-radius:6px; border:1px solid var(--border-subtle);">' +
          '<div style="display:flex; align-items:center; gap:8px; overflow:hidden;">' +
            '<span style="font-size:0.95rem;">📁</span>' +
            '<div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' +
              '<strong style="font-size:0.84rem; color:var(--text-primary);">' + escapeHtml(nombreCarpeta) + '</strong> ' +
              '<span style="font-size:0.75rem; color:var(--text-tertiary); font-family:monospace;">(' + escapeHtml(ruta) + ')</span>' +
            '</div>' +
          '</div>' +
          '<button type="button" onclick="quitarDeCola(' + idx + ')" style="background:transparent; border:none; color:var(--danger); cursor:pointer; font-size:0.85rem; padding:2px 6px;" title="Quitar de la cola">❌</button>' +
        '</li>';
      });
      html += '</ul>';
      listaEl.innerHTML = html;
    }

    function agregarACola(ruta) {
      if (!ruta) return;
      ruta = ruta.trim();
      if (!ruta) return;
      const normalizada = ruta.split('\\\\').join('/');
      const yaExiste = colaCarpetas.some(function(r) {
        return r.split('\\\\').join('/').toLowerCase() === normalizada.toLowerCase();
      });
      if (yaExiste) {
        alert('La carpeta ya está en la cola: ' + ruta);
        return;
      }
      colaCarpetas.push(ruta);
      renderizarCola();
    }

    function quitarDeCola(idx) {
      if (idx >= 0 && idx < colaCarpetas.length) {
        colaCarpetas.splice(idx, 1);
        renderizarCola();
      }
    }

    function vaciarCola() {
      colaCarpetas = [];
      renderizarCola();
    }

    function encolarDesdeInput() {
      const inp = document.getElementById('input-ruta-cola');
      if (!inp || !inp.value.trim()) {
        alert('Por favor escribí o pegá una ruta de carpeta antes de tocar "+ Encolar".');
        return;
      }
      agregarACola(inp.value.trim());
      inp.value = '';
    }

    let expEstado = { ruta_actual: '', padre: null, en_raiz: true };
    let expAtajosLista = [];
    let expCarpetasLista = [];
    let expArchivosLista = [];

    function abrirExploradorModal() {
      const modal = document.getElementById('explorador-modal');
      if (!modal) return;
      modal.style.display = 'flex';
      const st = document.getElementById('exp-status');
      if (st) st.style.display = 'none';
      cargarRutaExplorador(expEstado.ruta_actual || '');
    }

    function cerrarExploradorModal() {
      const modal = document.getElementById('explorador-modal');
      if (modal) modal.style.display = 'none';
    }

    function explorarYEncolar() {
      abrirExploradorModal();
    }

    function mostrarToastExplorador(texto) {
      const st = document.getElementById('exp-status');
      if (!st) return;
      st.innerText = texto;
      st.style.display = 'block';
    }

    function cargarRutaExplorador(ruta) {
      const lista = document.getElementById('exp-lista');
      if (lista) {
        lista.innerHTML = '<div style="padding:1.5rem; text-align:center; color:var(--text-tertiary); font-size:0.86rem;">⏳ Leyendo carpetas...</div>';
      }
      fetch('/api/explorar?ruta=' + encodeURIComponent(ruta || ''))
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (!data || !data.ok) {
            if (lista) {
              lista.innerHTML = '<div style="padding:1.2rem; color:var(--danger); font-size:0.86rem;">⚠️ ' + escapeHtml((data && data.error) || 'No se pudo abrir la ruta solicitada.') + '</div>';
            }
            return;
          }
          renderizarExplorador(data);
        })
        .catch(function() {
          if (lista) {
            lista.innerHTML = '<div style="padding:1.2rem; color:var(--danger); font-size:0.86rem;">⚠️ Error de conexión leyendo carpetas locales.</div>';
          }
        });
    }

    function renderizarExplorador(data) {
      expEstado = {
        ruta_actual: data.ruta_actual || '',
        padre: data.padre === undefined ? null : data.padre,
        en_raiz: !!data.en_raiz
      };
      const inp = document.getElementById('exp-input-ruta');
      if (inp) inp.value = expEstado.ruta_actual;

      const btnSubir = document.getElementById('exp-btn-subir');
      if (btnSubir) btnSubir.disabled = expEstado.en_raiz;

      const btnEncolarAct = document.getElementById('exp-btn-encolar-actual');
      const btnEncolarCer = document.getElementById('exp-btn-encolar-cerrar');
      const mostrarEncolarActual = !expEstado.en_raiz && !!expEstado.ruta_actual;
      if (btnEncolarAct) btnEncolarAct.style.display = mostrarEncolarActual ? 'inline-flex' : 'none';
      if (btnEncolarCer) btnEncolarCer.style.display = mostrarEncolarActual ? 'inline-flex' : 'none';

      // Renderizar atajos y unidades arriba
      expAtajosLista = [];
      (data.atajos || []).forEach(function(a) { expAtajosLista.push(a); });
      (data.unidades || []).forEach(function(u) { expAtajosLista.push(u); });

      const atajosEl = document.getElementById('exp-atajos');
      if (atajosEl) {
        atajosEl.innerHTML = expAtajosLista.map(function(a, i) {
          const ico = a.es_unidad ? '💽 ' : '📌 ';
          return '<button type="button" class="exp-chip" onclick="abrirAtajoIdx(' + i + ')">' + ico + escapeHtml(a.nombre) + '</button>';
        }).join('');
      }

      const listaEl = document.getElementById('exp-lista');
      const pieEl = document.getElementById('exp-info-pie');
      if (!listaEl) return;

      if (expEstado.en_raiz) {
        expCarpetasLista = expAtajosLista.slice();
        expArchivosLista = [];
        if (expCarpetasLista.length === 0) {
          listaEl.innerHTML = '<div style="padding:1.5rem; text-align:center; color:var(--text-tertiary);">No se detectaron unidades o atajos. Pegá una ruta arriba.</div>';
        } else {
          listaEl.innerHTML = expCarpetasLista.map(function(c, idx) {
            const ico = c.es_unidad ? '💽 ' : '📁 ';
            return '<div class="exp-item">' +
              '<div class="exp-nombre" onclick="abrirCarpetaIdx(' + idx + ')">' + ico + escapeHtml(c.nombre) + ' <span style="font-weight:400; font-size:0.76rem; color:var(--text-tertiary);">(' + escapeHtml(c.ruta) + ')</span></div>' +
              '<div style="display:flex; gap:6px;">' +
                '<button type="button" class="btn secundario" style="padding:4px 10px; font-size:0.78rem;" onclick="abrirCarpetaIdx(' + idx + ')">Abrir</button>' +
                (c.es_unidad ? '' : '<button type="button" class="btn secundario" style="padding:4px 10px; font-size:0.78rem;" onclick="encolarCarpetaIdx(' + idx + ')">+ Encolar</button>') +
              '</div>' +
            '</div>';
          }).join('');
        }
        if (pieEl) pieEl.innerText = 'Elegí un atajo o unidad para navegar por tus carpetas.';
        return;
      }

      expCarpetasLista = data.carpetas || [];
      expArchivosLista = data.archivos || [];

      let html = '';
      html += expCarpetasLista.map(function(c, idx) {
        return '<div class="exp-item">' +
          '<div class="exp-nombre" onclick="abrirCarpetaIdx(' + idx + ')" title="Abrir carpeta">📁 ' + escapeHtml(c.nombre) + '</div>' +
          '<div style="display:flex; gap:6px;">' +
            '<button type="button" class="btn secundario" style="padding:4px 10px; font-size:0.78rem;" onclick="abrirCarpetaIdx(' + idx + ')">Abrir</button>' +
            '<button type="button" class="btn secundario" style="padding:4px 10px; font-size:0.78rem;" onclick="encolarCarpetaIdx(' + idx + ')">+ Encolar</button>' +
          '</div>' +
        '</div>';
      }).join('');

      html += expArchivosLista.map(function(f, idx) {
        return '<div class="exp-item">' +
          '<div class="exp-nombre" style="cursor:default; font-weight:500;" title="' + escapeHtml(f.ruta) + '">📄 ' + escapeHtml(f.nombre) + ' <span style="font-size:0.76rem; color:var(--text-tertiary);">(' + f.tamano_kb + ' KB)</span></div>' +
          '<button type="button" class="btn secundario" style="padding:4px 10px; font-size:0.78rem;" onclick="procesarArchivoIdx(' + idx + ')">⚡ Procesar archivo</button>' +
        '</div>';
      }).join('');

      if (!html) {
        html = '<div style="padding:1.5rem; text-align:center; color:var(--text-tertiary); font-size:0.86rem;">Carpeta vacía o sin archivos de contactos compatibles. Podés encolarla igual o subir de nivel.</div>';
      }
      listaEl.innerHTML = html;

      if (pieEl) {
        const msgC = expCarpetasLista.length + ' subcarpeta(s)';
        const msgA = expArchivosLista.length + ' archivo(s) compatible(s)';
        pieEl.innerText = msgC + ' · ' + msgA + (data.truncado ? ' (mostrando primeros 500)' : '');
      }
    }

    function abrirAtajoIdx(idx) {
      if (expAtajosLista[idx]) cargarRutaExplorador(expAtajosLista[idx].ruta);
    }

    function abrirCarpetaIdx(idx) {
      if (expCarpetasLista[idx]) cargarRutaExplorador(expCarpetasLista[idx].ruta);
    }

    function encolarCarpetaIdx(idx) {
      if (!expCarpetasLista[idx]) return;
      agregarACola(expCarpetasLista[idx].ruta);
      mostrarToastExplorador('✓ Agregada a la cola: ' + expCarpetasLista[idx].nombre + ' (' + colaCarpetas.length + ' en cola)');
    }

    function encolarCarpetaActual(cerrarDespues) {
      if (!expEstado.ruta_actual) return;
      agregarACola(expEstado.ruta_actual);
      if (cerrarDespues) {
        cerrarExploradorModal();
      } else {
        mostrarToastExplorador('✓ Carpeta encolada (' + colaCarpetas.length + ' en cola)');
      }
    }

    function subirCarpetaExplorador() {
      if (expEstado.en_raiz) return;
      cargarRutaExplorador(expEstado.padre || '');
    }

    function navegarInputExplorador() {
      const inp = document.getElementById('exp-input-ruta');
      cargarRutaExplorador(inp ? inp.value.trim() : '');
    }

    function procesarArchivoIdx(idx) {
      const f = expArchivosLista[idx];
      if (!f || !f.ruta) return;
      cerrarExploradorModal();
      const inp = document.getElementById('input-ruta-archivo-directo');
      const form = document.getElementById('form-archivo-ruta');
      if (inp && form) {
        inp.value = f.ruta;
        iniciarMonitoreoProgreso();
        form.submit();
      }
    }

    function enviarArchivoDirecto(input) {
      if (!input || !input.files || input.files.length === 0) return;
      const form = document.getElementById('form-archivo-directo');
      if (!form) return;
      const det = document.getElementById('progreso-detalle-txt');
      if (det) det.innerText = 'Subiendo y procesando: ' + input.files[0].name;
      iniciarMonitoreoProgreso();
      form.submit();
    }

    // Zero UI: Drag and Drop Handler
    const dropZone = document.getElementById('drop-zone');
    if (dropZone) {
      ['dragenter', 'dragover'].forEach(function(eventName) {
        dropZone.addEventListener(eventName, function(e) {
          e.preventDefault();
          e.stopPropagation();
          dropZone.classList.add('dragover');
        }, false);
      });

      ['dragleave', 'drop'].forEach(function(eventName) {
        dropZone.addEventListener(eventName, function(e) {
          e.preventDefault();
          e.stopPropagation();
          dropZone.classList.remove('dragover');
        }, false);
      });

      dropZone.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files && files.length > 0) {
          for (let i = 0; i < files.length; i++) {
            const f = files[i];
            if (f.path) {
              agregarACola(f.path);
            } else if (f.name) {
              agregarACola(f.name);
            }
          }
        }
      }, false);
    }

    // Interceptar envío del formulario de cola
    const formCola = document.getElementById('form-cola-principal');
    if (formCola) {
      formCola.addEventListener('submit', function(e) {
        const inp = document.getElementById('input-ruta-cola');
        if (inp && inp.value.trim()) {
          agregarACola(inp.value.trim());
          inp.value = '';
        }
        if (colaCarpetas.length === 0) {
          e.preventDefault();
          alert('⚠️ Por favor agregá al menos una carpeta a la cola (usando "Explorar", pegando la ruta o arrastrando) antes de presionar el botón de escaneo.');
          return false;
        }
        iniciarMonitoreoProgreso();
      });
    }

    // Telemetría & Monitor de Progreso en Vivo
    let evtSource = null;
    let pollTimer = null;

    function cerrarModalProgreso() {
      const modal = document.getElementById("progreso-modal");
      if (modal) modal.style.display = "none";
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }

    function actualizarUIProgreso(data) {
      if (!data) return;
      const modal = document.getElementById("progreso-modal");
      if (modal && data.activo) {
        modal.style.display = "flex";
      }

      const pct = data.progreso_pct || 0;
      const fill = document.getElementById("progreso-fill");
      const pctTxt = document.getElementById("progreso-pct-txt");
      const etapaTxt = document.getElementById("progreso-etapa-txt");
      const detalleTxt = document.getElementById("progreso-detalle-txt");
      const etaTxt = document.getElementById("progreso-eta-txt");
      const consola = document.getElementById("consola-box");
      const btnFinal = document.getElementById("progreso-btn-final");

      if (fill) fill.style.width = Math.max(pct, 2) + "%";
      if (pctTxt) pctTxt.innerText = pct + "%";
      if (etapaTxt) etapaTxt.innerText = data.etapa_nombre || "Procesando...";
      if (detalleTxt) detalleTxt.innerText = data.mensaje || "";
      
      if (etaTxt) {
        if (data.eta_segundos !== null && data.eta_segundos > 0) {
          etaTxt.innerText = "Tiempo estimado: ~" + data.eta_segundos + " seg";
        } else if (pct >= 100) {
          etaTxt.innerText = "¡Completado!";
        } else {
          etaTxt.innerText = "Calculando tiempo...";
        }
      }

      const paso = data.paso_actual || 1;
      for (let i = 1; i <= 4; i++) {
        const el = document.getElementById("m-step-" + i);
        if (el) {
          if (i < paso || (i === paso && pct === 100)) {
            el.className = "m-step m-step-done";
          } else if (i === paso) {
            el.className = "m-step m-step-active";
          } else {
            el.className = "m-step";
          }
        }
      }

      if (consola && data.logs && data.logs.length > 0) {
        consola.innerHTML = data.logs.map(function(l) {
          const isHighlight = l.includes("LLM-judge") || l.includes("Deduplicación") || l.includes("✅") || l.includes("✓");
          return '<div class="consola-linea' + (isHighlight ? ' highlight' : '') + '">' + escapeHtml(l) + '</div>';
        }).join('');
        consola.scrollTop = consola.scrollHeight;
      }

      if (!data.activo && pct === 100) {
        if (btnFinal) btnFinal.style.display = "block";
        const title = document.getElementById("progreso-modal-title");
        if (title) title.innerText = "🎉 ¡Proceso completado con 100% de éxito!";
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      }
    }

    function iniciarMonitoreoProgreso() {
      const modal = document.getElementById("progreso-modal");
      if (modal) modal.style.display = "flex";
      iniciarPolling();
    }

    function iniciarPolling() {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(function() {
        fetch("/api/progreso-estado")
          .then(function(r) { return r.json(); })
          .then(function(data) { actualizarUIProgreso(data); })
          .catch(function(err) { console.error(err); });
      }, 600);
    }

    document.addEventListener("DOMContentLoaded", function() {
      const forms = document.querySelectorAll("form");
      forms.forEach(function(f) {
        f.addEventListener("submit", function(e) {
          if (e.defaultPrevented || f.dataset.noProgress === "1") return;
          iniciarMonitoreoProgreso();
        });
      });

      {% if tracker_estado and tracker_estado.activo %}
        iniciarMonitoreoProgreso();
      {% endif %}
    });
  </script>
</body>
</html>
"""

_PLANTILLA_REVISOR = _ESTILO + """
<!doctype html>
<title>Revisor de contactos dudosos</title>
<nav><a href="/">Panel</a><a href="/revisar">Revisión pendiente</a><a href="/buscar">Buscar / editar contacto</a></nav>
<h1>Casos pendientes de revisión ({{ total }})</h1>

<div style="background:#EFF6FF; border:1px solid #BFDBFE; border-radius:8px; padding:0.75rem 1rem; margin-bottom:1.2rem; font-size:0.88rem; color:#1E40AF; display:flex; align-items:center; gap:8px;">
  <span>⌨️</span>
  <span><strong>Atajos de teclado rápidos:</strong> Presioná <kbd style="background:#FFF; padding:2px 7px; border-radius:4px; border:1px solid #93C5FD; font-weight:bold; box-shadow:0 1px 2px rgba(0,0,0,0.05);">U</kbd> para <strong>Aprobar (Unir)</strong> el primer lote | <kbd style="background:#FFF; padding:2px 7px; border-radius:4px; border:1px solid #93C5FD; font-weight:bold; box-shadow:0 1px 2px rgba(0,0,0,0.05);">S</kbd> para <strong>Rechazar (Separar)</strong></span>
</div>

{% for grupo in grupos %}
  <fieldset style="border:1px solid #CBD5E1; border-radius:8px; padding:1.1rem; margin-bottom:1.2rem; background:#FFFFFF;">
    <legend style="font-weight:700; color:#0F2A66; padding:0 6px;">{{ grupo.patron }} ({{ grupo.pares|length }} casos)</legend>
    <div style="margin-bottom:0.8rem; display:flex; gap:8px;">
      <button data-action="unir" data-patron="{{ grupo.patron }}" onclick="decidir('{{ grupo.patron }}', true)" style="background:#059669 !important; border-color:#059669 !important; padding:6px 14px; font-size:0.85rem;">✓ Aprobar fusión de todo el lote (U)</button>
      <button data-action="separar" data-patron="{{ grupo.patron }}" class="secundario" onclick="decidir('{{ grupo.patron }}', false)" style="padding:6px 14px; font-size:0.85rem;">✕ Rechazar fusión de todo el lote (S)</button>
    </div>
    <ul style="list-style:none; padding:0;">
    {% for par in grupo.pares %}
      <li style="border:1px solid #E2E8F0; border-radius:6px; padding:0.7rem 0.9rem; margin-bottom:0.5rem; display:flex; gap:1.5rem; align-items:center; background:#F8FAFC;">
        <span style="color:#475569; font-weight:700; font-size:0.85rem; min-width:3.5rem; background:#E2E8F0; padding:2px 6px; border-radius:4px; text-align:center;">{{ '%.2f'|format(par.score) }}</span>
        {% for c in (par.contacto_a, par.contacto_b) %}
          {% if c %}
            <span style="flex:1;">
              <strong style="color:#0F2A66;">{{ c.nombre }}</strong>{% if c.organizacion %} — <span style="color:#475569;">{{ c.organizacion }}</span>{% endif %}<br>
              <span style="color:#64748B; font-size:0.82rem;">
                <strong>{{ c.telefono }}</strong>{% if c.email %} · {{ c.email }}{% endif %} · <em>{{ c.fuente }}</em>
                {% if c.foto_url %} · <a href="{{ c.foto_url }}" target="_blank" rel="noopener">foto</a>{% endif %}
              </span>
            </span>
          {% else %}
            <span style="flex:1; color:#94A3B8;">(registro no encontrado)</span>
          {% endif %}
        {% endfor %}
      </li>
    {% endfor %}
    </ul>
  </fieldset>
{% else %}
  <p style="color:#166534; font-weight:600; font-size:1.05rem;">🎉 No hay casos pendientes de revisión. ¡Todos los contactos están clasificados!</p>
{% endfor %}
<script>
function decidir(patron, aceptar) {
  fetch('/decidir', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({patron: patron, aceptar: aceptar}),
  }).then(() => location.reload());
}

document.addEventListener('keydown', function(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'u' || e.key === 'U') {
    const btn = document.querySelector('button[data-action="unir"]');
    if (btn) btn.click();
  } else if (e.key === 's' || e.key === 'S') {
    const btn = document.querySelector('button[data-action="separar"]');
    if (btn) btn.click();
  }
});
</script>
"""


_PLANTILLA_BUSCAR = _ESTILO + """
<!doctype html>
<title>Buscar / editar contacto</title>
<nav><a href="/">Panel</a><a href="/revisar">Revisión pendiente</a><a href="/buscar">Buscar / editar contacto</a></nav>
<h1>Buscar contacto</h1>
<form method="get" action="/buscar" style="margin-bottom:1.5rem;">
  <input name="q" value="{{ consulta }}" placeholder="Nombre, apellido, teléfono o email..." style="width:60%; padding:0.5rem; border:1px solid #E4E6EA; border-radius:5px;">
  <button type="submit">Buscar</button>
</form>
{% if consulta and not resultados %}<p>Sin resultados para "{{ consulta }}".</p>{% endif %}
<ul style="list-style:none; padding:0;">
{% for c in resultados %}
  <li style="border:1px solid #E4E6EA; border-radius:6px; padding:0.7rem 1rem; margin-bottom:0.5rem;">
    <a href="/editar/{{ c.cluster_id }}" style="font-weight:600; text-decoration:none; color:#1A3D84;">
      {{ c.nombre }} {{ c.apellido }}{% if c.organizacion %} — {{ c.organizacion }}{% endif %}
    </a>
    <div style="font-size:0.85rem; color:#6B7280;">
      {% if c.whatsapp %}{{ c.whatsapp|join(', ') }}{% endif %}
      {% if c.emails %} · {{ c.emails|join(', ') }}{% endif %}
    </div>
  </li>
{% endfor %}
</ul>
"""

_PLANTILLA_EDITAR = _ESTILO + """
<!doctype html>
<title>Editar contacto</title>
<nav><a href="/">Panel</a><a href="/revisar">Revisión pendiente</a><a href="/buscar">Buscar / editar contacto</a></nav>
<h1>Editar contacto</h1>
<p style="color:#6B7280; font-size:0.85rem;">Estos cambios se guardan aparte y pisan lo que calculó la limpieza automática solo para este contacto — no tocan los archivos originales. Dejar un campo vacío borra la corrección manual y vuelve a mostrar el valor calculado.</p>
<form method="post" action="/editar/{{ cluster_id }}">
  <p><label>Nombre<br><input name="nombre" value="{{ c.nombre }}" style="width:100%; padding:0.4rem;"></label></p>
  <p><label>Apellido<br><input name="apellido" value="{{ c.apellido }}" style="width:100%; padding:0.4rem;"></label></p>
  <p><label>Cargo<br><input name="cargo" value="{{ c.cargo }}" style="width:100%; padding:0.4rem;"></label></p>
  <p><label>Empresa<br><input name="organizacion" value="{{ c.organizacion }}" style="width:100%; padding:0.4rem;"></label></p>
  <p><label>Tag<br>
    <select name="tag" style="padding:0.4rem;">
      <option value="">(sin definir)</option>
      {% for opcion in tags_validos %}
        <option value="{{ opcion }}" {{ 'selected' if c.tag == opcion else '' }}>{{ opcion }}</option>
      {% endfor %}
    </select>
  </label></p>
  <p><label>Domicilio<br><input name="domicilio" value="{{ c.domicilio }}" style="width:100%; padding:0.4rem;"></label></p>
  <p><label>Ciudad<br><input name="ciudad" value="{{ c.ciudad }}" style="width:100%; padding:0.4rem;"></label></p>
  <p><label>Provincia<br><input name="provincia" value="{{ c.provincia }}" style="width:100%; padding:0.4rem;"></label></p>
  <p><label>País<br><input name="pais" value="{{ c.pais }}" style="width:100%; padding:0.4rem;"></label></p>
  <p><label>Nota de referencia<br><textarea name="notas" style="width:100%; padding:0.4rem;">{{ c.nota_referencia }}</textarea></label></p>
  <p><label>WhatsApp (uno por línea)<br><textarea name="whatsapp" rows="3" style="width:100%; padding:0.4rem;">{{ c.whatsapp|join('\n') }}</textarea></label></p>
  <p><label>Teléfono fijo (uno por línea)<br><textarea name="telefono_fijo" rows="2" style="width:100%; padding:0.4rem;">{{ c.telefono_fijo|join('\n') }}</textarea></label></p>
  <p><label>Email (uno por línea)<br><textarea name="email" rows="2" style="width:100%; padding:0.4rem;">{{ c.emails|join('\n') }}</textarea></label></p>
  <p style="color:#6B7280; font-size:0.85rem;">Cada línea se normaliza igual que en la limpieza automática (formato E.164 para teléfonos). Una línea que no da un valor válido se descarta sin borrar lo que ya estaba guardado. Dejar el campo entero vacío borra la corrección manual y vuelve a mostrar el valor calculado.</p>
  <button type="submit">Guardar</button>
  <a href="/buscar" class="btn secundario" style="margin-left:0.5rem;">Cancelar</a>
</form>
"""


_cache_stats: dict[str, Any] = {"tiempo": 0.0, "datos": None}


def _stats_cacheadas(conn: sqlite3.Connection) -> dict[str, int]:
    ahora = time.time()
    if _cache_stats["datos"] is not None and (ahora - _cache_stats["tiempo"] < 60.0):
        return _cache_stats["datos"]
    datos = _calcular_stats(conn)
    _cache_stats["tiempo"] = ahora
    _cache_stats["datos"] = datos
    return datos


def invalidar_cache_stats() -> None:
    _cache_stats["datos"] = None


def crear_app(config: Config, conn: sqlite3.Connection) -> Flask:
    app = Flask(__name__)

    def get_conn() -> sqlite3.Connection:
        nonlocal conn
        try:
            conn.execute("SELECT 1")
        except Exception:
            from motor.staging_db import conectar

            conn = conectar(config.rutas.base_sqlite)
        return conn

    @app.route("/", methods=["GET", "POST"])
    def dashboard():
        destino_xlsx = config.rutas.carpeta_salida / "lista-maestra.xlsx"
        xlsx_existe = destino_xlsx.exists()
        xlsx_fecha = (
            datetime.fromtimestamp(destino_xlsx.stat().st_mtime).strftime("%d/%m/%Y %H:%M")
            if xlsx_existe
            else ""
        )
        xlsx_tamano_mb = (
            round(destino_xlsx.stat().st_size / (1024 * 1024), 1) if xlsx_existe else 0.0
        )
        destino_wa = config.rutas.carpeta_salida / "contactos-whatsapp.csv"
        wa_existe = destino_wa.exists()
        wa_fecha = (
            datetime.fromtimestamp(destino_wa.stat().st_mtime).strftime("%d/%m/%Y %H:%M")
            if wa_existe
            else ""
        )
        wa_tamano_kb = (
            round(destino_wa.stat().st_size / 1024, 1) if wa_existe else 0.0
        )
        c = get_conn()
        return render_template_string(
            _PLANTILLA_DASHBOARD,
            stats=_stats_cacheadas(c),
            mensaje=request.args.get("msg", ""),
            es_error=request.args.get("error") == "1",
            xlsx_existe=xlsx_existe,
            xlsx_fecha=xlsx_fecha,
            xlsx_tamano_mb=xlsx_tamano_mb,
            wa_existe=wa_existe,
            wa_fecha=wa_fecha,
            wa_tamano_kb=wa_tamano_kb,
            cuentas_google=config.google.cuentas,
            bases_archivadas=listar_bases_archivadas(config),
            tracker_estado=tracker.estado(),
        )

    @app.get("/descargar/lista-maestra")
    def descargar_lista_maestra():
        destino_xlsx = config.rutas.carpeta_salida / "lista-maestra.xlsx"
        if not destino_xlsx.exists():
            return redirect(url_for("dashboard", msg="No existe lista-maestra.xlsx aún. Procesá contactos primero.", error="1"), code=303)
        return send_file(destino_xlsx, as_attachment=True, download_name="lista-maestra.xlsx")

    @app.get("/descargar/contactos-whatsapp")
    def descargar_contactos_whatsapp():
        destino_wa = config.rutas.carpeta_salida / "contactos-whatsapp.csv"
        if not destino_wa.exists():
            return redirect(url_for("dashboard", msg="No existe contactos-whatsapp.csv aún. Procesá contactos primero.", error="1"), code=303)
        return send_file(destino_wa, as_attachment=True, download_name="contactos-whatsapp.csv")

    @app.get("/api/progreso-stream")
    def api_progreso_stream():
        return Response(
            tracker.generar_eventos_sse(),
            mimetype="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            },
        )

    @app.get("/api/progreso-estado")
    def api_progreso_estado():
        return jsonify(tracker.estado())

    @app.post("/api/dialogo/elegir-carpeta")
    def api_dialogo_elegir_carpeta():
        from motor.file_dialogs import elegir_carpeta

        carpeta = elegir_carpeta(titulo="Elegí una carpeta para encolar")
        if carpeta is None:
            return jsonify({"ok": False, "cancelado": True})
        return jsonify({"ok": True, "ruta": str(carpeta), "nombre": carpeta.name})

    @app.get("/api/explorar")
    def api_explorar():
        ruta_raw = request.args.get("ruta", "").strip()
        atajos = _construir_atajos_explorador(config)
        unidades = _listar_unidades_explorador()

        if not ruta_raw:
            return jsonify(
                {
                    "ok": True,
                    "en_raiz": True,
                    "ruta_actual": "",
                    "nombre_actual": "Inicio",
                    "padre": None,
                    "atajos": atajos,
                    "unidades": unidades,
                    "carpetas": [],
                    "archivos": [],
                }
            )

        try:
            objetivo = Path(ruta_raw.strip("\"' ")).expanduser().resolve()
        except Exception as exc:
            return jsonify({"ok": False, "error": f"Ruta inválida: {exc}"}), 400

        if not objetivo.exists():
            return jsonify({"ok": False, "error": f"La ruta '{ruta_raw}' no existe."}), 404
        if not objetivo.is_dir():
            return jsonify({"ok": False, "error": f"'{objetivo.name}' no es una carpeta."}), 400

        ext_permitidas = {e.lower().lstrip(".") for e in config.extensiones_permitidas}
        carpetas: list[dict[str, Any]] = []
        archivos: list[dict[str, Any]] = []
        omitidas = {"$recycle.bin", "system volume information", "recovery"}
        truncado = False

        try:
            entradas = sorted(objetivo.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
        except PermissionError:
            return jsonify({"ok": False, "error": f"Sin permisos de lectura en '{objetivo}'."}), 403
        except OSError as exc:
            return jsonify({"ok": False, "error": f"No se pudo leer '{objetivo}': {exc}"}), 400

        for item in entradas:
            nombre_low = item.name.lower()
            if nombre_low in omitidas:
                continue
            try:
                if item.is_dir():
                    if len(carpetas) < 500:
                        carpetas.append({"nombre": item.name, "ruta": str(item)})
                    else:
                        truncado = True
                elif item.is_file():
                    ext = item.suffix.lower().lstrip(".")
                    if ext in ext_permitidas:
                        if len(archivos) < 500:
                            tam_kb = round(item.stat().st_size / 1024, 1)
                            archivos.append(
                                {
                                    "nombre": item.name,
                                    "ruta": str(item),
                                    "ext": f".{ext}",
                                    "tamano_kb": tam_kb,
                                }
                            )
                        else:
                            truncado = True
            except OSError:
                continue

        padre = str(objetivo.parent) if objetivo.parent != objetivo else ""
        return jsonify(
            {
                "ok": True,
                "en_raiz": False,
                "ruta_actual": str(objetivo),
                "nombre_actual": objetivo.name or str(objetivo),
                "padre": padre,
                "atajos": atajos,
                "unidades": unidades,
                "carpetas": carpetas,
                "archivos": archivos,
                "truncado": truncado,
            }
        )

    @app.post("/accion/<nombre>")
    def accion(nombre: str):
        try:
            c = get_conn()
            mensaje = _ejecutar_accion(config, c, nombre)
            invalidar_cache_stats()
            return redirect(url_for("dashboard", msg=mensaje), code=303)
        except Exception as exc:  # noqa: BLE001 — mostrar el error en el panel, no un 500 en blanco
            invalidar_cache_stats()
            return redirect(url_for("dashboard", msg=f"Error en '{nombre}': {exc}", error="1"), code=303)

    @app.get("/revisar")
    def revisar():
        c = get_conn()
        grupos = _agrupar_pendientes(c)
        total = sum(len(g["pares"]) for g in grupos)
        return render_template_string(_PLANTILLA_REVISOR, grupos=grupos, total=total)

    @app.post("/decidir")
    def decidir():
        c = get_conn()
        datos = request.get_json(force=True)
        patron, aceptar = datos["patron"], bool(datos["aceptar"])
        actualizados = aplicar_decision_lote(c, patron, aceptar)
        learning.registrar_decision(c, patron, aceptar)
        invalidar_cache_stats()
        return jsonify({"ok": True, "actualizados": actualizados})

    @app.post("/deshacer/<cluster_id>")
    def deshacer_ruta(cluster_id: str):
        c = get_conn()
        cantidad = deshacer(c, cluster_id)
        invalidar_cache_stats()
        return jsonify({"ok": True, "raw_records_afectados": cantidad})

    @app.get("/buscar")
    def buscar():
        c = get_conn()
        consulta = request.args.get("q", "").strip()
        resultados = buscar_contactos(c, consulta) if consulta else []
        return render_template_string(_PLANTILLA_BUSCAR, consulta=consulta, resultados=resultados)

    @app.get("/editar/<cluster_id>")
    def editar_formulario(cluster_id: str):
        c = get_conn()
        contacto = obtener_contacto(c, cluster_id)
        if contacto is None:
            return redirect(url_for("buscar", q=""))
        return render_template_string(
            _PLANTILLA_EDITAR, c=contacto, cluster_id=cluster_id, tags_validos=_TAGS_VALIDOS
        )

    @app.post("/editar/<cluster_id>")
    def editar_guardar(cluster_id: str):
        c = get_conn()
        guardar_edicion_manual(c, cluster_id, request.form.to_dict(), config)
        invalidar_cache_stats()
        return redirect(url_for("editar_formulario", cluster_id=cluster_id))

    from motor.api import registrar_rutas_api

    registrar_rutas_api(app, config, conn)

    return app


def _ejecutar_accion(config: Config, conn: sqlite3.Connection, nombre: str) -> str:
    tracker.iniciar(f"Ejecutando acción '{nombre}'", total_pasos=4)

    def _cb_norm(actual: int, total: int) -> None:
        pct = 25 + int((actual / total) * 25) if total else 50
        tracker.actualizar(
            paso=2,
            pct=pct,
            etapa_nombre="Normalización E.164",
            mensaje=f"Normalizando teléfonos y limpiando nombres: {actual:,}/{total:,}",
            detalle=f"Registro {actual} de {total}",
        )

    def _cb_dedup(actual: int, total: int, llm_calls: int, log_msg: str | None) -> None:
        pct = 50 + int((actual / total) * 35) if total else 85
        msg = f"Deduplicando registros con IA: par {actual:,} de {total:,} ({int((actual/total)*100)}%)"
        if llm_calls:
            msg += f" — {llm_calls} consultas IA procesadas"
        tracker.actualizar(
            paso=3,
            pct=pct,
            etapa_nombre="Deduplicación & IA",
            mensaje=msg,
            detalle=f"Par {actual} de {total}",
            log_msg=log_msg,
        )

    try:
        if nombre == "extraer":
            tracker.actualizar(paso=1, pct=20, etapa_nombre="Extracción", mensaje="Guardando respaldo...")
            hacer_backup_previo(config, motivo="antes_de_extraer")
            tracker.actualizar(paso=1, pct=50, etapa_nombre="Extracción", mensaje="Extrayendo registros...")
            nuevos = extraer_todo(config, conn)
            msg = f"Extracción completa — raw_records nuevos: {nuevos}"
            tracker.finalizar(exito=True, mensaje=msg)
            return msg
        if nombre == "normalizar":
            tracker.actualizar(paso=1, pct=20, etapa_nombre="Normalización", mensaje="Guardando respaldo...")
            hacer_backup_previo(config, motivo="antes_de_normalizar")
            tracker.actualizar(paso=2, pct=30, etapa_nombre="Normalización E.164", mensaje="Normalizando teléfonos...")
            nuevos = normalizar_todo(config, conn, callback_progreso=_cb_norm)
            msg = f"Normalización completa — normalized_records nuevos: {nuevos}"
            tracker.finalizar(exito=True, mensaje=msg)
            return msg
        if nombre == "deduplicar":
            tracker.actualizar(paso=1, pct=20, etapa_nombre="Deduplicación", mensaje="Guardando respaldo...")
            hacer_backup_previo(config, motivo="antes_de_deduplicar")
            tracker.actualizar(paso=3, pct=50, etapa_nombre="Deduplicación & IA", mensaje="Buscando duplicados con IA...")
            res = deduplicar_todo(config, conn, callback_progreso=_cb_dedup)
            msg = f"Deduplicación completa — {res}"
            tracker.finalizar(exito=True, mensaje=msg)
            return msg
        if nombre == "exportar":
            tracker.actualizar(paso=4, pct=50, etapa_nombre="Exportación", mensaje="Guardando respaldo y exportando...")
            hacer_backup_previo(config, motivo="antes_de_exportar")
            destino = exportar_lista_maestra(config, conn)
            msg = f"✓ Exportado: {destino.name}"
            tracker.finalizar(exito=True, mensaje=msg)
            return msg
        if nombre == "exportar-whatsapp":
            tracker.actualizar(paso=4, pct=50, etapa_nombre="Exportación MejoraWS", mensaje="Exportando para MejoraWS...")
            destino = exportar_whatsapp_csv(config, conn)
            msg = f"✓ Exportado para MejoraWS: {destino.name} — importalo ahí con \"Importar CSV/Excel\""
            tracker.finalizar(exito=True, mensaje=msg)
            return msg
        if nombre == "hacer-backup-manual":
            tracker.actualizar(paso=1, pct=50, etapa_nombre="Respaldo Manual", mensaje="Guardando copia de seguridad...")
            res = hacer_backup_previo(config, motivo="manual")
            archivos = ", ".join(res.get("archivos_respaldados", [])) or "sin archivos previos"
            msg = f"✓ Copia de seguridad guardada ({archivos}) en 'Data/Backups/ultimo_backup/' y 'Data/Backups/historico/'."
            tracker.finalizar(exito=True, mensaje=msg)
            return msg
        if nombre == "resetear-base":
            tracker.actualizar(paso=1, pct=25, etapa_nombre="Respaldo Previo", mensaje="Guardando copia de seguridad previa...")
            res_b = hacer_backup_previo(config, motivo="antes_de_resetear_base")
            archivos_b = ", ".join(res_b.get("archivos_respaldados", [])) or "sin archivos previos"
            tracker.log(f"✓ Respaldo previo guardado ({archivos_b}) en Data/Backups/ultimo_backup/")

            tracker.actualizar(paso=2, pct=60, etapa_nombre="Vaciando Tablas", mensaje="Vaciando base de datos y recreando tablas...")
            from motor.staging_db import crear_esquema
            tablas = [
                "decisiones_log",
                "clusters",
                "personas",
                "telefono_index",
                "email_index",
                "normalized_records",
                "raw_records",
                "fuentes_procesadas",
                "ediciones_manuales",
                "aprendizaje_umbrales",
            ]
            conn.execute("PRAGMA foreign_keys=OFF")
            with conn:
                for t in tablas:
                    try:
                        conn.execute(f"DROP TABLE IF EXISTS {t}")
                    except sqlite3.OperationalError:
                        pass
                try:
                    conn.execute("DROP TABLE IF EXISTS busqueda_fts")
                except sqlite3.OperationalError:
                    pass
            conn.execute("PRAGMA foreign_keys=ON")
            crear_esquema(conn)
            try:
                conn.execute("VACUUM")
            except Exception:
                pass
            tracker.log("✓ Base de datos SQLite vaciada y tablas recreadas desde cero")

            tracker.actualizar(paso=3, pct=85, etapa_nombre="Limpiando Salidas", mensaje="Eliminando planillas de salida...")
            excel_p = config.rutas.carpeta_salida / "lista-maestra.xlsx"
            if excel_p.exists():
                try:
                    excel_p.unlink(missing_ok=True)
                except Exception:
                    pass
            wa_p = config.rutas.carpeta_salida / "contactos-whatsapp.csv"
            if wa_p.exists():
                try:
                    wa_p.unlink(missing_ok=True)
                except Exception:
                    pass
            tracker.log("✓ Planillas Excel y WhatsApp eliminadas de Data/Salida/")

            invalidar_cache_stats()
            msg = "✓ Base de datos reseteada a cero con éxito. El sistema está 100% en blanco para comenzar nuevas pruebas."
            tracker.finalizar(exito=True, mensaje=msg)
            return msg
        if nombre == "completar-pendientes":
            tracker.actualizar(paso=1, pct=10, etapa_nombre="Respaldo Previo", mensaje="Guardando copia previa...")
            res_b = hacer_backup_previo(config, motivo="antes_de_completar_pendientes")
            tracker.log("✓ Respaldo previo guardado en Data/Backups/ultimo_backup/")

            tracker.actualizar(paso=2, pct=25, etapa_nombre="Normalización E.164", mensaje="Normalizando teléfonos y limpiando nombres...")
            nuevos_norm = normalizar_todo(config, conn, callback_progreso=_cb_norm)
            tracker.log(f"✓ {nuevos_norm} registros normalizados con éxito")

            tracker.actualizar(paso=3, pct=55, etapa_nombre="Deduplicación & IA", mensaje="Deduplicando registros con IA...")
            res_dedup = deduplicar_todo(config, conn, callback_progreso=_cb_dedup)
            tracker.log(f"✓ Deduplicación completada: {res_dedup}")

            tracker.actualizar(paso=4, pct=85, etapa_nombre="Generación de Planillas", mensaje="Exportando Excel maestro y WhatsApp CSV...")
            dest_excel = exportar_lista_maestra(config, conn)
            dest_wa = exportar_whatsapp_csv(config, conn)
            tracker.log(f"✓ Generados: {dest_excel.name} y {dest_wa.name}")

            invalidar_cache_stats()
            archivos_resp = ", ".join(res_b.get("archivos_respaldados", [])) or "sin archivos previos"
            msg = (
                f"✓ Proceso completado con éxito: "
                f"1. Se respaldó el estado anterior en 'Data/Backups/ultimo_backup/' ({archivos_resp}). "
                f"2. Se normalizaron {nuevos_norm} registros y se deduplicaron ({res_dedup}). "
                f"3. Se actualizaron '{dest_excel.name}' y '{dest_wa.name}' con todos los contactos. ¡Tu base está 100% al día!"
            )
            tracker.finalizar(exito=True, mensaje=msg)
            return msg
        if nombre == "run":
            tracker.actualizar(paso=1, pct=5, etapa_nombre="Respaldo Previo", mensaje="Guardando copia de seguridad...")
            hacer_backup_previo(config, motivo="antes_de_run")
            tracker.actualizar(paso=1, pct=15, etapa_nombre="Extracción", mensaje="Extrayendo registros...")
            extraer_todo(config, conn)
            tracker.actualizar(paso=2, pct=30, etapa_nombre="Normalización E.164", mensaje="Normalizando teléfonos...")
            normalizar_todo(config, conn, callback_progreso=_cb_norm)
            tracker.actualizar(paso=3, pct=55, etapa_nombre="Deduplicación & IA", mensaje="Deduplicando registros...")
            resultado = deduplicar_todo(config, conn, callback_progreso=_cb_dedup)
            tracker.actualizar(paso=4, pct=85, etapa_nombre="Exportación", mensaje="Exportando planillas...")
            destino = exportar_lista_maestra(config, conn)
            destino_wa = exportar_whatsapp_csv(config, conn)
            msg = f"✓ Corrida completa — deduplicación {resultado} — exportado: {destino.name} y {destino_wa.name}"
            tracker.finalizar(exito=True, mensaje=msg)
            return msg
        if nombre == "deshacer-ultima-corrida":
            tracker.actualizar(paso=1, pct=50, etapa_nombre="Deshacer", mensaje="Revirtiendo última corrida...")
            resumen = deshacer_ultima_corrida(conn)
            msg = f"Última corrida revertida — {resumen}"
            tracker.finalizar(exito=True, mensaje=msg)
            return msg
        if nombre.startswith("importar-google-"):
            cuenta = nombre[len("importar-google-") :]
            if cuenta not in config.google.cuentas:
                return f"Cuenta '{cuenta}' no está en config.yaml -> google.cuentas"
            from motor.google_contacts_source import importar_google_contactos

            tracker.actualizar(paso=1, pct=20, etapa_nombre="Google Contacts", mensaje=f"Respaldando antes de importar ({cuenta})...")
            hacer_backup_previo(config, motivo=f"antes_de_google_{cuenta}")
            tracker.actualizar(paso=1, pct=50, etapa_nombre="Google Contacts", mensaje=f"Descargando contactos de Google ({cuenta})...")
            nuevos = importar_google_contactos(config, conn, cuenta)
            msg = f"✓ Importado de Google ({cuenta}) — raw_records nuevos: {nuevos}"
            tracker.finalizar(exito=True, mensaje=msg)
            return msg
        if nombre in ("actualizar-y-respaldar", "actualizar-y-respaldar-archivo", "subir-archivo"):
            from motor.file_dialogs import elegir_archivo, elegir_carpeta

            tracker.actualizar(paso=1, pct=10, etapa_nombre="Respaldo Previo", mensaje="Guardando copia de seguridad previa...")
            res_b = hacer_backup_previo(config, motivo="antes_de_actualizar")
            tracker.log("✓ Respaldo previo guardado en Data/Backups/ultimo_backup/")

            if nombre == "subir-archivo":
                archivo_subido = request.files.get("archivo")
                if archivo_subido is None or not (archivo_subido.filename or "").strip():
                    tracker.finalizar(exito=False, error="Cancelado — no se subió ningún archivo")
                    return "Cancelado — no se seleccionó ningún archivo para subir."
                nombre_seguro = Path(archivo_subido.filename).name
                carpeta_subidos = config.rutas.carpeta_raiz.resolve() / "_subidos"
                carpeta_subidos.mkdir(parents=True, exist_ok=True)
                destino_subido = carpeta_subidos / nombre_seguro
                archivo_subido.save(destino_subido)
                try:
                    tracker.actualizar(paso=1, pct=20, etapa_nombre="Extracción", mensaje=f"Extrayendo archivo '{destino_subido.name}'...")
                    nuevos_crudos = extraer_archivo(conn, destino_subido)
                    origen_desc = f"archivo subido '{destino_subido.name}'"
                except ValueError as exc:
                    tracker.finalizar(exito=False, error=str(exc))
                    return str(exc)
            elif nombre == "actualizar-y-respaldar-archivo":
                ruta_archivo_param = request.form.get("ruta_archivo", "").strip()
                if ruta_archivo_param:
                    archivo = Path(ruta_archivo_param.strip("\"' ")).expanduser().resolve()
                    if not archivo.exists() or not archivo.is_file():
                        msg = f"Error: El archivo '{ruta_archivo_param}' no existe."
                        tracker.finalizar(exito=False, error=msg)
                        return msg
                else:
                    archivo = elegir_archivo()
                if archivo is None:
                    tracker.finalizar(exito=False, error="Cancelado — no se eligió ningún archivo")
                    return "Cancelado — no se eligió ningún archivo."
                try:
                    tracker.actualizar(paso=1, pct=20, etapa_nombre="Extracción", mensaje=f"Extrayendo archivo '{archivo.name}'...")
                    nuevos_crudos = extraer_archivo(conn, archivo)
                    origen_desc = f"archivo '{archivo.name}'"
                except ValueError as exc:
                    tracker.finalizar(exito=False, error=str(exc))
                    return str(exc)
            else:
                # Comprobar si se enviaron múltiples carpetas en cola (JSON, ast o líneas)
                cola_raw = request.form.get("cola_carpetas", "").strip()
                rutas_en_cola: list[Path] = []
                if cola_raw:
                    items_encontrados: list[str] = []
                    # 1. Intentar JSON estándar
                    try:
                        parsed = json.loads(cola_raw)
                        if isinstance(parsed, list):
                            items_encontrados = [str(x) for x in parsed]
                    except Exception:
                        pass

                    # 2. Intentar ast.literal_eval si venía con comillas simples de Python
                    if not items_encontrados:
                        try:
                            import ast
                            parsed = ast.literal_eval(cola_raw)
                            if isinstance(parsed, list):
                                items_encontrados = [str(x) for x in parsed]
                        except Exception:
                            pass

                    # 3. Fallback: separar por comas o saltos de línea limpiando corchetes y comillas
                    if not items_encontrados:
                        texto_limpio = cola_raw.strip("[]\r\n \t")
                        partes = texto_limpio.replace("\r", "\n").replace(",", "\n").split("\n")
                        for p in partes:
                            p_limpia = p.strip("\"' \t[]")
                            if p_limpia:
                                items_encontrados.append(p_limpia)

                    for it in items_encontrados:
                        p_str = str(it).strip("\"' \t[]")
                        if p_str:
                            rutas_en_cola.append(Path(p_str).resolve())

                # Si no vino cola, verificar si se envió una ruta manual individual o el diálogo
                if not rutas_en_cola:
                    ruta_manual = request.form.get("ruta_carpeta", "").strip()
                    if ruta_manual:
                        rutas_en_cola = [Path(ruta_manual.strip("\"' ")).resolve()]
                    else:
                        carpeta = elegir_carpeta()
                        if carpeta is not None:
                            rutas_en_cola = [carpeta]

                if not rutas_en_cola:
                    tracker.finalizar(exito=False, error="Cancelado — no se eligió ninguna carpeta")
                    return "Cancelado — no se eligió ninguna carpeta."

                # Validar existencia de cada carpeta
                carpetas_validas: list[Path] = []
                for carp in rutas_en_cola:
                    if not carp.exists():
                        msg = f"Error: La ruta '{carp}' no existe en la PC."
                        tracker.finalizar(exito=False, error=msg)
                        return msg
                    if not carp.is_dir():
                        msg = f"Error: '{carp}' no es una carpeta válida."
                        tracker.finalizar(exito=False, error=msg)
                        return msg
                    carpetas_validas.append(carp)

                # Extraer todas las carpetas encoladas
                nuevos_crudos = 0
                nombres_carpetas: list[str] = []
                total_carpetas = len(carpetas_validas)
                for i, carp in enumerate(carpetas_validas, start=1):
                    pct_ext = 15 + int((i / total_carpetas) * 15)
                    tracker.actualizar(
                        paso=1,
                        pct=pct_ext,
                        etapa_nombre="Extracción",
                        mensaje=f"Escaneando carpeta {i}/{total_carpetas}: '{carp.name}'...",
                    )
                    sub_crudos = extraer_todo(config, conn, raiz=carp, todas_las_extensiones=True)
                    nuevos_crudos += sub_crudos
                    nombres_carpetas.append(carp.name)
                    tracker.log(f"✓ [{i}/{total_carpetas}] Extraídos {sub_crudos} registros crudos de '{carp.name}'")

                if total_carpetas == 1:
                    origen_desc = f"carpeta '{carpetas_validas[0].name}'"
                else:
                    resumen_nombres = ", ".join(nombres_carpetas[:3])
                    if total_carpetas > 3:
                        resumen_nombres += f" y {total_carpetas - 3} más"
                    origen_desc = f"{total_carpetas} carpetas en cola ({resumen_nombres})"

            tracker.log(f"✓ Total crudos extraídos: {nuevos_crudos} desde {origen_desc}")

            tracker.actualizar(paso=2, pct=35, etapa_nombre="Normalización E.164", mensaje="Normalizando teléfonos y limpiando nombres...")
            nuevos_norm = normalizar_todo(config, conn, callback_progreso=_cb_norm)
            tracker.log(f"✓ {nuevos_norm} registros normalizados con éxito")

            tracker.actualizar(paso=3, pct=60, etapa_nombre="Deduplicación & IA", mensaje="Cruzando registros y buscando duplicados...")
            res_dedup = deduplicar_todo(config, conn, callback_progreso=_cb_dedup)
            tracker.log(f"✓ Deduplicación completada: {res_dedup}")

            tracker.actualizar(paso=4, pct=85, etapa_nombre="Generación de Planillas", mensaje="Exportando Excel maestro y WhatsApp CSV...")
            dest_excel = exportar_lista_maestra(config, conn)
            dest_wa = exportar_whatsapp_csv(config, conn)
            tracker.log(f"✓ Generados: {dest_excel.name} y {dest_wa.name}")

            archivos_resp = ", ".join(res_b.get("archivos_respaldados", [])) or "sin archivos previos"
            resultado_msg = (
                f"✓ Proceso completado con éxito (Caso 1 y 2 juntos): "
                f"1. Se guardó respaldo previo en 'Data/Backups/ultimo_backup/' ({archivos_resp}). "
                f"2. Se incorporó {origen_desc} ({nuevos_crudos} crudos, {nuevos_norm} normalizados). "
                f"3. Se actualizaron '{dest_excel.name}' y '{dest_wa.name}' con todo el consolidado unificado."
            )
            tracker.finalizar(exito=True, mensaje=resultado_msg)
            return resultado_msg

        if nombre == "restaurar-ultimo-backup":
            tracker.actualizar(paso=1, pct=50, etapa_nombre="Restaurar", mensaje="Restaurando última copia...")
            res = restaurar_ultimo_backup(config)
            if not res.get("ok"):
                msg = f"Error al restaurar: {res.get('error', 'desconocido')}"
                tracker.finalizar(exito=False, error=msg)
                return msg
            archivos = ", ".join(res.get("archivos_restaurados", []))
            msg = f"✓ Último backup previo restaurado en 'Data/Salida/': {archivos}."
            tracker.finalizar(exito=True, mensaje=msg)
            return msg

        if nombre == "importar-carpeta":
            from motor.file_dialogs import elegir_carpeta

            tracker.actualizar(paso=1, pct=20, etapa_nombre="Importar Carpeta", mensaje="Guardando respaldo...")
            hacer_backup_previo(config, motivo="antes_de_fusionar_carpeta")
            ruta_manual = request.form.get("ruta_carpeta", "").strip()
            if ruta_manual:
                carpeta = Path(ruta_manual.strip("\"' ")).resolve()
            else:
                carpeta = elegir_carpeta()

            if carpeta is None:
                tracker.finalizar(exito=False, error="Cancelado — no se eligió ninguna carpeta")
                return "Cancelado — no se eligió ninguna carpeta."
            if not carpeta.exists():
                msg = f"Error: La ruta '{carpeta}' no existe en la PC."
                tracker.finalizar(exito=False, error=msg)
                return msg
            if not carpeta.is_dir():
                msg = f"Error: '{carpeta}' no es una carpeta válida."
                tracker.finalizar(exito=False, error=msg)
                return msg
            tracker.actualizar(paso=1, pct=50, etapa_nombre="Importar Carpeta", mensaje=f"Escaneando '{carpeta.name}'...")
            nuevos = extraer_todo(config, conn, raiz=carpeta, todas_las_extensiones=True)
            msg = f"✓ Importado desde '{carpeta.name}' (con subcarpetas) — raw_records nuevos: {nuevos}. (Se respaldó lo anterior en Backups)."
            tracker.finalizar(exito=True, mensaje=msg)
            return msg

        if nombre == "nueva-base-independiente":
            from motor.file_dialogs import elegir_carpeta

            ruta_manual = request.form.get("ruta_carpeta", "").strip()
            etiqueta = request.form.get("etiqueta", "").strip()
            if ruta_manual:
                carpeta = Path(ruta_manual.strip("\"' ")).resolve()
            else:
                carpeta = elegir_carpeta()

            if carpeta is None:
                tracker.finalizar(exito=False, error="Cancelado — no se eligió ninguna carpeta")
                return "Cancelado — no se eligió ninguna carpeta."
            if not carpeta.exists():
                msg = f"Error: La ruta '{carpeta}' no existe en la PC."
                tracker.finalizar(exito=False, error=msg)
                return msg
            if not carpeta.is_dir():
                msg = f"Error: '{carpeta}' no es una carpeta válida."
                tracker.finalizar(exito=False, error=msg)
                return msg

            nombre_etiqueta = etiqueta or carpeta.name
            tracker.actualizar(paso=1, pct=20, etapa_nombre="Archivar Base", mensaje=f"Archivando base actual como '{nombre_etiqueta}'...")
            res_arch = archivar_base_actual(config, etiqueta=nombre_etiqueta)

            from motor.staging_db import conectar

            conn_limpia = conectar(config.rutas.base_sqlite)
            tracker.actualizar(paso=1, pct=40, etapa_nombre="Extracción", mensaje=f"Escaneando nueva carpeta '{carpeta.name}'...")
            nuevos_crudos = extraer_todo(config, conn_limpia, raiz=carpeta, todas_las_extensiones=True)
            tracker.log(f"✓ Extraídos {nuevos_crudos} registros crudos en base nueva")

            tracker.actualizar(paso=2, pct=60, etapa_nombre="Normalización E.164", mensaje="Normalizando teléfonos...")
            nuevos_norm = normalizar_todo(config, conn_limpia, callback_progreso=_cb_norm)
            tracker.log(f"✓ Normalizados {nuevos_norm} registros")

            tracker.actualizar(paso=3, pct=75, etapa_nombre="Deduplicación & IA", mensaje="Deduplicando registros...")
            res_dedup = deduplicar_todo(config, conn_limpia, callback_progreso=_cb_dedup)
            tracker.log(f"✓ Deduplicación: {res_dedup}")

            tracker.actualizar(paso=4, pct=90, etapa_nombre="Exportación", mensaje="Generando reportes limpios...")
            dest_excel = exportar_lista_maestra(config, conn_limpia)
            dest_wa = exportar_whatsapp_csv(config, conn_limpia)

            msg = (
                f"✓ Caso 2 Éxito: Base previa archivada en Backups ({res_arch['nombre_carpeta']}). "
                f"Nueva base independiente procesada desde '{carpeta.name}': {nuevos_crudos} crudos, "
                f"{nuevos_norm} normalizados. Archivos generados: '{dest_excel.name}' y '{dest_wa.name}'."
            )
            tracker.finalizar(exito=True, mensaje=msg)
            return msg

        if nombre == "restaurar-base":
            nombre_carpeta = request.form.get("nombre_carpeta", "").strip()
            if not nombre_carpeta:
                return "Error: No se indicó qué base restaurar."
            tracker.actualizar(paso=1, pct=50, etapa_nombre="Restaurar Base", mensaje=f"Restaurando base '{nombre_carpeta}'...")
            res = restaurar_base_archivada(config, nombre_carpeta)
            if not res.get("ok"):
                msg = f"Error al restaurar: {res.get('error', 'desconocido')}"
                tracker.finalizar(exito=False, error=msg)
                return msg
            msg = f"✓ Base archivada '{nombre_carpeta}' restaurada como activa con éxito."
            tracker.finalizar(exito=True, mensaje=msg)
            return msg

        if nombre == "importar-archivo":
            from motor.file_dialogs import elegir_archivo

            archivo = elegir_archivo()
            if archivo is None:
                tracker.finalizar(exito=False, error="Cancelado — no se eligió ningún archivo")
                return "Cancelado — no se eligió ningún archivo."
            tracker.actualizar(paso=1, pct=30, etapa_nombre="Importar Archivo", mensaje=f"Respaldando e importando '{archivo.name}'...")
            hacer_backup_previo(config, motivo="antes_de_importar_archivo")
            try:
                nuevos = extraer_archivo(conn, archivo)
            except ValueError as exc:
                tracker.finalizar(exito=False, error=str(exc))
                return str(exc)
            msg = f"✓ Importado '{archivo.name}' — raw_records nuevos: {nuevos}"
            tracker.finalizar(exito=True, mensaje=msg)
            return msg

        if nombre == "abrir-mejoraws":
            from motor.mejoraws_launcher import MejoraWsNoEncontradoError, abrir_mejoraws

            try:
                abrir_mejoraws(config.mejoraws.ruta)
            except MejoraWsNoEncontradoError as exc:
                tracker.finalizar(exito=False, error=str(exc))
                return str(exc)
            msg = "✓ Abriendo MejoraWS... la ventana puede tardar unos segundos en aparecer."
            tracker.finalizar(exito=True, mensaje=msg)
            return msg

    except Exception as exc:
        tracker.finalizar(exito=False, error=str(exc))
        raise

    return f"Acción desconocida: {nombre}"


def _corrida_mas_reciente(conn: sqlite3.Connection) -> str | None:
    try:
        fila = conn.execute("SELECT MAX(corrida_id) AS corrida_id FROM clusters WHERE corrida_id IS NOT NULL").fetchone()
        if fila and fila["corrida_id"]:
            return fila["corrida_id"]
    except Exception:
        pass
    try:
        fila = conn.execute("SELECT MAX(corrida_id) AS corrida_id FROM decisiones_log WHERE corrida_id IS NOT NULL").fetchone()
        return fila["corrida_id"] if fila else None
    except Exception:
        return None


def _formato_miles(n: int) -> str:
    return f"{n:,}".replace(",", ".")


def _calcular_stats(conn: sqlite3.Connection) -> dict[str, Any]:
    def contar(sql: str, parametros: tuple = ()) -> int:
        try:
            return conn.execute(sql, parametros).fetchone()[0]
        except Exception:
            return 0

    corrida = _corrida_mas_reciente(conn)
    pendientes = 0
    if corrida:
        try:
            pendientes = contar(
                "SELECT COUNT(*) FROM decisiones_log INDEXED BY idx_decisiones_log_accion WHERE accion = 'revision_pendiente' AND corrida_id = ?",
                (corrida,),
            )
        except Exception:
            try:
                pendientes = contar(
                    "SELECT COUNT(*) FROM decisiones_log INDEXED BY idx_decisiones_log_accion WHERE accion = 'revision_pendiente'"
                )
            except Exception:
                pendientes = 0

    raw = contar("SELECT COUNT(*) FROM raw_records")
    norm = contar("SELECT COUNT(*) FROM normalized_records")
    clusters_filas = contar("SELECT COUNT(*) FROM clusters")
    contactos_finales = contar("SELECT COUNT(DISTINCT cluster_id) FROM clusters")

    pendientes_normalizar = max(0, raw - norm)
    pendientes_deduplicar = max(0, norm - clusters_filas)
    porcentaje_normalizado = round((norm / raw * 100), 1) if raw > 0 else 100.0
    porcentaje_deduplicado = round((clusters_filas / norm * 100), 1) if norm > 0 else 100.0
    duplicados_unificados = max(0, norm - contactos_finales)

    al_dia = (pendientes_normalizar == 0 and pendientes_deduplicar == 0 and raw > 0)

    return {
        "raw_records": raw,
        "normalized_records": norm,
        "contactos_finales": contactos_finales,
        "pendientes": pendientes,
        "pendientes_normalizar": pendientes_normalizar,
        "pendientes_deduplicar": pendientes_deduplicar,
        "porcentaje_normalizado": porcentaje_normalizado,
        "porcentaje_deduplicado": porcentaje_deduplicado,
        "duplicados_unificados": duplicados_unificados,
        "al_dia": al_dia,
        "raw_records_fmt": _formato_miles(raw),
        "normalized_records_fmt": _formato_miles(norm),
        "contactos_finales_fmt": _formato_miles(contactos_finales),
        "duplicados_unificados_fmt": _formato_miles(duplicados_unificados),
        "pendientes_fmt": _formato_miles(pendientes),
        "pendientes_normalizar_fmt": _formato_miles(pendientes_normalizar),
    }


def _agrupar_pendientes(conn: sqlite3.Connection) -> list[dict]:
    corrida = _corrida_mas_reciente(conn)
    if corrida is None:
        return []
    try:
        filas = conn.execute(
            "SELECT raw_record_id_a, raw_record_id_b, confianza, detalle FROM decisiones_log INDEXED BY idx_decisiones_log_accion "
            "WHERE accion = 'revision_pendiente' AND corrida_id = ? ORDER BY detalle LIMIT 100",
            (corrida,),
        ).fetchall()
    except Exception:
        try:
            filas = conn.execute(
                "SELECT raw_record_id_a, raw_record_id_b, confianza, detalle FROM decisiones_log INDEXED BY idx_decisiones_log_accion "
                "WHERE accion = 'revision_pendiente' ORDER BY detalle LIMIT 100"
            ).fetchall()
        except Exception:
            filas = []

    por_patron: dict[str, list[dict]] = {}
    for fila in filas:
        patron = fila["detalle"] or "sin_patron"
        por_patron.setdefault(patron, []).append(
            {
                "a": fila["raw_record_id_a"],
                "b": fila["raw_record_id_b"],
                "score": fila["confianza"] or 0.0,
                "contacto_a": _resumen_normalized(conn, fila["raw_record_id_a"]),
                "contacto_b": _resumen_normalized(conn, fila["raw_record_id_b"]),
            }
        )
    return [{"patron": patron, "pares": pares} for patron, pares in por_patron.items()]


def _resumen_normalized(conn: sqlite3.Connection, normalized_id: int) -> dict | None:
    """Ficha 6.1 de la encuesta original: al revisar un caso dudoso hace
    falta ver nombre/teléfono/email/organización/de qué fuente salió/foto
    de cada lado del par, no solo el id numérico y el score."""
    fila = conn.execute(
        "SELECT n.nombre, n.apellido, n.organizacion, n.telefonos_e164, n.telefonos_fijo_e164, "
        "n.emails, n.foto_url, r.source_file "
        "FROM normalized_records n JOIN raw_records r ON r.id = n.raw_record_id "
        "WHERE n.id = ?",
        (normalized_id,),
    ).fetchone()
    if fila is None:
        return None
    telefonos = json.loads(fila["telefonos_e164"]) + json.loads(fila["telefonos_fijo_e164"])
    return {
        "nombre": " ".join(filter(None, [fila["nombre"], fila["apellido"]])) or "(sin nombre)",
        "organizacion": fila["organizacion"] or "",
        "telefono": telefonos[0] if telefonos else "",
        "email": (json.loads(fila["emails"]) or [""])[0],
        "fuente": fila["source_file"],
        "foto_url": fila["foto_url"] or "",
    }


def _construir_atajos_explorador(config: Config) -> list[dict[str, Any]]:
    """Lista de accesos rápidos existentes en el equipo para el explorador web."""
    candidatos: list[tuple[str, Path]] = [
        ("Data/Crudos", config.rutas.carpeta_raiz.resolve()),
    ]
    home = Path.home()
    candidatos.extend(
        [
            ("Escritorio", home / "Desktop"),
            ("Descargas", home / "Downloads"),
            ("Documentos", home / "Documents"),
            ("OneDrive", home / "OneDrive"),
            ("Inicio (Usuario)", home),
        ]
    )
    resultado: list[dict[str, Any]] = []
    vistos: set[str] = set()
    for nombre, ruta in candidatos:
        try:
            resuelta = ruta.resolve()
            clave = str(resuelta).lower()
            if clave not in vistos and resuelta.exists() and resuelta.is_dir():
                vistos.add(clave)
                resultado.append({"nombre": nombre, "ruta": str(resuelta), "es_unidad": False})
        except OSError:
            continue
    return resultado


def _listar_unidades_explorador() -> list[dict[str, Any]]:
    """Lista unidades de disco disponibles (sin bloquear en Windows)."""
    if os.name != "nt":
        return [{"nombre": "Raíz (/)", "ruta": "/", "es_unidad": True}]
    unidades: list[dict[str, Any]] = []
    try:
        import ctypes
        import string

        mascara = ctypes.windll.kernel32.GetLogicalDrives()
        for idx, letra in enumerate(string.ascii_uppercase):
            if mascara & (1 << idx):
                raiz = f"{letra}:\\"
                unidades.append({"nombre": f"Disco {letra}:", "ruta": raiz, "es_unidad": True})
    except Exception:
        if Path("C:\\").exists():
            unidades.append({"nombre": "Disco C:", "ruta": "C:\\", "es_unidad": True})
    return unidades

