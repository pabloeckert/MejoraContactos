import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { correrAccion, obtenerStats } from "./api";
import ContactsTable from "./components/ContactsTable";
import {
  IconAlert,
  IconChat,
  IconCheck,
  IconClock,
  IconDatabase,
  IconDownload,
  IconPlay,
  IconSync,
  IconUsers,
} from "./components/icons";
import ImportPanel from "./components/ImportPanel";
import ReviewQueue from "./components/ReviewQueue";
import StatCard from "./components/StatCard";
import SyncPanel from "./components/SyncPanel";
import WhatsAppPanel from "./components/WhatsAppPanel";
import type { Stats } from "./types";

type Vista = "contactos" | "revisar" | "importar" | "whatsapp" | "sync";

export default function App() {
  const [vista, setVista] = useState<Vista>("contactos");
  const [stats, setStats] = useState<Stats | null>(null);
  const [corriendo, setCorriendo] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  function recargarStats() {
    obtenerStats()
      .then(setStats)
      .catch(() => setStats(null));
  }

  useEffect(recargarStats, []);

  async function correrTodo() {
    setCorriendo(true);
    setMensaje(null);
    try {
      const r = await correrAccion("run");
      setMensaje(r.mensaje ?? r.error ?? null);
      recargarStats();
    } catch (e) {
      setMensaje(String(e));
    } finally {
      setCorriendo(false);
    }
  }

  return (
    <div className="flex h-screen bg-neutral-50">
      <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-200 bg-white">
        <div className="flex items-center gap-2 px-5 py-5">
          <img src="/marca/isotipo-color.png" alt="" className="h-8 w-8" />
          <span className="font-marca text-sm font-medium tracking-tight text-marca-azul">motor-contactos</span>
        </div>

        <nav className="flex flex-col gap-1 px-3">
          <NavItem
            activo={vista === "contactos"}
            onClick={() => setVista("contactos")}
            icono={<IconUsers className="h-4 w-4" />}
          >
            Contactos
          </NavItem>
          <NavItem
            activo={vista === "revisar"}
            onClick={() => setVista("revisar")}
            icono={<IconAlert className="h-4 w-4" />}
            contador={stats?.pendientes}
          >
            Revisión pendiente
          </NavItem>
          <NavItem
            activo={vista === "importar"}
            onClick={() => setVista("importar")}
            icono={<IconDownload className="h-4 w-4" />}
          >
            Importar
          </NavItem>
          <NavItem activo={vista === "whatsapp"} onClick={() => setVista("whatsapp")} icono={<IconChat className="h-4 w-4" />}>
            WhatsApp
          </NavItem>
          <NavItem activo={vista === "sync"} onClick={() => setVista("sync")} icono={<IconSync className="h-4 w-4" />}>
            Sync a Google
          </NavItem>
        </nav>

        <div className="mt-auto space-y-2 border-t border-neutral-100 p-3">
          <button
            onClick={correrTodo}
            disabled={corriendo}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <IconPlay className="h-4 w-4" />
            {corriendo ? "Corriendo..." : "Correr pipeline"}
          </button>
          {mensaje && <p className="text-center text-xs leading-snug text-neutral-500">{mensaje}</p>}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden p-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-neutral-200 bg-white px-5 py-3 shadow-sm">
          <StatCard
            etiqueta="Contactos"
            valor={stats?.contactos_finales ?? "—"}
            icono={<IconUsers className="h-4 w-4" />}
            tono="accent"
          />
          <span className="h-5 w-px bg-neutral-200" />
          <StatCard
            etiqueta="Normalizados"
            valor={stats?.normalized_records ?? "—"}
            icono={<IconDatabase className="h-4 w-4" />}
          />
          <span className="h-5 w-px bg-neutral-200" />
          <StatCard
            etiqueta="Crudos"
            valor={stats?.raw_records ?? "—"}
            icono={<IconCheck className="h-4 w-4" />}
          />
          <span className="h-5 w-px bg-neutral-200" />
          <StatCard
            etiqueta="Pendientes"
            valor={stats?.pendientes ?? "—"}
            icono={<IconClock className="h-4 w-4" />}
            tono={stats && stats.pendientes > 0 ? "warn" : "neutral"}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {vista === "contactos" && <ContactsTable />}
          {vista === "revisar" && <ReviewQueue onCambio={recargarStats} />}
          {vista === "importar" && <ImportPanel />}
          {vista === "whatsapp" && <WhatsAppPanel />}
          {vista === "sync" && <SyncPanel />}
        </div>
      </main>
    </div>
  );
}

function NavItem({
  activo,
  onClick,
  icono,
  contador,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  icono: ReactNode;
  contador?: number;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
        activo ? "bg-accent/10 text-accent" : "text-neutral-600 hover:bg-neutral-100"
      }`}
    >
      {icono}
      <span className="flex-1 text-left">{children}</span>
      {!!contador && (
        <span className="rounded-full bg-marca-amarillo px-1.5 py-0.5 text-xs font-semibold text-marca-tinta">
          {contador}
        </span>
      )}
    </button>
  );
}
