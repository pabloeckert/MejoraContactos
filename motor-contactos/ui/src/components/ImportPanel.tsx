import { useEffect, useState } from "react";

import { correrAccion, obtenerCuentasGoogle } from "../api";
import { IconDownload, IconFolder, IconSync } from "./icons";

type Origen = "google" | "carpeta" | "archivo";

// Tres formas de traer contactos nuevos: Google Contacts (por cuenta ya
// autorizada), una carpeta elegida a mano (recorre subcarpetas, cualquier
// formato con extractor disponible) o un único archivo puntual. Carpeta y
// archivo abren un diálogo NATIVO de Windows (no un <input type="file">
// del navegador) porque el backend corre en la misma máquina y necesita
// la ruta real en disco, no los bytes subidos -- ver file_dialogs.py.
export default function ImportPanel() {
  const [cuentasGoogle, setCuentasGoogle] = useState<string[]>([]);
  const [corriendo, setCorriendo] = useState<Origen | string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [esError, setEsError] = useState(false);

  useEffect(() => {
    obtenerCuentasGoogle()
      .then((r) => setCuentasGoogle(r.cuentas))
      .catch(() => setCuentasGoogle([]));
  }, []);

  async function ejecutar(clave: string, accion: string) {
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
        <h2 className="font-marca text-lg font-medium text-marca-azul">Importar contactos</h2>
        <p className="mt-1 text-sm text-neutral-500">Tres formas de traer contactos nuevos a la base.</p>
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

      {cuentasGoogle.length > 0 && (
        <Bloque icono={<IconSync className="h-4 w-4" />} titulo="Google Contacts" descripcion="Trae los contactos nuevos o modificados de una cuenta ya autorizada — sin tocar nada más si el login ya se hizo antes.">
          <div className="flex flex-wrap gap-2">
            {cuentasGoogle.map((cuenta) => {
              const clave = `google-${cuenta}`;
              return (
                <button
                  key={cuenta}
                  onClick={() => ejecutar(clave, `importar-google-${cuenta}`)}
                  disabled={corriendo === clave}
                  className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {corriendo === clave ? "Importando..." : `Importar de ${capitalizar(cuenta)}`}
                </button>
              );
            })}
          </div>
        </Bloque>
      )}

      <Bloque
        icono={<IconFolder className="h-4 w-4" />}
        titulo="Carpeta"
        descripcion="Abre el explorador de Windows para elegir una carpeta. Recorre también las subcarpetas y acepta cualquier formato con extractor disponible (CSV, Excel, VCF, JSON, TXT, HTML, DOCX, PDF, imágenes con texto vía OCR)."
      >
        <button
          onClick={() => ejecutar("carpeta", "importar-carpeta")}
          disabled={corriendo === "carpeta"}
          className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <IconFolder className="h-4 w-4" />
          {corriendo === "carpeta" ? "Elegí la carpeta en la ventana que se abrió..." : "Elegir carpeta e importar"}
        </button>
      </Bloque>

      <Bloque
        icono={<IconDownload className="h-4 w-4" />}
        titulo="Archivo"
        descripcion="Abre el explorador de Windows para elegir un único archivo, de cualquiera de esos mismos formatos."
      >
        <button
          onClick={() => ejecutar("archivo", "importar-archivo")}
          disabled={corriendo === "archivo"}
          className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <IconDownload className="h-4 w-4" />
          {corriendo === "archivo" ? "Elegí el archivo en la ventana que se abrió..." : "Elegir archivo e importar"}
        </button>
      </Bloque>
    </div>
  );
}

function Bloque({
  icono,
  titulo,
  descripcion,
  children,
}: {
  icono: React.ReactNode;
  titulo: string;
  descripcion: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-center gap-2 text-sm font-medium text-neutral-800">
        <span className="text-accent">{icono}</span>
        {titulo}
      </div>
      <p className="mb-3 text-xs leading-relaxed text-neutral-500">{descripcion}</p>
      {children}
    </div>
  );
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
