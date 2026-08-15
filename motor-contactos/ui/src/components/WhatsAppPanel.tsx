import { useState } from "react";

import { correrAccion } from "../api";

// MejoraWS (Electron+React+Baileys, proyecto hermano) es quien de verdad
// maneja la sesión de WhatsApp y el envío -- acá NO se reimplementa nada
// de eso, solo se integra como módulo: exportar el CSV en el formato que
// espera, y un botón para abrirla directo sin ir a buscarla al Explorador.
export default function WhatsAppPanel() {
  const [corriendo, setCorriendo] = useState<"exportar" | "abrir" | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [esError, setEsError] = useState(false);

  async function ejecutar(clave: "exportar" | "abrir", accion: string) {
    setCorriendo(clave);
    setMensaje(null);
    setEsError(false);
    try {
      const r = await correrAccion(accion);
      setMensaje(r.mensaje ?? r.error ?? null);
      setEsError(!r.ok);
    } catch (e) {
      setMensaje(String(e));
      setEsError(true);
    } finally {
      setCorriendo(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 overflow-y-auto p-1">
      <div>
        <h2 className="font-marca text-lg font-medium text-marca-azul">WhatsApp (MejoraWS)</h2>
        <p className="mt-1 text-sm text-neutral-500">
          El envío real de WhatsApp corre en MejoraWS, una app aparte — acá está integrada como un paso más del
          flujo, sin salir a buscarla.
        </p>
      </div>

      {mensaje && (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            esError
              ? "border-marca-rojo/40 bg-marca-rojo/10 text-marca-rojo"
              : "border-accent/30 bg-accent/5 text-neutral-700"
          }`}
        >
          {mensaje}
        </p>
      )}

      <ol className="space-y-4">
        <Paso n={1} titulo="Exportá la lista en formato MejoraWS">
          Genera <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">contactos-whatsapp.csv</code> (nombre,
          teléfono, variable).
          <div className="mt-2">
            <button
              onClick={() => ejecutar("exportar", "exportar-whatsapp")}
              disabled={corriendo === "exportar"}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {corriendo === "exportar" ? "Exportando..." : "Exportar CSV"}
            </button>
          </div>
        </Paso>
        <Paso n={2} titulo="Abrí MejoraWS">
          Lanza la app aparte (puede tardar unos segundos la primera vez).
          <div className="mt-2">
            <button
              onClick={() => ejecutar("abrir", "abrir-mejoraws")}
              disabled={corriendo === "abrir"}
              className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {corriendo === "abrir" ? "Abriendo..." : "Abrir MejoraWS"}
            </button>
          </div>
        </Paso>
        <Paso n={3} titulo="Importá el CSV ahí">
          Botón <strong>Importar CSV/Excel</strong> dentro de MejoraWS, elegí el archivo del paso 1.
        </Paso>
        <Paso n={4} titulo="Revisá config y mandá">
          Mensaje inicial, delay entre envíos, tope diario, keywords de auto-respuesta — todo eso vive en MejoraWS,
          no acá. <strong>Iniciar envío</strong> cuando esté listo.
        </Paso>
      </ol>

      <p className="rounded-lg border border-marca-amarillo/40 bg-marca-amarillo/10 px-3 py-2 text-xs text-neutral-700">
        MejoraWS tiene delay random y tope diario a propósito — no es una herramienta de bulk/spam. Subir el volumen
        o escribirle a gente que no te conoce sube en serio el riesgo de que WhatsApp banee el número (cosa de Meta,
        no hay forma de evitarlo del todo). Los límites y el keyword de auto-respuesta se configuran dentro de
        MejoraWS.
      </p>
    </div>
  );
}

function Paso({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold text-accent">
        {n}
      </span>
      <div className="min-w-0 text-sm text-neutral-600">
        <div className="mb-1 font-medium text-neutral-800">{titulo}</div>
        {children}
      </div>
    </li>
  );
}
