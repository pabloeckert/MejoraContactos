import type { ReactNode } from "react";

interface Props {
  etiqueta: string;
  valor: number | string;
  icono: ReactNode;
  tono?: "neutral" | "accent" | "warn";
}

const TONOS: Record<NonNullable<Props["tono"]>, string> = {
  neutral: "bg-neutral-100 text-neutral-600",
  accent: "bg-accent/10 text-accent",
  warn: "bg-amber-100 text-amber-700",
};

export default function StatCard({ etiqueta, valor, icono, tono = "neutral" }: Props) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TONOS[tono]}`}>
        {icono}
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-semibold leading-tight text-neutral-900">
          {typeof valor === "number" ? valor.toLocaleString("es-AR") : valor}
        </div>
        <div className="truncate text-xs font-medium uppercase tracking-wide text-neutral-500">{etiqueta}</div>
      </div>
    </div>
  );
}
