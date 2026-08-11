import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState } from "react";

import { listarContactos } from "../api";
import type { Contacto } from "../types";
import EditDialog from "./EditDialog";
import { IconSearch, IconUsers } from "./icons";

const TAMANO_PAGINA = 500;
const ALTO_FILA = 52;

function iniciales(c: Contacto): string {
  const n = (c.nombre?.[0] ?? "").toUpperCase();
  const a = (c.apellido?.[0] ?? "").toUpperCase();
  return n + a || "?";
}

const COLORES_AVATAR = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];

function colorAvatar(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COLORES_AVATAR[h % COLORES_AVATAR.length];
}

export default function ContactsTable() {
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [total, setTotal] = useState(0);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<Contacto | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    listarContactos(1, TAMANO_PAGINA, busqueda || undefined)
      .then((r) => {
        if (cancelado) return;
        setContactos(r.contactos);
        setTotal(r.total);
      })
      .catch((e) => !cancelado && setError(String(e)))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [busqueda]);

  const virtualizador = useVirtualizer({
    count: contactos.length,
    getScrollElement: () => contenedorRef.current,
    estimateSize: () => ALTO_FILA,
    overscan: 20,
  });

  function alGuardar(actualizado: Contacto) {
    setContactos((prev) => prev.map((c) => (c.cluster_id === actualizado.cluster_id ? actualizado : c)));
    setEditando(null);
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="relative w-96">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, teléfono o email..."
            className="w-full rounded-lg border border-neutral-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <span className="text-sm text-neutral-500">
          {cargando ? "Cargando..." : `${total.toLocaleString("es-AR")} contactos`}
          {busqueda && !cargando && ` (mostrando hasta ${TAMANO_PAGINA})`}
        </span>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="grid grid-cols-[2fr_1.6fr_1fr_1.2fr_0.8fr] gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
          <span>Nombre</span>
          <span>Empresa / Cargo</span>
          <span>WhatsApp</span>
          <span>Email</span>
          <span>Tag</span>
        </div>

        {!cargando && contactos.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <IconUsers className="h-8 w-8 text-neutral-300" />
            <p className="text-sm text-neutral-400">
              {busqueda ? `Sin resultados para "${busqueda}"` : "Todavía no hay contactos procesados"}
            </p>
          </div>
        ) : (
          <div ref={contenedorRef} className="scroll-fino flex-1 overflow-auto">
            <div style={{ height: virtualizador.getTotalSize(), position: "relative" }}>
              {virtualizador.getVirtualItems().map((fila) => {
                const c = contactos[fila.index];
                return (
                  <button
                    key={c.cluster_id}
                    onClick={() => setEditando(c)}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: ALTO_FILA,
                      transform: `translateY(${fila.start}px)`,
                    }}
                    className="grid grid-cols-[2fr_1.6fr_1fr_1.2fr_0.8fr] items-center gap-3 border-b border-neutral-100 px-4 text-left text-sm transition hover:bg-neutral-50"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${colorAvatar(c.cluster_id)}`}
                      >
                        {iniciales(c)}
                      </span>
                      <span className="truncate font-medium text-neutral-800">
                        {c.nombre} {c.apellido}
                      </span>
                    </span>
                    <span className="truncate text-neutral-500">
                      {[c.organizacion, c.cargo].filter(Boolean).join(" — ") || "—"}
                    </span>
                    <span className="truncate text-neutral-500">{c.whatsapp[0] ?? "—"}</span>
                    <span className="truncate text-neutral-500">{c.emails[0] ?? "—"}</span>
                    <span>
                      {c.tag ? (
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                          {c.tag}
                        </span>
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {editando && <EditDialog contacto={editando} onClose={() => setEditando(null)} onGuardado={alGuardar} />}
    </div>
  );
}
