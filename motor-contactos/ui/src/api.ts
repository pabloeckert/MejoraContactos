import type { Anomalia, Contacto, GrupoPendiente, Stats } from "./types";

// El backend Python (motor/api.py) corre en :5000 por default
// (config.yaml -> revisor.puerto). Se puede pisar en dev con
// VITE_API_URL si algún día corre en otro puerto.
const BASE_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:5000";

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  const respuesta = await fetch(`${BASE_URL}${ruta}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => ({}));
    throw new Error(cuerpo.error ?? `${respuesta.status} ${respuesta.statusText}`);
  }
  return respuesta.json() as Promise<T>;
}

export function obtenerStats(): Promise<Stats> {
  return pedir<Stats>("/api/stats");
}

export function listarContactos(
  pagina: number,
  tamano: number,
  q?: string,
): Promise<{ total: number; contactos: Contacto[] }> {
  const parametros = new URLSearchParams({ pagina: String(pagina), tamano: String(tamano) });
  if (q) parametros.set("q", q);
  return pedir(`/api/contactos?${parametros}`);
}

export function editarContacto(clusterId: string, campos: Record<string, string>): Promise<Contacto> {
  return pedir<Contacto>(`/api/contactos/${encodeURIComponent(clusterId)}`, {
    method: "POST",
    body: JSON.stringify(campos),
  });
}

export function obtenerRevision(): Promise<{ total: number; grupos: GrupoPendiente[] }> {
  return pedir("/api/revisar");
}

export function decidir(patron: string, aceptar: boolean): Promise<{ ok: boolean; actualizados: number }> {
  return pedir("/api/decidir", {
    method: "POST",
    body: JSON.stringify({ patron, aceptar }),
  });
}

export function correrAccion(nombre: string): Promise<{ ok: boolean; mensaje?: string; error?: string }> {
  return pedir(`/api/accion/${nombre}`, { method: "POST" });
}

export function obtenerCuentasGoogle(): Promise<{ cuentas: string[] }> {
  return pedir("/api/cuentas-google");
}

export function obtenerAnomalias(): Promise<{ anomalias: Anomalia[] }> {
  return pedir("/api/anomalias");
}
