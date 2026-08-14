import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";

import { listarContactos } from "../api";
import type { Contacto } from "../types";
import EditDialog from "./EditDialog";
import { IconAlert, IconSearch, IconSliders, IconUsers, IconX } from "./icons";

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

// Sin nombre no significa sin identidad: mostramos el mejor identificador
// secundario disponible (whatsapp > email > empresa) en vez del genérico
// "(sin nombre)" pelado -- pedido explícito tras revisión UX (2026-08-14).
function identidad(c: Contacto): { texto: string; esFallback: boolean } {
  const nombre = `${c.nombre ?? ""} ${c.apellido ?? ""}`.trim();
  if (nombre) return { texto: nombre, esFallback: false };
  const alterno = c.whatsapp[0] || c.telefono_fijo[0] || c.emails[0] || c.organizacion;
  return { texto: alterno || "Sin datos de identidad", esFallback: true };
}

// Paleta de avatar derivada de los 3 colores de marca (azul/rojo/amarillo)
// más 3 tonos neutros de apoyo -- antes era la paleta genérica de Tailwind
// (azul/verde/violeta/ámbar/rosa/cian) sin relación con la identidad
// visual del resto de la app.
const COLORES_AVATAR = [
  "bg-marca-azul/10 text-marca-azul",
  "bg-marca-rojo/10 text-marca-rojo",
  "bg-marca-amarillo/25 text-[#8a6c0a]", // texto oscurecido sobre amarillo por contraste (WCAG)
  "bg-neutral-200 text-neutral-700",
  "bg-marca-azul/20 text-marca-azul",
  "bg-neutral-800/10 text-neutral-800",
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
  const [panelAbierto, setPanelAbierto] = useState(false);

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
          [identidad(c).texto, ...COLUMNAS.map((col) => col.texto(c))].join(" "),
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

        <button
          onClick={() => setPanelAbierto(true)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${
            filtrosActivos > 0
              ? "border-accent/40 bg-accent/5 text-accent"
              : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
          }`}
        >
          <IconSliders className="h-3.5 w-3.5" />
          Columnas y filtros
          {filtrosActivos > 0 && (
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">{filtrosActivos}</span>
          )}
        </button>

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
                {columnasActivas.map((col) => {
                  const filtroActivo = col.key === "tag" ? tagsFiltro.size > 0 : !!filtrosColumna[col.key];
                  return (
                    <div
                      key={col.key}
                      className="relative flex shrink-0 items-center gap-1 border-r border-neutral-100 px-3"
                      style={{ width: anchos[col.key] ?? col.anchoDefault }}
                    >
                      <span className="truncate">{col.label}</span>
                      {/* Sin popover por columna a propósito -- se sacaron porque en
                          las columnas del extremo derecho (Tag, Nota) se abrían
                          fuera del viewport visible. Un punto simple avisa que hay
                          un filtro activo; ajustarlo se hace desde el panel lateral
                          (botón "Columnas y filtros"), que siempre es visible
                          completo sin importar qué tan angosta o ancha esté la tabla. */}
                      {filtroActivo && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" title="Filtro activo" />}
                      <div
                        onMouseDown={(e) => iniciarResize(col.key, e)}
                        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-accent/30"
                      />
                    </div>
                  );
                })}
              </div>

              <div style={{ height: virtualizador.getTotalSize(), position: "relative" }}>
                {virtualizador.getVirtualItems().map((fila) => {
                  const c = filtrados[fila.index];
                  const id = identidad(c);
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
                        <span className="min-w-0">
                          <span className={`block truncate font-medium ${id.esFallback ? "text-neutral-500" : "text-neutral-800"}`}>
                            {id.texto}
                          </span>
                          {id.esFallback && <span className="block text-[10px] uppercase tracking-wide text-neutral-400">Sin nombre</span>}
                        </span>
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

      {panelAbierto && (
        <PanelColumnasFiltros
          visibles={visibles}
          onCambiarVisible={(key, val) => setVisibles((prev) => ({ ...prev, [key]: val }))}
          filtrosColumna={filtrosColumna}
          onCambiarFiltro={(key, val) => setFiltrosColumna((prev) => ({ ...prev, [key]: val }))}
          tagsFiltro={tagsFiltro}
          onCambiarTags={setTagsFiltro}
          onLimpiarTodo={limpiarFiltros}
          onCerrar={() => setPanelAbierto(false)}
        />
      )}

      {editando && <EditDialog contacto={editando} onClose={() => setEditando(null)} onGuardado={alGuardar} />}
    </div>
  );
}

// Panel lateral único para columnas visibles + filtro por campo. Reemplaza
// el dropdown de "Columnas" (que se abría sobre el propio contenido de la
// tabla, tapando las primeras filas) y los popovers de filtro por
// encabezado (que en las columnas del extremo derecho se abrían fuera del
// viewport visible en tablas anchas) -- un solo lugar fijo, siempre
// completamente visible sin importar el ancho/scroll de la tabla.
function PanelColumnasFiltros({
  visibles,
  onCambiarVisible,
  filtrosColumna,
  onCambiarFiltro,
  tagsFiltro,
  onCambiarTags,
  onLimpiarTodo,
  onCerrar,
}: {
  visibles: Record<string, boolean>;
  onCambiarVisible: (key: ColumnKey, val: boolean) => void;
  filtrosColumna: Partial<Record<ColumnKey, string>>;
  onCambiarFiltro: (key: ColumnKey, val: string) => void;
  tagsFiltro: Set<string>;
  onCambiarTags: (s: Set<string>) => void;
  onLimpiarTodo: () => void;
  onCerrar: () => void;
}) {
  function alternarTag(tag: string) {
    const nuevo = new Set(tagsFiltro);
    if (nuevo.has(tag)) nuevo.delete(tag);
    else nuevo.add(tag);
    onCambiarTags(nuevo);
  }

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/20" onClick={onCerrar} />
      <div className="fixed right-0 top-0 z-40 flex h-full w-[22rem] flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <h2 className="font-marca text-sm font-medium text-marca-azul">Columnas y filtros</h2>
          <button onClick={onCerrar} className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600">
            <IconX className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scroll-fino px-5 py-4">
          <section className="mb-6">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Columnas visibles</h3>
            <div className="grid grid-cols-2 gap-1">
              {COLUMNAS.map((col) => (
                <label key={col.key} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm text-neutral-700 hover:bg-neutral-50">
                  <input
                    type="checkbox"
                    checked={visibles[col.key] !== false}
                    onChange={(e) => onCambiarVisible(col.key, e.target.checked)}
                    className="accent-accent"
                  />
                  {col.label}
                </label>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Filtros por campo</h3>
              <button onClick={onLimpiarTodo} className="text-xs font-medium text-marca-rojo hover:underline">
                Limpiar todo
              </button>
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-neutral-600">Tag</label>
              <div className="flex flex-wrap gap-1.5">
                {[...TAGS_CONOCIDOS, "(sin tag)"].map((tag) => (
                  <button
                    key={tag}
                    onClick={() => alternarTag(tag)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                      tagsFiltro.has(tag)
                        ? "border-accent bg-accent text-white"
                        : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {COLUMNAS.filter((c) => c.key !== "tag").map((col) => (
              <label key={col.key} className="mb-3 block text-xs font-medium text-neutral-600">
                {col.label}
                <input
                  value={filtrosColumna[col.key] ?? ""}
                  onChange={(e) => onCambiarFiltro(col.key, e.target.value)}
                  placeholder="Contiene..."
                  className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm font-normal text-neutral-800 outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
                />
              </label>
            ))}
          </section>
        </div>
      </div>
    </>
  );
}
