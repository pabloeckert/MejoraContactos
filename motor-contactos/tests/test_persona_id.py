"""persona_id: identificador estable por persona, separado de cluster_id.
Ver motor/dedup/persona_id.py y ESQUEMA-CONTACTO-COMPARTIDO.md § Resuelto
para el diseño y la regla de supervivencia. Mismas fixtures sintéticas que
el resto del pipeline (nunca datos reales)."""

from datetime import datetime, timedelta, timezone

from motor.config import Config, DedupConfig, EmailConfig, LlmConfig, RevisorConfig, RutasConfig, TelefonoConfig
from motor.dedup.merge_engine import aplicar_decision_lote, deduplicar_todo, deshacer
from motor.dedup.persona_id import crear_persona, elegir_persona_id_superviviente
from motor.export import guardar_edicion_manual, listar_contactos
from motor.ingest import extraer_todo
from motor.normalize_pipeline import normalizar_todo
from motor.staging_db import conectar


def _config_prueba(tmp_path):
    (tmp_path / "Crudos").mkdir()
    return Config(
        rutas=RutasConfig(
            carpeta_raiz=tmp_path / "Crudos",
            carpeta_salida=tmp_path / "Salida",
            base_sqlite=tmp_path / "Salida" / "staging.sqlite",
        ),
        extensiones_permitidas=frozenset({"csv"}),
        telefono=TelefonoConfig(),
        email=EmailConfig(),
        dedup=DedupConfig(),
        llm=LlmConfig(activar_para_dudosos=False),
        revisor=RevisorConfig(),
    )


# ---------------------------------------------------------------------------
# Unidad: elegir_persona_id_superviviente
# ---------------------------------------------------------------------------


def test_sin_votos_crea_persona_nueva(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)

    persona_id = elegir_persona_id_superviviente(conn, {})

    assert persona_id
    fila = conn.execute("SELECT persona_id FROM personas WHERE persona_id = ?", (persona_id,)).fetchone()
    assert fila is not None  # quedó registrada en personas, no es un UUID suelto


def test_un_solo_candidato_sobrevive_sin_pedir_desempate(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)
    pid = crear_persona(conn)

    assert elegir_persona_id_superviviente(conn, {pid: 3}) == pid


def test_gana_el_persona_id_con_mas_raw_records(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)
    ganador = crear_persona(conn)
    perdedor = crear_persona(conn)

    assert elegir_persona_id_superviviente(conn, {ganador: 5, perdedor: 2}) == ganador


def test_empate_gana_el_persona_id_mas_antiguo(tmp_path):
    config = _config_prueba(tmp_path)
    conn = conectar(config.rutas.base_sqlite)

    mas_nuevo = crear_persona(conn)
    conn.execute("UPDATE personas SET creado_en = ? WHERE persona_id = ?", (_iso(dias_atras=0), mas_nuevo))
    mas_antiguo = crear_persona(conn)
    conn.execute("UPDATE personas SET creado_en = ? WHERE persona_id = ?", (_iso(dias_atras=30), mas_antiguo))
    conn.commit()

    assert elegir_persona_id_superviviente(conn, {mas_nuevo: 2, mas_antiguo: 2}) == mas_antiguo


def _iso(dias_atras: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=dias_atras)).isoformat()


# ---------------------------------------------------------------------------
# Integración: pipeline completo con persona_id
# ---------------------------------------------------------------------------


def test_deduplicar_asigna_persona_id_a_todos_los_clusters(tmp_path):
    config = _config_prueba(tmp_path)
    (config.rutas.carpeta_raiz / "a.csv").write_text(
        "Nombre,Apellido,Telefono\nJuan,Perez,3743504517\nAna,Gomez,3764368724\n", encoding="utf-8"
    )
    conn = conectar(config.rutas.base_sqlite)
    extraer_todo(config, conn)
    normalizar_todo(config, conn)
    deduplicar_todo(config, conn)

    filas = conn.execute("SELECT persona_id FROM clusters").fetchall()
    assert len(filas) == 2
    assert all(f["persona_id"] for f in filas)  # ninguno quedó sin asignar
    assert len({f["persona_id"] for f in filas}) == 2  # dos personas distintas


def test_persona_id_estable_entre_corridas_sin_cambios(tmp_path):
    config = _config_prueba(tmp_path)
    (config.rutas.carpeta_raiz / "a.csv").write_text(
        "Nombre,Apellido,Telefono\nJuan,Perez,3743504517\n", encoding="utf-8"
    )
    conn = conectar(config.rutas.base_sqlite)
    extraer_todo(config, conn)
    normalizar_todo(config, conn)
    deduplicar_todo(config, conn)
    persona_id_1 = conn.execute("SELECT persona_id FROM clusters LIMIT 1").fetchone()["persona_id"]

    # Segunda corrida completa, sin agregar nada nuevo -- persona_id no debe
    # recalcularse (a diferencia de cluster_id, que si nada cambia da el
    # mismo valor igual porque es determinístico, pero el punto es que
    # persona_id nunca se toca si ya estaba asignado).
    deduplicar_todo(config, conn)
    persona_id_2 = conn.execute("SELECT persona_id FROM clusters LIMIT 1").fetchone()["persona_id"]

    assert persona_id_1 == persona_id_2


def test_persona_id_sobrevive_cuando_se_agrega_un_raw_record_al_mismo_cluster(tmp_path):
    config = _config_prueba(tmp_path)
    (config.rutas.carpeta_raiz / "a.csv").write_text(
        "Nombre,Apellido,Telefono\nJuan,Perez,3743504517\n", encoding="utf-8"
    )
    conn = conectar(config.rutas.base_sqlite)
    extraer_todo(config, conn)
    normalizar_todo(config, conn)
    deduplicar_todo(config, conn)
    persona_original = conn.execute("SELECT persona_id FROM clusters LIMIT 1").fetchone()["persona_id"]

    # Nueva fuente con el mismo teléfono -- se fusiona al cluster existente.
    (config.rutas.carpeta_raiz / "b.csv").write_text(
        "Nombre,Apellido,Telefono\nJ,P,3743504517\n", encoding="utf-8"
    )
    extraer_todo(config, conn)
    normalizar_todo(config, conn)
    deduplicar_todo(config, conn)

    personas = {f["persona_id"] for f in conn.execute("SELECT persona_id FROM clusters").fetchall()}
    assert personas == {persona_original}  # sigue siendo la misma persona, no una nueva


def test_fusion_aprobada_sobrevive_el_persona_id_con_mas_raw_records(tmp_path):
    # Lucia + LuciaF comparten telefono y nombre similar -> se fusionan solas
    # por regla (cluster de 2 raw_records, 1 persona_id). Gustavo comparte el
    # mismo telefono pero nombre muy distinto -> cae en revision_pendiente
    # (salvaguarda de scoring.py) y queda como cluster propio (1 raw_record,
    # otro persona_id). Al aprobar la fusión pendiente, según la regla de
    # supervivencia debe ganar el persona_id de Lucia/LuciaF (2 raw_records)
    # por sobre el de Gustavo (1).
    config = _config_prueba(tmp_path)
    (config.rutas.carpeta_raiz / "compartido.csv").write_text(
        "Nombre,Apellido,Telefono\n"
        "Lucia,Fernandez,3743504517\n"
        "LuciaF,Fernandez,3743504517\n"
        "Gustavo,Lopez,3743504517\n",
        encoding="utf-8",
    )
    conn = conectar(config.rutas.base_sqlite)
    extraer_todo(config, conn)
    normalizar_todo(config, conn)
    deduplicar_todo(config, conn)

    clusters_antes = conn.execute(
        "SELECT cluster_id, persona_id, COUNT(*) c FROM clusters GROUP BY cluster_id"
    ).fetchall()
    assert len(clusters_antes) == 2  # Lucia+LuciaF fusionados, Gustavo aparte
    cluster_grande = next(c for c in clusters_antes if c["c"] == 2)
    persona_grande = cluster_grande["persona_id"]

    pendiente = conn.execute(
        "SELECT detalle FROM decisiones_log WHERE accion = 'revision_pendiente' LIMIT 1"
    ).fetchone()
    assert pendiente is not None
    aplicar_decision_lote(conn, pendiente["detalle"], True)

    personas_despues = {f["persona_id"] for f in conn.execute("SELECT persona_id FROM clusters").fetchall()}
    assert personas_despues == {persona_grande}  # ganó el de más raw_records, no se creó uno nuevo


def test_deshacer_conserva_persona_id_en_uno_y_crea_nuevo_para_el_resto(tmp_path):
    config = _config_prueba(tmp_path)
    (config.rutas.carpeta_raiz / "dup.csv").write_text(
        "Nombre,Telefono\nJuan,3743504517\nJ,3743504517\n", encoding="utf-8"
    )
    conn = conectar(config.rutas.base_sqlite)
    extraer_todo(config, conn)
    normalizar_todo(config, conn)
    deduplicar_todo(config, conn)

    cluster_id = conn.execute("SELECT cluster_id FROM clusters LIMIT 1").fetchone()["cluster_id"]
    persona_antes = conn.execute(
        "SELECT persona_id FROM clusters WHERE cluster_id = ? LIMIT 1", (cluster_id,)
    ).fetchone()["persona_id"]

    deshacer(conn, cluster_id)

    personas_despues = [f["persona_id"] for f in conn.execute("SELECT persona_id FROM clusters").fetchall()]
    assert len(personas_despues) == 2
    assert len(set(personas_despues)) == 2  # ahora son dos personas distintas
    assert persona_antes in personas_despues  # una de las dos conservó la identidad original


# ---------------------------------------------------------------------------
# updated_at a nivel de contacto final
# ---------------------------------------------------------------------------


def test_contacto_final_expone_updated_at(tmp_path):
    config = _config_prueba(tmp_path)
    (config.rutas.carpeta_raiz / "a.csv").write_text(
        "Nombre,Apellido,Telefono\nJuan,Perez,3743504517\n", encoding="utf-8"
    )
    conn = conectar(config.rutas.base_sqlite)
    extraer_todo(config, conn)
    normalizar_todo(config, conn)
    deduplicar_todo(config, conn)

    contactos, _ = listar_contactos(conn, 1, 100)
    assert contactos[0]["updated_at"]  # no vacío


def test_edicion_manual_actualiza_updated_at(tmp_path):
    config = _config_prueba(tmp_path)
    (config.rutas.carpeta_raiz / "a.csv").write_text(
        "Nombre,Apellido,Telefono\nJuan,Perez,3743504517\n", encoding="utf-8"
    )
    conn = conectar(config.rutas.base_sqlite)
    extraer_todo(config, conn)
    normalizar_todo(config, conn)
    deduplicar_todo(config, conn)

    cluster_id = conn.execute("SELECT cluster_id FROM clusters LIMIT 1").fetchone()["cluster_id"]
    contactos_antes, _ = listar_contactos(conn, 1, 100)
    updated_at_antes = contactos_antes[0]["updated_at"]

    guardar_edicion_manual(conn, cluster_id, {"tag": "familiar"}, config)

    contactos_despues, _ = listar_contactos(conn, 1, 100)
    updated_at_despues = contactos_despues[0]["updated_at"]
    assert updated_at_despues >= updated_at_antes
