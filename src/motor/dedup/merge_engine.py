"""Motor de fusión: aplica las tres bandas de confianza de config.dedup a
los pares candidatos de dedup/blocking.py, escribe decisiones_log, y
materializa clusters. Nada se fusiona destructivamente — fusionar es
asignar el mismo cluster_id a dos raw_records, deshacer es reasignarles un
cluster_id propio de nuevo. El historial de decisiones_log nunca se borra,
ni siquiera al deshacer.

Tres bandas (ver también config.yaml):
1. score alto  -> fusiona sola, logueada, reversible.
2. score bajo  -> no fusiona, sin preguntar (dos tarjetas separadas es
   barato y reversible; una fusión mala no siempre lo es).
3. score medio -> se delega a LlmJudge (Groq, escalado a Anthropic si hace
   falta); si tampoco resuelve con confianza, queda en revision_pendiente
   para el revisor web en lote.

Cada corrida de deduplicar_todo() se marca con un corrida_id propio
(timestamp) en clusters y decisiones_log — permite deshacer_ultima_corrida()
sin tener que revertir cluster por cluster (pedido explícito, Ficha 12.2:
"crítico, necesito un deshacer todo de la última corrida completa").
"""

from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone

from motor.config import Config
from motor.dedup import learning, scoring
from motor.dedup.blocking import generar_candidatos
from motor.dedup.scoring import RegistroParaScoring
from motor.dedup.union_find import UnionFind
from motor.llm_judge import LlmJudge


def deduplicar_todo(config: Config, conn: sqlite3.Connection, continuar: bool = True) -> dict[str, int]:
    """continuar=True (default): si la corrida anterior se cortó a mitad de
    camino (proceso matado/máquina reiniciada antes de llegar a
    _materializar_clusters), retoma el mismo corrida_id y NO vuelve a
    preguntarle a las reglas/LLM por los pares que ya quedaron logueados
    -- solo replica esa decisión ya tomada. Encontrado en la práctica: dos
    corridas seguidas se cortaron por reinicios del entorno (no por un bug)
    y se perdió TODO el trabajo hecho hasta ese punto porque antes solo se
    comiteaba al final. Con esto + el commit periódico de abajo, un corte
    a mitad de camino cuesta como máximo COMMIT_CADA_N pares, no todos."""
    COMMIT_CADA_N = 50

    corrida_previa = _corrida_incompleta(conn) if continuar else None
    corrida_id = corrida_previa or _ahora()
    decididos_previos = _pares_decididos(conn, corrida_id) if corrida_previa else {}
    if corrida_previa:
        print(f"  ...retomando corrida incompleta {corrida_id} ({len(decididos_previos)} pares ya decididos)", flush=True)

    ids = [fila["id"] for fila in conn.execute("SELECT id FROM normalized_records").fetchall()]
    candidatos = generar_candidatos(conn, config.dedup.tope_bucket)
    uf = UnionFind(ids)
    judge = LlmJudge(config.llm) if config.llm.activar_para_dudosos else None

    contadores: dict[str, int] = {"regla": 0, "revision_pendiente": 0, "separados": 0}
    llamadas_llm = 0
    sin_commitear = 0

    for id_a, id_b in sorted(candidatos):
        previo = decididos_previos.get((id_a, id_b))
        if previo is not None:
            # Ya estaba decidido de una corrida anterior interrumpida --
            # replicar el mismo resultado (uf.unir si corresponde) sin
            # volver a gastar una llamada a reglas/LLM por algo que ya se
            # sabía.
            accion_previa, decidido_por_previo = previo
            if accion_previa == "fusionar":
                uf.unir(id_a, id_b)
            if decidido_por_previo == "regla":
                clave = "regla" if accion_previa == "fusionar" else "separados"
            elif accion_previa == "revision_pendiente":
                clave = "revision_pendiente"
            else:
                clave = decidido_por_previo  # "llm_groq" / "llm_openrouter" / "llm_anthropic"
            contadores[clave] = contadores.get(clave, 0) + 1
            continue

        reg_a = scoring.cargar_registro(conn, id_a)
        reg_b = scoring.cargar_registro(conn, id_b)
        score, patron = scoring.calcular_score(reg_a, reg_b, config.dedup)
        score = min(max(score + learning.obtener_ajuste(conn, patron), 0.0), 1.0)

        if score >= config.dedup.umbral_fusion_automatica:
            uf.unir(id_a, id_b)
            _loguear(conn, id_a, id_b, "fusionar", "regla", score, corrida_id, patron)
            contadores["regla"] += 1
        elif score <= config.dedup.umbral_no_fusionar:
            _loguear(conn, id_a, id_b, "separar", "regla", score, corrida_id, patron)
            contadores["separados"] += 1
        else:
            resuelto = _resolver_con_llm(conn, judge, uf, id_a, id_b, reg_a, reg_b, config, corrida_id)
            clave = resuelto if resuelto else "revision_pendiente"
            if not resuelto:
                _loguear(conn, id_a, id_b, "revision_pendiente", "pendiente", score, corrida_id, patron)
            contadores[clave] = contadores.get(clave, 0) + 1
            # La banda media (LLM) es la única lenta -- red por caso, hasta
            # varios segundos. Progreso visible cada 10 para no quedar a
            # ciegas en una corrida larga (encontrado en la práctica: sin
            # esto, 2hs sin ninguna señal de si seguía viva o colgada).
            llamadas_llm += 1
            if llamadas_llm % 10 == 0:
                print(f"  ...LLM-judge: {llamadas_llm} casos ambiguos procesados", flush=True)

        sin_commitear += 1
        if sin_commitear >= COMMIT_CADA_N:
            conn.commit()
            sin_commitear = 0

    _materializar_clusters(conn, uf, corrida_id)
    conn.commit()
    return contadores


def _corrida_incompleta(conn: sqlite3.Connection) -> str | None:
    """El corrida_id más reciente en decisiones_log que NO llegó a
    materializar clusters (_materializar_clusters escribe TODOS los
    clusters de una corrida de una sola vez al final, así que "parcial" no
    existe para esa tabla: o está completa o nunca llegó)."""
    fila = conn.execute(
        "SELECT dl.corrida_id FROM decisiones_log dl "
        "WHERE dl.corrida_id IS NOT NULL "
        "AND NOT EXISTS (SELECT 1 FROM clusters c WHERE c.corrida_id = dl.corrida_id) "
        "ORDER BY dl.corrida_id DESC LIMIT 1"
    ).fetchone()
    return fila["corrida_id"] if fila else None


def _pares_decididos(conn: sqlite3.Connection, corrida_id: str) -> dict[tuple[int, int], tuple[str, str]]:
    filas = conn.execute(
        "SELECT raw_record_id_a, raw_record_id_b, accion, decidido_por FROM decisiones_log "
        "WHERE corrida_id = ? AND raw_record_id_b IS NOT NULL",
        (corrida_id,),
    ).fetchall()
    return {(f["raw_record_id_a"], f["raw_record_id_b"]): (f["accion"], f["decidido_por"]) for f in filas}


def _resolver_con_llm(
    conn: sqlite3.Connection,
    judge: LlmJudge | None,
    uf: UnionFind,
    id_a: int,
    id_b: int,
    reg_a: RegistroParaScoring,
    reg_b: RegistroParaScoring,
    config: Config,
    corrida_id: str,
) -> str | None:
    if judge is None:
        return None
    veredicto = judge.decidir(_a_dict(reg_a), _a_dict(reg_b))
    if veredicto is None or veredicto.confianza < config.llm.escalado.umbral_confianza_groq:
        return None

    decidido_por = f"llm_{veredicto.proveedor}"
    if veredicto.misma_persona:
        uf.unir(id_a, id_b)
        _loguear(conn, id_a, id_b, "fusionar", decidido_por, veredicto.confianza, corrida_id, veredicto.razon)
    else:
        _loguear(conn, id_a, id_b, "separar", decidido_por, veredicto.confianza, corrida_id, veredicto.razon)
    return decidido_por


def deshacer(conn: sqlite3.Connection, cluster_id: str) -> int:
    """Separa todos los raw_records de un cluster en clusters propios de
    nuevo. No borra decisiones_log — queda como auditoría de que hubo una
    fusión y se revirtió."""
    filas = conn.execute(
        "SELECT raw_record_id FROM clusters WHERE cluster_id = ?", (cluster_id,)
    ).fetchall()
    for fila in filas:
        nuevo_cluster_id = f"c-{fila['raw_record_id']}"
        conn.execute(
            "UPDATE clusters SET cluster_id = ?, decidido_por = 'humano', actualizado_en = ? "
            "WHERE raw_record_id = ?",
            (nuevo_cluster_id, _ahora(), fila["raw_record_id"]),
        )
    conn.execute(
        "INSERT INTO decisiones_log "
        "(cluster_id, raw_record_id_a, raw_record_id_b, accion, decidido_por, confianza, detalle, creado_en) "
        "VALUES (?, 0, NULL, 'deshacer', 'humano', NULL, NULL, ?)",
        (cluster_id, _ahora()),
    )
    conn.commit()
    return len(filas)


def deshacer_ultima_corrida(conn: sqlite3.Connection) -> dict[str, int]:
    """Revierte TODAS las fusiones de la corrida de deduplicar_todo() más
    reciente de una sola vez — no cluster por cluster. Cada raw_record de
    esa corrida vuelve a su propio cluster; decisiones_log no se toca (queda
    como auditoría), solo se agrega una entrada 'deshacer_corrida'."""
    fila = conn.execute(
        "SELECT corrida_id FROM clusters WHERE corrida_id IS NOT NULL "
        "ORDER BY corrida_id DESC LIMIT 1"
    ).fetchone()
    if fila is None:
        return {"corrida_id": None, "clusters_afectados": 0, "raw_records_afectados": 0}

    corrida_id = fila["corrida_id"]
    filas = conn.execute(
        "SELECT raw_record_id, cluster_id FROM clusters WHERE corrida_id = ?", (corrida_id,)
    ).fetchall()
    cluster_ids = {f["cluster_id"] for f in filas}

    for f in filas:
        nuevo_cluster_id = f"c-{f['raw_record_id']}"
        conn.execute(
            "UPDATE clusters SET cluster_id = ?, decidido_por = 'humano', corrida_id = NULL, actualizado_en = ? "
            "WHERE raw_record_id = ?",
            (nuevo_cluster_id, _ahora(), f["raw_record_id"]),
        )
    conn.execute(
        "INSERT INTO decisiones_log "
        "(cluster_id, raw_record_id_a, raw_record_id_b, accion, decidido_por, confianza, detalle, corrida_id, creado_en) "
        "VALUES (?, 0, NULL, 'deshacer_corrida', 'humano', NULL, ?, ?, ?)",
        (corrida_id, f"{len(filas)} raw_records revertidos", corrida_id, _ahora()),
    )
    conn.commit()
    return {
        "corrida_id": corrida_id,
        "clusters_afectados": len(cluster_ids),
        "raw_records_afectados": len(filas),
    }


def _materializar_clusters(conn: sqlite3.Connection, uf: UnionFind, corrida_id: str) -> None:
    mapa_raw = {
        fila["id"]: fila["raw_record_id"]
        for fila in conn.execute("SELECT id, raw_record_id FROM normalized_records").fetchall()
    }
    for raiz, miembros in uf.grupos().items():
        cluster_id = (
            f"c-{raiz}" if len(miembros) == 1 else f"c-{uuid.uuid5(uuid.NAMESPACE_OID, str(sorted(miembros)))}"
        )
        for normalized_id in miembros:
            raw_record_id = mapa_raw.get(normalized_id)
            if raw_record_id is None:
                continue
            conn.execute(
                "INSERT INTO clusters (raw_record_id, cluster_id, decidido_por, confianza, corrida_id, actualizado_en) "
                "VALUES (?, ?, 'regla', NULL, ?, ?) "
                "ON CONFLICT(raw_record_id) DO UPDATE SET "
                "cluster_id=excluded.cluster_id, corrida_id=excluded.corrida_id, actualizado_en=excluded.actualizado_en",
                (raw_record_id, cluster_id, corrida_id, _ahora()),
            )


def _loguear(
    conn: sqlite3.Connection,
    id_a: int,
    id_b: int,
    accion: str,
    decidido_por: str,
    confianza: float,
    corrida_id: str,
    detalle: str | None = None,
) -> None:
    conn.execute(
        "INSERT INTO decisiones_log "
        "(cluster_id, raw_record_id_a, raw_record_id_b, accion, decidido_por, confianza, detalle, corrida_id, creado_en) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (f"pair-{id_a}-{id_b}", id_a, id_b, accion, decidido_por, confianza, detalle, corrida_id, _ahora()),
    )


def _a_dict(reg: RegistroParaScoring) -> dict:
    return {
        "nombre": reg.nombre,
        "apellido": reg.apellido,
        "organizacion": reg.organizacion,
        "telefonos": sorted(reg.telefonos),
        "emails": sorted(reg.emails),
    }


def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat()
