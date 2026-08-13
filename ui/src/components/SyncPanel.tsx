// Fase 4 — Sync a Google Contacts. El deploy real (crear el Sheet, pegar
// el script, autorizar) requiere el login de Google de cada cuenta — lo
// único de todo este proyecto que no puede resolver una IA por vos. Este
// panel deja el camino lo más corto posible: un link directo a Sheets, un
// link directo a Apps Script, y el paso a paso.
export default function SyncPanel() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 overflow-y-auto p-1">
      <div>
        <h2 className="font-marca text-lg font-medium text-marca-azul">Sync a Google Contacts</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Mantiene tu lista maestra sincronizada con Google Contacts — idempotente, no duplica.
        </p>
      </div>

      <ol className="space-y-4">
        <Paso n={1} titulo="Exportá la lista maestra">
          Botón "Correr pipeline" (o <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">Data/Salida/lista-maestra.xlsx</code>{" "}
          ya está generado si ves contactos en la tabla).
        </Paso>
        <Paso n={2} titulo="Subila a un Google Sheet">
          <a
            href="https://sheets.google.com/create"
            target="_blank"
            rel="noopener"
            className="font-medium text-accent underline underline-offset-2"
          >
            Crear un Sheet nuevo →
          </a>{" "}
          Archivo → Importar → Subir → <em>Reemplazar hoja actual</em>. Compartilo con la otra cuenta (Editor).
        </Paso>
        <Paso n={3} titulo="Pegá el script (una vez por cuenta)">
          Desde ese Sheet: Extensiones →{" "}
          <a
            href="https://script.google.com"
            target="_blank"
            rel="noopener"
            className="font-medium text-accent underline underline-offset-2"
          >
            Apps Script →
          </a>{" "}
          pegá <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">google-apps-script/Sync.gs</code>. Servicios → agregá "People
          API". Corré <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">sincronizarContactos</code> una vez — ahí te pide login
          de Google, el único paso que es tuyo.
        </Paso>
        <Paso n={4} titulo="(Opcional) Disparador automático">
          Ícono de reloj en Apps Script → Añadir disparador → diario. Se sincroniza solo desde ahí en adelante.
        </Paso>
      </ol>

      <p className="rounded-lg border border-marca-amarillo/40 bg-marca-amarillo/10 px-3 py-2 text-xs text-neutral-700">
        Probá primero contra un Sheet de prueba con 2-3 contactos ficticios antes de correrlo contra la lista real —
        instrucciones completas en <code className="rounded bg-white px-1 py-0.5">google-apps-script/README.md</code>.
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
