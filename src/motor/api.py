"""API JSON para la UI nueva (Fase 1). Vive al lado del panel HTML existente
(reviewer_app.py) sobre el MISMO Flask app y la MISMA conexión sqlite —
no reemplaza nada, es aditivo. Reusa las funciones ya construidas y
testeadas en export.py/merge_engine.py/ingest.py/normalize_pipeline.py, no
duplica lógica de negocio.

CORS manual (sin sumar flask-cors como dependencia) porque el único
consumidor es el dev server de Vite en localhost — se refleja el Origin
solo si es localhost/127.0.0.1, nunca un wildcard abierto a cualquier
sitio."""

from __future__ import annotations

import sqlite3

from flask import Flask, jsonify, request

from motor.config import Config
from motor.dedup import learning
from motor.dedup.merge_engine import aplicar_decision_lote, deshacer, deshacer_ultima_corrida
from motor.export import buscar_contactos, guardar_edicion_manual, listar_contactos, obtener_contacto


def registrar_rutas_api(app: Flask, config: Config, conn: sqlite3.Connection) -> None:
    from motor.reviewer_app import _agrupar_pendientes, _calcular_stats, _ejecutar_accion

    @app.after_request
    def _cors(respuesta):
        origen = request.headers.get("Origin", "")
        if origen.startswith("http://localhost:") or origen.startswith("http://127.0.0.1:"):
            respuesta.headers["Access-Control-Allow-Origin"] = origen
            respuesta.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            respuesta.headers["Access-Control-Allow-Headers"] = "Content-Type"
        return respuesta

    @app.route("/api/<path:_ruta>", methods=["OPTIONS"])
    def _api_preflight(_ruta):
        return "", 204

    @app.get("/api/stats")
    def api_stats():
        return jsonify(_calcular_stats(conn))

    @app.get("/api/contactos")
    def api_contactos():
        consulta = request.args.get("q", "").strip()
        pagina = max(_a_entero(request.args.get("pagina"), 1), 1)
        # Tope alto (no 500): la UI carga TODA la lista una sola vez y
        # filtra/busca client-side (instantáneo, sin ida y vuelta al
        # server por cada tecla) -- 8.500 contactos hoy es liviano para
        # una sola respuesta JSON local. Sigue habiendo tope para no
        # aceptar un valor arbitrariamente grande de un query param.
        tamano = min(max(_a_entero(request.args.get("tamano"), 100), 1), 20000)

        if consulta:
            contactos = buscar_contactos(conn, consulta, limite=tamano)
            total = len(contactos)
        else:
            contactos, total = listar_contactos(conn, pagina, tamano)

        return jsonify(
            {
                "total": total,
                "pagina": pagina,
                "tamano": tamano,
                "contactos": [_serializar_contacto(c) for c in contactos],
            }
        )

    @app.get("/api/contactos/<cluster_id>")
    def api_contacto(cluster_id: str):
        contacto = obtener_contacto(conn, cluster_id)
        if contacto is None:
            return jsonify({"error": "no encontrado"}), 404
        return jsonify(_serializar_contacto(contacto))

    @app.post("/api/contactos/<cluster_id>")
    def api_editar_contacto(cluster_id: str):
        guardar_edicion_manual(conn, cluster_id, request.get_json(force=True) or {}, config)
        contacto = obtener_contacto(conn, cluster_id)
        return jsonify(_serializar_contacto(contacto) if contacto else {"ok": True})

    @app.get("/api/revisar")
    def api_revisar():
        grupos = _agrupar_pendientes(conn)
        total = sum(len(g["pares"]) for g in grupos)
        return jsonify({"total": total, "grupos": grupos})

    @app.post("/api/decidir")
    def api_decidir():
        datos = request.get_json(force=True)
        patron, aceptar = datos["patron"], bool(datos["aceptar"])
        actualizados = aplicar_decision_lote(conn, patron, aceptar)
        learning.registrar_decision(conn, patron, aceptar)
        return jsonify({"ok": True, "actualizados": actualizados})

    @app.post("/api/deshacer/<cluster_id>")
    def api_deshacer(cluster_id: str):
        cantidad = deshacer(conn, cluster_id)
        return jsonify({"ok": True, "raw_records_afectados": cantidad})

    @app.post("/api/deshacer-ultima-corrida")
    def api_deshacer_ultima_corrida():
        return jsonify(deshacer_ultima_corrida(conn))

    @app.post("/api/accion/<nombre>")
    def api_accion(nombre: str):
        try:
            mensaje = _ejecutar_accion(config, conn, nombre)
            return jsonify({"ok": True, "mensaje": mensaje})
        except Exception as exc:  # noqa: BLE001 — nunca un 500 en blanco para la UI
            return jsonify({"ok": False, "error": str(exc)}), 500


def _a_entero(valor: str | None, default: int) -> int:
    try:
        return int(valor) if valor is not None else default
    except ValueError:
        return default


def _serializar_contacto(c: dict) -> dict:
    return {
        "cluster_id": c.get("cluster_id", ""),
        "nombre": c.get("nombre", ""),
        "apellido": c.get("apellido", ""),
        "cargo": c.get("cargo", ""),
        "organizacion": c.get("organizacion", ""),
        "whatsapp": sorted(c.get("whatsapp") or []),
        "telefono_fijo": sorted(c.get("telefono_fijo") or []),
        "emails": sorted(c.get("emails") or []),
        "tag": c.get("tag", ""),
        "domicilio": c.get("domicilio", ""),
        "ciudad": c.get("ciudad", ""),
        "provincia": c.get("provincia", ""),
        "pais": c.get("pais", ""),
        "cumpleanos": c.get("cumpleanos", ""),
        "foto_url": c.get("foto_url", ""),
        "nota_referencia": c.get("nota_referencia", ""),
    }
