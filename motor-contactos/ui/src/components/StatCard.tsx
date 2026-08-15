import type { ReactNode } from "react";

interface Props {
  etiqueta: string;
  valor: number | string;
  icono: ReactNode;
  tono?: "neutral" | "accent" | "warn";
}

const TONOS: Record<NonNullable<Props["tono"]>, string> = {
  neutral: "text-neutral-500",
  accent: "text-accent",
  warn: "text-marca-rojo",
};

// Barra compacta en vez de tarjeta grande (2026-08-14, revisión UX): antes
// 4 tarjetas de ~90px de alto se comían espacio vertical que la tabla
// densa necesita más. Todo en una fila, ícono+número+etiqueta inline.
export default function StatCard({ etiqueta, valor, icono, tono = "neutral" }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className={TONOS[tono]}>{icono}</span>
      <span className="text-lg font-semibold leading-none text-neutral-900">
        {typeof valor === "number" ? valor.toLocaleString("es-AR") : valor}
      </span>
      <span className="text-[11px] font-medium uppercase leading-none tracking-wide text-neutral-500">{etiqueta}</span>
    </div>
  );
}
