import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";

import { editarContacto } from "../api";
import type { Contacto } from "../types";

const CAMPOS_TEXTO: Array<[keyof Contacto, string]> = [
  ["nombre", "Nombre"],
  ["apellido", "Apellido"],
  ["cargo", "Cargo"],
  ["organizacion", "Empresa"],
  ["tag", "Tag"],
  ["domicilio", "Domicilio"],
  ["ciudad", "Ciudad"],
  ["provincia", "Provincia"],
  ["pais", "País"],
];

const CAMPOS_MULTILINEA: Array<[string, keyof Contacto, string]> = [
  ["whatsapp", "whatsapp", "WhatsApp (uno por línea)"],
  ["telefono_fijo", "telefono_fijo", "Teléfono fijo (uno por línea)"],
  ["email", "emails", "Email (uno por línea)"],
];

interface Props {
  contacto: Contacto;
  onClose: () => void;
  onGuardado: (actualizado: Contacto) => void;
}

export default function EditDialog({ contacto, onClose, onGuardado }: Props) {
  const [valores, setValores] = useState<Record<string, string>>(() => {
    const base: Record<string, string> = {};
    for (const [campo] of CAMPOS_TEXTO) base[campo] = String(contacto[campo] ?? "");
    for (const [campoForm, campoContacto] of CAMPOS_MULTILINEA) {
      base[campoForm] = (contacto[campoContacto] as string[]).join("\n");
    }
    base.notas = contacto.nota_referencia;
    return base;
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const actualizado = await editarContacto(contacto.cluster_id, valores);
      onGuardado(actualizado);
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(abierto) => !abierto && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 max-h-[85vh] w-[32rem] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold text-neutral-900">Editar contacto</Dialog.Title>
          <p className="mt-1 text-sm text-neutral-500">
            Los cambios pisan lo calculado por la limpieza automática solo para este contacto. Un campo vacío
            borra la corrección manual y vuelve a mostrar el valor calculado.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {CAMPOS_TEXTO.map(([campo, etiqueta]) => (
              <label key={campo} className="flex flex-col gap-1 text-sm text-neutral-700">
                {etiqueta}
                <input
                  value={valores[campo] ?? ""}
                  onChange={(e) => setValores((v) => ({ ...v, [campo]: e.target.value }))}
                  className="rounded-md border border-neutral-300 px-2 py-1 outline-none focus:border-accent"
                />
              </label>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-3">
            {CAMPOS_MULTILINEA.map(([campoForm, , etiqueta]) => (
              <label key={campoForm} className="flex flex-col gap-1 text-sm text-neutral-700">
                {etiqueta}
                <textarea
                  rows={3}
                  value={valores[campoForm] ?? ""}
                  onChange={(e) => setValores((v) => ({ ...v, [campoForm]: e.target.value }))}
                  className="rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-accent"
                />
              </label>
            ))}
          </div>

          <label className="mt-3 flex flex-col gap-1 text-sm text-neutral-700">
            Nota de referencia
            <textarea
              rows={2}
              value={valores.notas ?? ""}
              onChange={(e) => setValores((v) => ({ ...v, notas: e.target.value }))}
              className="rounded-md border border-neutral-300 px-2 py-1 outline-none focus:border-accent"
            />
          </label>

          {error && <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button className="rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100">
                Cancelar
              </button>
            </Dialog.Close>
            <button
              onClick={guardar}
              disabled={guardando}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
