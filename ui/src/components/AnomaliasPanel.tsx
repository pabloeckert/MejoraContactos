import { useEffect, useState } from "react";

import { obtenerAnomalias } from "../api";
import type { Anomalia } from "../types";
import { IconAlert, IconCheck } from "./icons";

// anomalias.py (teléfono compartido por más de 5 contactos finales
// distintos) ya existía y corría por CLI/aviso mensual, pero nunca tuvo
// una pantalla propia -- el dato estaba calculado y nadie lo veía salvo
// que alguien corriera el comando a mano.
export default function AnomaliasPanel() {
  const [anomalias, setAnomalias] = useState<Anomalia[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerAnomalias()
      .then((r) => setAnomalias(r.anomalias))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-4 overflow-y-auto p-1">
      <div>
        <h2 className="font-marca text-lg font-medium text-marca-azul">Anomalías</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Teléfonos que aparecen en más de 5 contactos finales distintos (ya deduplicados) — típico de un número de
          conmutador/oficina guardado como si fuera de una persona, o de un error de carga.
        </p>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {anomalias === null && !error && <p className="text-sm text-neutral-400">Buscando...</p>}

      {anomalias?.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-neutral-200 bg-white py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <IconCheck className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-neutral-700">Sin anomalías</p>
          <p className="max-w-xs text-xs text-neutral-400">Ningún teléfono se repite en más de 5 contactos finales.</p>
        </div>
      )}

      {anomalias?.map((a) => (
        <div key={a.telefono} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-neutral-800">
            <IconAlert className="h-4 w-4 text-marca-amarillo" />
            <span className="font-mono">{a.telefono}</span>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600">
              {a.cantidad} contactos
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-neutral-500">{a.nombres.join(" · ")}</p>
        </div>
      ))}
    </div>
  );
}
