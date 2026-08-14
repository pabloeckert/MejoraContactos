import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";

import { listarContactos } from "../api";
import type { Contacto } from "../types";
import EditDialog from "./EditDialog";
import { IconAlert, IconSearch, IconUsers, IconX } from "./icons";

// Carga toda la base en memoria y filtra/ordena client-side -- 8.500
// contactos es liviano, y así la búsqueda y los filtros por columna son
// instantáneos (sin ida y vuelta al server por cada tecla). El backend
// tiene tope en 20.000 (api.py) para no aceptar un valor arbitrario.
const TAMANO_PAGINA = 20000;
const ALTO_FILA = 44;
const ALTO_HEADER = 40;
const ANCHO_MIN_COLUMNA = 90;

// Mismo enum que motor/tagging.py:_TAGS_VALIDOS -- se repite acá porque
// es la única forma de tener un multiselect sin ida y vuelta al server.
const TAGS_CONOCIDOS = ["familiar", "laboral", "cliente", "proveedor", "personal"];

type ColumnKey =
  | "cargo" | "organizacion" | "whatsapp" | "telefono_fijo" | "emails"
  | "ciudad" | "provincia" | "pais" | "domicilio" | "cumpleanos" | "tag" | "nota_referencia";

interface ColumnaDef {
  key: ColumnKey;
  label: string;
  anchoDefault: number;
  visibleDefault: boolean;
  texto: (c: Contacto) => string;
}

const COLUMNAS: ColumnaDef[] = [
  { key: "cargo", label: "Cargo", anchoDefault: 160, visibleDefault: true, texto: (c) => c.cargo },
  { key: "organizacion", label: "Empresa", anchoDefault: 180, visibleDefault: true, texto: (c) => c.organizacion },
  { key: "whatsapp", label: "WhatsApp", anchoDefault: 200, visibleDefault: true, texto: (c) => c.whatsapp.join(", ") },
  { key: "telefono_fijo", label: "Teléfono fijo", anchoDefault: 160, visibleDefault: true, texto: (c) => c.telefono_fijo.join(", ") },
  { key: "emails", label: "Email", anchoDefault: 220, visibleDefault: true, texto: (c) => c.emails.join(", ") },
  { key: "ciudad", label: "Ciudad", anchoDefault: 130, visibleDefault: true, texto: (c) => c.ciudad },
  { key: "provincia", label: "Provincia", anchoDefault: 130, visibleDefault: true, texto: (c) => c.provincia },
  { key: "pais", label: "País", anchoDefault: 110, visibleDefault: true, texto: (c) => c.pais },
  { key: "domicilio", label: "Domicilio", anchoDefault: 180, visibleDefault: true, texto: (c) => c.domicilio },
  { key: "cumpleanos", label: "Cumpleaños", anchoDefault: 120, visibleDefault: true, texto: (c) => c.cumpleanos },
  { key: "tag", label: "Tag", anchoDefault: 110, visibleDefault: true, texto: (c) => c.tag },
  { key: "nota_referencia", label: "Nota de referencia", anchoDefault: 220, visibleDefault: true, texto: (c) => c.nota_referencia },
];

const CLAVE_ANCHOS = "motor-contactos:anchos-columna";
const CLAVE_VISIBLES = "motor-contactos:columnas-visibles";

function cargarJSON<T>(clave: string, porDefecto: T): T {
  try {
    const crudo = localStorage.getItem(clave);
    return crudo ? { ...porDefecto, ...JSON.parse(crudo) } : porDefecto;
  } catch {
    return porDefecto;
  }
}

function iniciales(c: Contacto): string {
  const n = (c.nombre?.[0] ?? "").toUpperCase();
  const a = (c.apellido?.[0] ?? "").toUpperCase();
  return n + a || "·";
}

function nombreCompleto(c: Contacto): string {
  const n = `${c.nombre ?? ""} ${c.apellido ?? ""}`.trim();
  return n || "(sin nombre)";
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

function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // saca acentos para que "Posadas"/"posadas" y "Perez"/"Pérez" matcheen igual
}

export default function ContactsTable() {
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<Contacto | null>(null);

  const [busquedaGlobal, setBusquedaGlobal] = useState("");
  const [filtrosColumna, setFiltrosColumna] = useState<Partial<Record<ColumnKey, string>>>({});
  const [tagsFiltro, setTagsFiltro] = useState<Set<string>>(new Set());
  const [columnaConFiltroAbierto, setColumnaConFiltroAbierto] = useState<ColumnKey | null>(null);
  const [menuColumnasAbierto, setMenuColumnasAbierto] = useState(false);

  const [anchos, setAnchos] = useState<Record<string, number>>(() =>
    cargarJSON(
      CLAVE_ANCHOS,
      Object.fromEntries(COLUMNAS.map((c) => [c.key, c.anchoDefault])),
    ),
  );
  const [visibles, setVisibles] = useState<Record<string, boolean>>(() =>
    cargarJSON(
      CLAVE_VISIBLES,
      Object.fromEntries(COLUMNAS.map((c) => [c.key, c.visibleDefault])),
    ),
  );

  function alternarFiltroColumna(key: ColumnKey) {
    setColumnaConFiltroAbierto((v) => (v === key ? null : key));
    setMenuColumnasAbierto(false);
  }

  const contenedorRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ key: ColumnKey; startX: number; startAncho: number } | null>(null);

  useEffect(() => {
    let cancelado = false;
    listarContactos(1, TAMANO_PAGINA)
      .then((r) => !cancelado && setContactos(r.contactos))
      .catch((e) => !cancelado && setError(String(e)))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(CLAVE_ANCHOS, JSON.stringify(anchos));
  }, [anchos]);
  useEffect(() => {
    localStorage.setItem(CLAVE_VISIBLES, JSON.stringify(visibles));
  }, [visibles]);

  const columnasActivas = useMemo(() => COLUMNAS.filter((c) => visibles[c.key] !== false), [visibles]);
  const filtrosActivos = Object.values(filtrosColumna).filter(Boolean).length + (tagsFiltro.size > 0 ? 1 : 0);

  const filtrados = useMemo(() => {
    const global = normalizarTexto(busquedaGlobal.trim());
    const porColumna = Object.entries(filtrosColumna)
      .filter(([, v]) => v)
      .map(([k, v]) => [k as ColumnKey, normalizarTexto(v!)] as const);

    return contactos.filter((c) => {
      if (tagsFiltro.size > 0 && !tagsFiltro.has(c.tag || "(sin tag)")) return false;
      for (const [key, valor] of porColumna) {
        const columna = COLUMNAS.find((col) => col.key === key)!;
        if (!normalizarTexto(columna.texto(c)).includes(valor)) return false;
      }
      if (global) {
        const bolsa = normalizarTexto(
          [nombreCompleto(c), ...COLUMNAS.map((col) => col.texto(c))].join(" "),
        );
        if (!bolsa.includes(global)) return false;
      }
      return true;
    });
  }, [contactos, busquedaGlobal, filtrosColumna, tagsFiltro]);

  const virtualizador = useVirtualizer({
    count: filtrados.length,
    getScrollElement: () => contenedorRef.current,
    estimateSize: () => ALTO_FILA,
    overscan: 20,
  });

  function alGuardar(actualizado: Contacto) {
    setContactos((prev) => prev.map((c) => (c.cluster_id === actualizado.cluster_id ? actualizado : c)));
    setEditando(null);
  }

  function limpiarFiltros() {
    setBusquedaGlobal("");
    setFiltrosColumna({});
    setTagsFiltro(new Set());
  }

  function iniciarResize(key: ColumnKey, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { key, startX: e.clientX, startAncho: anchos[key] ?? 150 };
    window.addEventListener("mousemove", moverResize);
    window.addEventListener("mouseup", terminarResize);
  }
  function moverResize(e: MouseEvent) {
    const r = resizeRef.current;
    if (!r) return;
    const nuevo = Math.max(ANCHO_MIN_COLUMNA, r.startAncho + (e.clientX - r.startX));
    setAnchos((prev) => ({ ...prev, [r.key]: nuevo }));
  }
  function terminarResize() {
    resizeRef.current = null;
    window.removeEventListener("mousemove", moverResize);
    window.removeEventListener("mouseup", terminarResize);
  }

  const anchoNombre = 220;
  const anchoTotal = anchoNombre + columnasActivas.reduce((acc, c) => acc + (anchos[c.key] ?? c.anchoDefault), 0);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="relative w-80">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={busquedaGlobal}
            onChange={(e) => setBusquedaGlobal(e.target.value)}
            placeholder="Buscar en todos los campos..."
            className="w-full rounded-lg border border-neutral-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>

        <div className="relative">
          <button
            onClick={() => {
              setMenuColumnasAbierto((v) => !v);
              setColumnaConFiltroAbierto(null);
            }}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Columnas
          </button>
          {menuColumnasAbierto && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuColumnasAbierto(false)} />
              <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-neutral-200 bg-white p-2 shadow-lg">
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                  Columnas visibles
                </p>
                {COLUMNAS.map((col) => (
                  <label key={col.key} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50">
                    <input
                      type="checkbox"
                      checked={visibles[col.key] !== false}
                      onChange={(e) => setVisibles((prev) => ({ ...prev, [col.key]: e.target.checked }))}
                      className="accent-accent"
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {filtrosActivos > 0 && (
          <button
            onClick={limpiarFiltros}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-marca-rojo hover:bg-marca-rojo/10"
          >
            <IconX className="h-3 w-3" />
            Limpiar {filtrosActivos} filtro{filtrosActivos > 1 ? "s" : ""}
          </button>
        )}

        <span className="ml-auto text-sm text-neutral-500">
          {cargando
            ? "Cargando..."
            : filtrados.length === contactos.length
              ? `${contactos.length.toLocaleString("es-AR")} contactos`
              : `${filtrados.length.toLocaleString("es-AR")} de ${contactos.length.toLocaleString("es-AR")} contactos`}
        </span>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        {!cargando && contactos.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <IconUsers className="h-8 w-8 text-neutral-300" />
            <p className="text-sm text-neutral-400">Todavía no hay contactos procesados</p>
          </div>
        ) : !cargando && filtrados.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <IconAlert className="h-8 w-8 text-neutral-300" />
            <p className="text-sm text-neutral-500">Sin resultados para estos filtros.</p>
            <button onClick={limpiarFiltros} className="text-sm font-medium text-accent underline underline-offset-2">
              Limpiar filtros
            </button>
          </div>
        ) : (
          <div ref={contenedorRef} className="scroll-fino flex-1 overflow-auto">
            <div style={{ width: anchoTotal, minWidth: "100%" }}>
              {/* Header: sticky arriba, se desplaza horizontal junto con las filas (mismo contenedor de scroll). */}
              <div
                className="sticky top-0 z-10 flex border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold uppercase tracking-wider text-neutral-500"
                style={{ height: ALTO_HEADER }}
              >
                <div className="sticky left-0 z-10 flex shrink-0 items-center border-r border-neutral-200 bg-neutral-50 px-4" style={{ width: anchoNombre }}>
                  Nombre
                </div>
                {columnasActivas.map((col) => (
                  <div
                    key={col.key}
                    className="relative flex shrink-0 items-center gap-1 border-r border-neutral-100 px-3"
                    style={{ width: anchos[col.key] ?? col.anchoDefault }}
                  >
                    <span className="truncate">{col.label}</span>
                    {col.key === "tag" ? (
                      <TagFiltroBoton
                        abierto={columnaConFiltroAbierto === "tag"}
                        onToggle={() => alternarFiltroColumna("tag")}
                        seleccionados={tagsFiltro}
                        onCambiar={setTagsFiltro}
                      />
                    ) : (
                      <ColumnaFiltroBoton
                        activo={!!filtrosColumna[col.key]}
                        abierto={columnaConFiltroAbierto === col.key}
                        onToggle={() => alternarFiltroColumna(col.key)}
                        valor={filtrosColumna[col.key] ?? ""}
                        onCambiar={(v) => setFiltrosColumna((prev) => ({ ...prev, [col.key]: v }))}
                        label={col.label}
                      />
                    )}
                    <div
                      onMouseDown={(e) => iniciarResize(col.key, e)}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-accent/30"
                    />
                  </div>
                ))}
              </div>

              <div style={{ height: virtualizador.getTotalSize(), position: "relative" }}>
                {virtualizador.getVirtualItems().map((fila) => {
                  const c = filtrados[fila.index];
                  return (
                    <button
                      key={c.cluster_id}
                      onClick={() => setEditando(c)}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: anchoTotal,
                        height: ALTO_FILA,
                        transform: `translateY(${fila.start}px)`,
                      }}
                      className="flex items-center border-b border-neutral-100 text-left text-sm transition hover:bg-neutral-50"
                    >
                      <span
                        className="sticky left-0 z-[1] flex h-full shrink-0 items-center gap-2.5 border-r border-neutral-100 bg-white px-4 group-hover:bg-neutral-50"
                        style={{ width: anchoNombre }}
                      >
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${colorAvatar(c.cluster_id)}`}
                        >
                          {iniciales(c)}
                        </span>
                        <span className="truncate font-medium text-neutral-800">{nombreCompleto(c)}</span>
                      </span>
                      {columnasActivas.map((col) => (
                        <span
                          key={col.key}
                          className="shrink-0 truncate border-r border-neutral-50 px-3 text-neutral-500"
                          style={{ width: anchos[col.key] ?? col.anchoDefault }}
                        >
                          {col.key === "tag" ? (
                            c.tag ? (
                              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                                {c.tag}
                              </span>
                            ) : (
                              <span className="text-neutral-300">—</span>
                            )
                          ) : (
                            col.texto(c) || <span className="text-neutral-300">—</span>
                          )}
                        </span>
                      ))}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {editando && <EditDialog contacto={editando} onClose={() => setEditando(null)} onGuardado={alGuardar} />}
    </div>
  );
}

function ColumnaFiltroBoton({
  activo,
  abierto,
  onToggle,
  valor,
  onCambiar,
  label,
}: {
  activo: boolean;
  abierto: boolean;
  onToggle: () => void;
  valor: string;
  onCambiar: (v: string) => void;
  label: string;
}) {
  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`rounded p-0.5 ${activo ? "text-accent" : "text-neutral-300 hover:text-neutral-500"}`}
        title={`Filtrar por ${label.toLowerCase()}`}
      >
        <IconSearch className="h-3 w-3" />
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-10" onClick={onToggle} />
          <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-lg border border-neutral-200 bg-white p-2 normal-case shadow-lg">
            <input
              autoFocus
              value={valor}
              onChange={(e) => onCambiar(e.target.value)}
              placeholder={`${label} contiene...`}
              className="w-full rounded border border-neutral-300 px-2 py-1 text-xs font-normal outline-none focus:border-accent"
            />
          </div>
        </>
      )}
    </div>
  );
}

function TagFiltroBoton({
  abierto,
  onToggle,
  seleccionados,
  onCambiar,
}: {
  abierto: boolean;
  onToggle: () => void;
  seleccionados: Set<string>;
  onCambiar: (s: Set<string>) => void;
}) {
  function alternar(tag: string) {
    const nuevo = new Set(seleccionados);
    if (nuevo.has(tag)) nuevo.delete(tag);
    else nuevo.add(tag);
    onCambiar(nuevo);
  }

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`rounded p-0.5 ${seleccionados.size > 0 ? "text-accent" : "text-neutral-300 hover:text-neutral-500"}`}
        title="Filtrar por tag"
      >
        <IconSearch className="h-3 w-3" />
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-10" onClick={onToggle} />
          <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-lg border border-neutral-200 bg-white p-2 normal-case shadow-lg">
            {[...TAGS_CONOCIDOS, "(sin tag)"].map((tag) => (
              <label key={tag} className="flex items-center gap-2 rounded px-2 py-1 text-sm font-normal text-neutral-700 hover:bg-neutral-50">
                <input type="checkbox" checked={seleccionados.has(tag)} onChange={() => alternar(tag)} className="accent-accent" />
                {tag}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
