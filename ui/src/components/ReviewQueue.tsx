import { useEffect, useState } from "react";

import { decidir, obtenerRevision } from "../api";
import type { GrupoPendiente } from "../types";
import { IconCheck, IconClock, IconX } from "./icons";

interface Props {
  onCambio?: () => void;
}

export default function ReviewQueue({ onCambio }: Props) {
  const [grupos, setGrupos] = useState<GrupoPendiente[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decidiendo, setDecidiendo] = useState<string | null>(null);

  function recargar() {
    setCargando(true);
    setError(null);
    obtenerRevision()
      .then((r) => {
        setGrupos(r.grupos);
        setTotal(r.total);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setCargando(false));
  }

  useEffect(recargar, []);

  async function resolverGrupo(patron: string, aceptar: boolean) {
    setDecidiendo(patron);
    try {
      await decidir(patron, aceptar);
      recargar();
      onCambio?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setDecidiendo(null);
    }
  }

  if (cargando) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-400">
        Cargando cola de revisión...
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-200 bg-white text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <IconCheck className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium text-neutral-700">No hay casos pendientes</p>
        <p className="max-w-xs text-xs text-neutral-400">
          Todo lo que las reglas y el LLM-judge pudieron resolver solos ya está aplicado.
        </p>
      </div>
    );
  }

  return (
    <div className="scroll-fino flex h-full flex-col gap-3 overflow-y-auto pr-1">
      <p className="text-sm text-neutral-500">
        {total} casos pendientes, agrupados por patrón — aprobá o rechazá el lote entero de una.
      </p>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {grupos.map((grupo) => (
        <div
          key={grupo.patron}
          className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-800">
              <IconClock className="h-4 w-4 text-amber-500" />
              {grupo.patron}
            </div>
            <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600">
              {grupo.pares.length} casos
            </span>
          </div>

          <ul className="mt-3 space-y-1 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
            {grupo.pares.slice(0, 5).map((par, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="font-mono">
                  #{par.a} — #{par.b}
                </span>
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono">score {par.score.toFixed(2)}</span>
              </li>
            ))}
            {grupo.pares.length > 5 && <li>+ {grupo.pares.length - 5} más</li>}
          </ul>

          <div className="mt-3 flex gap-2">
            <button
              onClick={() => resolverGrupo(grupo.patron, true)}
              disabled={decidiendo === grupo.patron}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
            >
              <IconCheck className="h-3.5 w-3.5" />
              Aprobar lote
            </button>
            <button
              onClick={() => resolverGrupo(grupo.patron, false)}
              disabled={decidiendo === grupo.patron}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-50"
            >
              <IconX className="h-3.5 w-3.5" />
              Rechazar lote
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
