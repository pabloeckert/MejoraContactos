"""Panel web del motor de contactos: un dashboard en "/" para correr el
pipeline con botones (sin memorizar comandos de CLI) y ver el estado
actual, más la cola de revisión en lote en "/revisar" (patrón de
señales, dedup/scoring.py) que ya existía. Pensado para correr en
localhost, un solo usuario a la vez — las acciones son síncronas
(bloquean hasta terminar) porque el pipeline completo tarda segundos, no
minutos, incluso con los ~35.000 contactos reales."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime

from flask import Flask, jsonify, redirect, render_template_string, request, url_for

from motor.config import Config
from motor.dedup import learning
from motor.dedup.merge_engine import aplicar_decision_lote, deduplicar_todo, deshacer, deshacer_ultima_corrida
from motor.export import buscar_contactos, exportar_lista_maestra, guardar_edicion_manual, obtener_contacto
from motor.ingest import extraer_todo
from motor.normalize_pipeline import normalizar_todo
from motor.tagging import _TAGS_VALIDOS

_ESTILO = """
<style>
  body { font-family: -apple-system, "Segoe UI", sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1rem; color: #2B2B2B; }
  h1 { color: #1A3D84; }
  nav a { margin-right: 1rem; color: #1A3D84; text-decoration: none; font-weight: 600; }
  nav { margin-bottom: 1.5rem; border-bottom: 1px solid #E4E6EA; padding-bottom: 0.75rem; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; margin: 1.5rem 0; }
  .stat { border: 1px solid #E4E6EA; border-radius: 6px; padding: 0.9rem 1rem; background: #F5F6F8; }
  .stat .n { font-size: 1.6rem; font-weight: 700; color: #1A3D84; }
  .stat .l { font-size: 0.8rem; color: #6B7280; }
  .acciones { display: flex; flex-wrap: wrap; gap: 0.6rem; margin: 1rem 0 1.5rem; }
  button, .btn { font-family: inherit; font-size: 0.9rem; font-weight: 600; border: 1px solid #1A3D84; background: #1A3D84; color: #fff; padding: 0.6rem 1.1rem; border-radius: 5px; cursor: pointer; }
  button.secundario, .btn.secundario { background: transparent; color: #1A3D84; }
  .mensaje { background: #EAF0FB; border: 1px solid #1A3D84; border-radius: 5px; padding: 0.8rem 1rem; margin-bottom: 1rem; font-size: 0.9rem; }
  .mensaje.error { background: #FCEAEC; border-color: #E1061E; color: #E1061E; }
  fieldset { margin-bottom: 1em; border: 1px solid #E4E6EA; border-radius: 6px; }
  ul { font-size: 0.85rem; }
</style>
"""

_PLANTILLA_DASHBOARD = _ESTILO + """
<!doctype html>
<title>motor-contactos</title>
<nav><a href="/">Panel</a><a href="/revisar">Revisión pendiente ({{ stats.pendientes }})</a><a href="/buscar">Buscar / editar contacto</a></nav>
<h1>Panel de motor-contactos</h1>
{% if mensaje %}<div class="mensaje{{ ' error' if es_error else '' }}">{{ mensaje }}</div>{% endif %}

<div class="stats">
  <div class="stat"><div class="n">{{ stats.raw_records }}</div><div class="l">registros crudos</div></div>
  <div class="stat"><div class="n">{{ stats.normalized_records }}</div><div class="l">normalizados</div></div>
  <div class="stat"><div class="n">{{ stats.contactos_finales }}</div><div class="l">contactos en la lista maestra</div></div>
  <div class="stat"><div class="n">{{ stats.pendientes }}</div><div class="l">pendientes de revisión</div></div>
</div>

<form method="post" action="/accion/run" style="display:inline">
  <button type="submit">▶ Correr todo (extraer + normalizar + deduplicar + exportar)</button>
</form>

<h3>Pasos individuales</h3>
<div class="acciones">
  <form method="post" action="/accion/extraer"><button class="secundario" type="submit">1. Extraer</button></form>
  <form method="post" action="/accion/normalizar"><button class="secundario" type="submit">2. Normalizar</button></form>
  <form method="post" action="/accion/deduplicar"><button class="secundario" type="submit">3. Deduplicar</button></form>
  <form method="post" action="/accion/exportar"><button class="secundario" type="submit">4. Exportar a Excel</button></form>
</div>

<h3>Deshacer</h3>
<div class="acciones">
  <form method="post" action="/accion/deshacer-ultima-corrida" onsubmit="return confirm('¿Revertir TODA la última corrida de deduplicación?');">
    <button class="secundario" type="submit">Deshacer última corrida completa</button>
  </form>
</div>

<p style="color:#6B7280; font-size:0.85rem;">La lista maestra se guarda en <code>Data/Salida/lista-maestra.xlsx</code>. Los casos que ni las reglas ni la IA pudieron resolver solos están en <a href="/revisar">Revisión pendiente</a>.</p>

<h3>Fase 4 — Sync a Google Contacts</h3>
{% if xlsx_existe %}
  <div class="mensaje">✓ Ya tenés <code>lista-maestra.xlsx</code> generado ({{ xlsx_fecha }}) — listo para importar al Google Sheet.</div>
{% else %}
  <div class="mensaje error">Todavía no exportaste nada — apretá "Exportar a Excel" arriba antes de seguir con esto.</div>
{% endif %}
<ol style="font-size:0.9rem; color:#2B2B2B;">
  <li>Abrí <a href="https://sheets.google.com/create" target="_blank" rel="noopener">un Google Sheet nuevo</a> y subí <code>lista-maestra.xlsx</code> (Archivo → Importar → Subir → Reemplazar hoja actual). Compartilo con Sindy.</li>
  <li>En cada cuenta (Pablo y Sindy), desde ese mismo Sheet: Extensiones → <a href="https://script.google.com" target="_blank" rel="noopener">Apps Script</a> → pegar el código de <code>google-apps-script/Sync.gs</code> → correr <code>sincronizarContactos</code> una vez para autorizar (acá es donde hacés login de Google — el único paso que no puede hacer Claude).</li>
  <li>(Opcional) Activar un disparador diario en cada cuenta para que se sincronice sola.</li>
</ol>
<p style="color:#6B7280; font-size:0.85rem;">Instrucciones completas y el código en <code>motor-contactos/google-apps-script/README.md</code>. Una vez hecho esto una vez por cuenta, no hace falta repetirlo — el script actualiza en vez de duplicar.</p>
"""

_PLANTILLA_REVISOR = _ESTILO + """
<!doctype html>
<title>Revisor de contactos dudosos</title>
<nav><a href="/">Panel</a><a href="/revisar">Revisión pendiente</a><a href="/buscar">Buscar / editar contacto</a></nav>
<h1>Casos pendientes de revisión ({{ total }})</h1>
{% for grupo in grupos %}
  <fieldset>
    <legend>{{ grupo.patron }} ({{ grupo.pares|length }} casos)</legend>
    <button onclick="decidir('{{ grupo.patron }}', true)">Aprobar fusión de todo el lote</button>
    <button class="secundario" onclick="decidir('{{ grupo.patron }}', false)">Rechazar fusión de todo el lote</button>
    <ul style="list-style:none; padding:0;">
    {% for par in grupo.pares %}
      <li style="border:1px solid #E4E6EA; border-radius:6px; padding:0.6rem 0.8rem; margin-bottom:0.4rem; display:flex; gap:1.5rem; align-items:center;">
        <span style="color:#6B7280; font-size:0.8rem; min-width:3.5rem;">{{ '%.2f'|format(par.score) }}</span>
        {% for c in (par.contacto_a, par.contacto_b) %}
          {% if c %}
            <span style="flex:1;">
              <strong>{{ c.nombre }}</strong>{% if c.organizacion %} — {{ c.organizacion }}{% endif %}<br>
              <span style="color:#6B7280; font-size:0.8rem;">
                {{ c.telefono }}{% if c.email %} · {{ c.email }}{% endif %} · <em>{{ c.fuente }}</em>
                {% if c.foto_url %} · <a href="{{ c.foto_url }}" target="_blank" rel="noopener">foto</a>{% endif %}
              </span>
            </span>
          {% else %}
            <span style="flex:1; color:#6B7280;">(registro no encontrado)</span>
          {% endif %}
        {% endfor %}
      </li>
    {% endfor %}
    </ul>
  </fieldset>
{% else %}
  <p>No hay casos pendientes.</p>
{% endfor %}
<script>
function decidir(patron, aceptar) {
  fetch('/decidir', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({patron: patron, aceptar: aceptar}),
  }).then(() => location.reload());
}
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


def crear_app(config: Config, conn: sqlite3.Connection) -> Flask:
    app = Flask(__name__)

    @app.get("/")
    def dashboard():
        destino_xlsx = config.rutas.carpeta_salida / "lista-maestra.xlsx"
        xlsx_existe = destino_xlsx.exists()
        xlsx_fecha = (
            datetime.fromtimestamp(destino_xlsx.stat().st_mtime).strftime("%d/%m/%Y %H:%M")
            if xlsx_existe
            else ""
        )
        return render_template_string(
            _PLANTILLA_DASHBOARD,
            stats=_calcular_stats(conn),
            mensaje=request.args.get("msg", ""),
            es_error=request.args.get("error") == "1",
            xlsx_existe=xlsx_existe,
            xlsx_fecha=xlsx_fecha,
        )

    @app.post("/accion/<nombre>")
    def accion(nombre: str):
        try:
            mensaje = _ejecutar_accion(config, conn, nombre)
            return redirect(url_for("dashboard", msg=mensaje))
        except Exception as exc:  # noqa: BLE001 — mostrar el error en el panel, no un 500 en blanco
            return redirect(url_for("dashboard", msg=f"Error en '{nombre}': {exc}", error="1"))

    @app.get("/revisar")
    def revisar():
        grupos = _agrupar_pendientes(conn)
        total = sum(len(g["pares"]) for g in grupos)
        return render_template_string(_PLANTILLA_REVISOR, grupos=grupos, total=total)

    @app.post("/decidir")
    def decidir():
        datos = request.get_json(force=True)
        patron, aceptar = datos["patron"], bool(datos["aceptar"])
        actualizados = aplicar_decision_lote(conn, patron, aceptar)
        learning.registrar_decision(conn, patron, aceptar)
        return jsonify({"ok": True, "actualizados": actualizados})

    @app.post("/deshacer/<cluster_id>")
    def deshacer_ruta(cluster_id: str):
        cantidad = deshacer(conn, cluster_id)
        return jsonify({"ok": True, "raw_records_afectados": cantidad})

    @app.get("/buscar")
    def buscar():
        consulta = request.args.get("q", "").strip()
        resultados = buscar_contactos(conn, consulta) if consulta else []
        return render_template_string(_PLANTILLA_BUSCAR, consulta=consulta, resultados=resultados)

    @app.get("/editar/<cluster_id>")
    def editar_formulario(cluster_id: str):
        contacto = obtener_contacto(conn, cluster_id)
        if contacto is None:
            return redirect(url_for("buscar", q=""))
        return render_template_string(
            _PLANTILLA_EDITAR, c=contacto, cluster_id=cluster_id, tags_validos=_TAGS_VALIDOS
        )

    @app.post("/editar/<cluster_id>")
    def editar_guardar(cluster_id: str):
        guardar_edicion_manual(conn, cluster_id, request.form.to_dict(), config)
        return redirect(url_for("editar_formulario", cluster_id=cluster_id))

    from motor.api import registrar_rutas_api

    registrar_rutas_api(app, config, conn)

    return app


def _ejecutar_accion(config: Config, conn: sqlite3.Connection, nombre: str) -> str:
    if nombre == "extraer":
        return f"Extracción completa — raw_records nuevos: {extraer_todo(config, conn)}"
    if nombre == "normalizar":
        return f"Normalización completa — normalized_records nuevos: {normalizar_todo(config, conn)}"
    if nombre == "deduplicar":
        return f"Deduplicación completa — {deduplicar_todo(config, conn)}"
    if nombre == "exportar":
        destino = exportar_lista_maestra(config, conn)
        return f"Exportado: {destino}"
    if nombre == "run":
        extraer_todo(config, conn)
        normalizar_todo(config, conn)
        resultado = deduplicar_todo(config, conn)
        destino = exportar_lista_maestra(config, conn)
        return f"Corrida completa — deduplicación {resultado} — exportado: {destino}"
    if nombre == "deshacer-ultima-corrida":
        resumen = deshacer_ultima_corrida(conn)
        return f"Última corrida revertida — {resumen}"
    return f"Acción desconocida: {nombre}"


def _corrida_mas_reciente(conn: sqlite3.Connection) -> str | None:
    fila = conn.execute("SELECT MAX(corrida_id) AS corrida_id FROM decisiones_log WHERE corrida_id IS NOT NULL").fetchone()
    return fila["corrida_id"] if fila else None


def _calcular_stats(conn: sqlite3.Connection) -> dict[str, int]:
    def contar(sql: str, parametros: tuple = ()) -> int:
        return conn.execute(sql, parametros).fetchone()[0]

    # "pendientes" solo cuenta la corrida de deduplicar_todo() MÁS RECIENTE,
    # no todo decisiones_log histórico: cada corrida reevalúa TODOS los
    # pares desde cero (dedup/merge_engine.py:deduplicar_todo), así que un
    # mismo par que siguió pendiente en varias corridas queda logueado
    # varias veces — sin este filtro el contador infla con duplicados de
    # corridas viejas ya superadas por una corrida posterior.
    corrida = _corrida_mas_reciente(conn)
    pendientes = (
        contar(
            "SELECT COUNT(*) FROM decisiones_log WHERE accion = 'revision_pendiente' AND corrida_id = ?",
            (corrida,),
        )
        if corrida
        else 0
    )

    return {
        "raw_records": contar("SELECT COUNT(*) FROM raw_records"),
        "normalized_records": contar("SELECT COUNT(*) FROM normalized_records"),
        "contactos_finales": contar("SELECT COUNT(DISTINCT cluster_id) FROM clusters"),
        "pendientes": pendientes,
    }


def _agrupar_pendientes(conn: sqlite3.Connection) -> list[dict]:
    corrida = _corrida_mas_reciente(conn)
    if corrida is None:
        return []
    filas = conn.execute(
        "SELECT raw_record_id_a, raw_record_id_b, confianza, detalle FROM decisiones_log "
        "WHERE accion = 'revision_pendiente' AND corrida_id = ? ORDER BY detalle",
        (corrida,),
    ).fetchall()

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
