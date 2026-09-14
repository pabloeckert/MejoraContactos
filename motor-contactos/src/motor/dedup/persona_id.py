"""Identificador estable por persona real (`persona_id`), separado de
`cluster_id`. `cluster_id` cambia cada vez que un cluster se fusiona o se
separa (ver merge_engine.py) — es correcto para la auditoría interna, pero
inservible como referencia externa estable. `persona_id` es lo opuesto: se
crea una única vez y no se recalcula nunca, aunque el cluster detrás cambie.

Regla de supervivencia al fusionar (decisión 2026-09-14, ver
ESQUEMA-CONTACTO-COMPARTIDO.md § Resuelto): cuando dos o más clusters con
persona_id ya asignado se combinan en uno, sobrevive el persona_id del que
tenía MÁS raw_records aportando al grupo nuevo. Empate -> sobrevive el
persona_id más antiguo (menor `personas.creado_en`). Si ningún miembro del
grupo tenía persona_id todavía (raw_records nunca antes clusterizados), se
crea uno nuevo.

Regla al separar (deshacer/deshacer_ultima_corrida): un cluster separado dice
"en realidad son N personas distintas", así que ya no hay un persona_id
"correcto" para todos. Se aplica: el raw_record con el raw_record_id más
chico del grupo conserva el persona_id existente (para minimizar la
disrupción de quien ya lo tenga cacheado externamente), y cada uno de los
demás recibe un persona_id nuevo. Ver deshacer()/deshacer_ultima_corrida()
en merge_engine.py."""

from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone


def crear_persona(conn: sqlite3.Connection) -> str:
    """Crea una persona nueva y devuelve su persona_id. No hace commit —
    igual que el resto de las escrituras de este módulo, el caller decide
    cuándo comitear (normalmente al final de la operación completa)."""
    persona_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO personas (persona_id, creado_en) VALUES (?, ?)",
        (persona_id, _ahora()),
    )
    return persona_id


def elegir_persona_id_superviviente(conn: sqlite3.Connection, votos: dict[str, int]) -> str:
    """votos: persona_id -> cantidad de raw_records del grupo que ya lo
    tenían asignado (excluye raw_records sin persona_id todavía). Devuelve
    el persona_id que debe quedar para todo el grupo fusionado.

    - Sin votos (grupo 100% nuevo) -> crea una persona nueva.
    - Un solo persona_id entre los miembros -> ese mismo (nada que decidir).
    - Más de uno -> gana el de más raw_records; empate -> el más antiguo."""
    if not votos:
        return crear_persona(conn)
    if len(votos) == 1:
        return next(iter(votos))

    maximo = max(votos.values())
    empatados = [pid for pid, cantidad in votos.items() if cantidad == maximo]
    if len(empatados) == 1:
        return empatados[0]

    marcadores = ",".join("?" * len(empatados))
    filas = conn.execute(
        f"SELECT persona_id FROM personas WHERE persona_id IN ({marcadores}) "
        f"ORDER BY creado_en ASC, persona_id ASC",
        empatados,
    ).fetchall()
    # Si por algún motivo personas no tiene registro de alguno de los
    # empatados (no debería pasar en uso normal), no se rompe: se queda con
    # el primero en orden estable en vez de reventar la fusión.
    return filas[0]["persona_id"] if filas else sorted(empatados)[0]


def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat()
