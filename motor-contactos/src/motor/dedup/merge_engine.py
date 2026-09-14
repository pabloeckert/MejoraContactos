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
from motor.dedup.persona_id import crear_persona, elegir_persona_id_superviviente
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

    personas_afectadas = _materializar_clusters(conn, uf, corrida_id)
    conn.commit()
    _sincronizar_best_effort(conn, personas_afectadas)
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


def aplicar_decision_lote(conn: sqlite3.Connection, patron: str, aceptar: bool) -> int:
    """Aplica una decisión humana en lote (botón "Aprobar/Rechazar fusión
    de todo el lote" del revisor, patrón de scoring.py) a TODOS los pares
    `revision_pendiente` de ese patrón en la corrida más reciente.

    A diferencia de solo actualizar decisiones_log (lo que hacía esta
    función antes de que existiera), si `aceptar=True` esto también
    fusiona de verdad los clusters correspondientes -- sin este paso, la
    cola de pendientes bajaba a 0 pero la lista maestra exportada seguía
    mostrando los contactos como separados, porque _materializar_clusters
    solo corre dentro de deduplicar_todo() y una corrida nueva no reusa
    decisiones manuales de una corrida ya completada (solo reanuda una
    corrida incompleta, ver deduplicar_todo()).

    Fusionar acá es union-find sobre clusters YA EXISTENTES (no sobre
    normalized_record ids sueltos): cada par pendiente puede involucrar
    contactos que ya son cluster de varios raw_records (por fusiones de
    regla previas), así que se fusionan los clusters completos de ambos
    lados, no solo el par puntual."""
    filas = conn.execute(
        "SELECT id, raw_record_id_a, raw_record_id_b FROM decisiones_log "
        "WHERE accion = 'revision_pendiente' AND detalle = ?",
        (patron,),
    ).fetchall()
    if not filas:
        return 0

    nueva_accion = "fusionar" if aceptar else "separar"
    for fila in filas:
        conn.execute(
            "UPDATE decisiones_log SET accion = ?, decidido_por = 'humano' WHERE id = ?",
            (nueva_accion, fila["id"]),
        )

    personas_afectadas: set[str] = set()
    if aceptar:
        personas_afectadas = _fusionar_pares_de_clusters(
            conn, [(f["raw_record_id_a"], f["raw_record_id_b"]) for f in filas]
        )

    conn.commit()
    _sincronizar_best_effort(conn, personas_afectadas)
    return len(filas)


def _fusionar_pares_de_clusters(conn: sqlite3.Connection, pares_normalized_ids: list[tuple[int, int]]) -> set[str]:
    """pares_normalized_ids son pares de normalized_record.id (el nombre de
    columna decisiones_log.raw_record_id_a/b es heredado pero en realidad
    guarda normalized_record ids -- ver deduplicar_todo()). Traduce cada
    uno a su cluster_id ACTUAL y fusiona esos clusters completos entre sí."""
    mapa_raw = {
        fila["id"]: fila["raw_record_id"]
        for fila in conn.execute("SELECT id, raw_record_id FROM normalized_records").fetchall()
    }
    filas_clusters = conn.execute("SELECT raw_record_id, cluster_id, persona_id FROM clusters").fetchall()
    cluster_de_raw = {fila["raw_record_id"]: fila["cluster_id"] for fila in filas_clusters}
    persona_de_raw = {fila["raw_record_id"]: fila["persona_id"] for fila in filas_clusters}

    padres: dict[str, str] = {}

    def raiz(x: str) -> str:
        while padres.get(x, x) != x:
            padres[x] = padres.get(padres[x], padres[x])
            x = padres[x]
        return x

    def unir(a: str, b: str) -> None:
        ra, rb = raiz(a), raiz(b)
        if ra != rb:
            padres[ra] = rb

    cluster_ids_afectados: set[str] = set()
    for id_a, id_b in pares_normalized_ids:
        raw_a, raw_b = mapa_raw.get(id_a), mapa_raw.get(id_b)
        if raw_a is None or raw_b is None:
            continue
        ca, cb = cluster_de_raw.get(raw_a), cluster_de_raw.get(raw_b)
        if ca is None or cb is None or ca == cb:
            continue
        padres.setdefault(ca, ca)
        padres.setdefault(cb, cb)
        unir(ca, cb)
        cluster_ids_afectados.add(ca)
        cluster_ids_afectados.add(cb)

    grupos: dict[str, list[str]] = {}
    for cluster_id in cluster_ids_afectados:
        grupos.setdefault(raiz(cluster_id), []).append(cluster_id)

    personas_afectadas: set[str] = set()
    for miembros in grupos.values():
        if len(miembros) < 2:
            continue
        raw_ids_del_grupo = sorted(
            raw_id for raw_id, cid in cluster_de_raw.items() if cid in miembros
        )
        nuevo_cluster_id = f"c-{uuid.uuid5(uuid.NAMESPACE_OID, str(raw_ids_del_grupo))}"

        votos: dict[str, int] = {}
        for raw_id in raw_ids_del_grupo:
            pid = persona_de_raw.get(raw_id)
            if pid is not None:
                votos[pid] = votos.get(pid, 0) + 1
        persona_id = elegir_persona_id_superviviente(conn, votos)
        personas_afectadas.add(persona_id)

        marcadores = ",".join("?" * len(raw_ids_del_grupo))
        conn.execute(
            f"UPDATE clusters SET cluster_id = ?, persona_id = ?, decidido_por = 'humano', actualizado_en = ? "
            f"WHERE raw_record_id IN ({marcadores})",
            (nuevo_cluster_id, persona_id, _ahora(), *raw_ids_del_grupo),
        )
    return personas_afectadas


def deshacer(conn: sqlite3.Connection, cluster_id: str) -> int:
    """Separa todos los raw_records de un cluster en clusters propios de
    nuevo. No borra decisiones_log — queda como auditoría de que hubo una
    fusión y se revirtió.

    persona_id al separar: el grupo pasa a ser N personas distintas, así que
    ya no hay un persona_id "correcto" único. Se queda con el existente el
    raw_record_id más chico (mínima disrupción para quien ya lo tenga
    cacheado); el resto recibe un persona_id nuevo cada uno — ver
    motor/dedup/persona_id.py."""
    filas = conn.execute(
        "SELECT raw_record_id FROM clusters WHERE cluster_id = ? ORDER BY raw_record_id ASC",
        (cluster_id,),
    ).fetchall()
    personas_afectadas: set[str] = set()
    persona_previa = _persona_actual(conn, cluster_id)
    for indice, fila in enumerate(filas):
        raw_record_id = fila["raw_record_id"]
        nuevo_cluster_id = f"c-{raw_record_id}"
        persona_id = persona_previa if indice == 0 else crear_persona(conn)
        personas_afectadas.add(persona_id)
        conn.execute(
            "UPDATE clusters SET cluster_id = ?, persona_id = ?, decidido_por = 'humano', actualizado_en = ? "
            "WHERE raw_record_id = ?",
            (nuevo_cluster_id, persona_id, _ahora(), raw_record_id),
        )
    conn.execute(
        "INSERT INTO decisiones_log "
        "(cluster_id, raw_record_id_a, raw_record_id_b, accion, decidido_por, confianza, detalle, creado_en) "
        "VALUES (?, 0, NULL, 'deshacer', 'humano', NULL, NULL, ?)",
        (cluster_id, _ahora()),
    )
    conn.commit()
    _sincronizar_best_effort(conn, personas_afectadas)
    return len(filas)


def _persona_actual(conn: sqlite3.Connection, cluster_id: str) -> str:
    """persona_id de un cluster ya existente. Todos los raw_records de un
    mismo cluster_id comparten persona_id por construcción, así que alcanza
    con mirar cualquiera; si por algún motivo no hay ninguno asignado (dato
    viejo de antes de esta migración), crea uno ahora en vez de romper."""
    fila = conn.execute(
        "SELECT persona_id FROM clusters WHERE cluster_id = ? AND persona_id IS NOT NULL LIMIT 1",
        (cluster_id,),
    ).fetchone()
    return fila["persona_id"] if fila else crear_persona(conn)


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
        "SELECT raw_record_id, cluster_id, persona_id FROM clusters WHERE corrida_id = ? "
        "ORDER BY raw_record_id ASC",
        (corrida_id,),
    ).fetchall()
    cluster_ids = {f["cluster_id"] for f in filas}

    # Mismo criterio que deshacer(): cada cluster_id original se separa en
    # N personas -- el raw_record_id más chico DE CADA cluster conserva el
    # persona_id que tenía, el resto de ese mismo cluster recibe uno nuevo.
    por_cluster: dict[str, list] = {}
    for f in filas:
        por_cluster.setdefault(f["cluster_id"], []).append(f)

    personas_afectadas: set[str] = set()
    for miembros in por_cluster.values():
        persona_previa = miembros[0]["persona_id"] or crear_persona(conn)
        for indice, f in enumerate(miembros):
            nuevo_cluster_id = f"c-{f['raw_record_id']}"
            persona_id = persona_previa if indice == 0 else crear_persona(conn)
            personas_afectadas.add(persona_id)
            conn.execute(
                "UPDATE clusters SET cluster_id = ?, persona_id = ?, decidido_por = 'humano', "
                "corrida_id = NULL, actualizado_en = ? WHERE raw_record_id = ?",
                (nuevo_cluster_id, persona_id, _ahora(), f["raw_record_id"]),
            )
    conn.execute(
        "INSERT INTO decisiones_log "
        "(cluster_id, raw_record_id_a, raw_record_id_b, accion, decidido_por, confianza, detalle, corrida_id, creado_en) "
        "VALUES (?, 0, NULL, 'deshacer_corrida', 'humano', NULL, ?, ?, ?)",
        (corrida_id, f"{len(filas)} raw_records revertidos", corrida_id, _ahora()),
    )
    conn.commit()
    _sincronizar_best_effort(conn, personas_afectadas)
    return {
        "corrida_id": corrida_id,
        "clusters_afectados": len(cluster_ids),
        "raw_records_afectados": len(filas),
    }


def _materializar_clusters(conn: sqlite3.Connection, uf: UnionFind, corrida_id: str) -> set[str]:
    mapa_raw = {
        fila["id"]: fila["raw_record_id"]
        for fila in conn.execute("SELECT id, raw_record_id FROM normalized_records").fetchall()
    }
    # persona_id existente de cada raw_record ANTES de esta corrida (una sola
    # lectura, no una por grupo) -- necesario para aplicar la regla de
    # supervivencia cuando un grupo mezcla raw_records que ya tenían
    # personas distintas asignadas.
    persona_previa_por_raw: dict[int, str] = {
        fila["raw_record_id"]: fila["persona_id"]
        for fila in conn.execute("SELECT raw_record_id, persona_id FROM clusters WHERE persona_id IS NOT NULL").fetchall()
    }

    personas_afectadas: set[str] = set()
    for raiz, miembros in uf.grupos().items():
        cluster_id = (
            f"c-{raiz}" if len(miembros) == 1 else f"c-{uuid.uuid5(uuid.NAMESPACE_OID, str(sorted(miembros)))}"
        )
        raw_ids_del_grupo = [mapa_raw[nid] for nid in miembros if mapa_raw.get(nid) is not None]
        if not raw_ids_del_grupo:
            continue

        votos: dict[str, int] = {}
        for raw_id in raw_ids_del_grupo:
            pid = persona_previa_por_raw.get(raw_id)
            if pid is not None:
                votos[pid] = votos.get(pid, 0) + 1
        persona_id = elegir_persona_id_superviviente(conn, votos)
        personas_afectadas.add(persona_id)

        for raw_record_id in raw_ids_del_grupo:
            conn.execute(
                "INSERT INTO clusters (raw_record_id, cluster_id, persona_id, decidido_por, confianza, corrida_id, actualizado_en) "
                "VALUES (?, ?, ?, 'regla', NULL, ?, ?) "
                "ON CONFLICT(raw_record_id) DO UPDATE SET "
                "cluster_id=excluded.cluster_id, persona_id=excluded.persona_id, "
                "corrida_id=excluded.corrida_id, actualizado_en=excluded.actualizado_en",
                (raw_record_id, cluster_id, persona_id, corrida_id, _ahora()),
            )
    return personas_afectadas


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


def _sincronizar_best_effort(conn: sqlite3.Connection, persona_ids: set[str]) -> None:
    """Empuja a Supabase los contactos finales que cambiaron en esta
    operación. Nunca debe romper el pipeline de dedup: si Supabase no está
    configurado (uso normal hoy, ver .env.example) o la red falla, queda
    logueado y el motor sigue funcionando exactamente igual que antes de
    que existiera esta sincronización -- ver motor/supabase_sync.py."""
    if not persona_ids:
        return
    from motor import supabase_sync

    supabase_sync.sincronizar_contactos(conn, persona_ids)
