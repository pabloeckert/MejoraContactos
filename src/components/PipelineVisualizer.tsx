import { CheckCircle2, XCircle, Clock, Loader2, Shield, Play, Wrench } from "lucide-react";
import type { PipelineStage, PipelineState } from "@/hooks/useContactProcessing";

interface PipelineVisualizerProps {
  pipelineState: PipelineState;
}

export function PipelineVisualizer({ pipelineState }: PipelineVisualizerProps) {
  return (
    <div className="rounded-lg border bg-card/50 p-3" role="region" aria-label="Pipeline de procesamiento">
      <p className="text-xs font-medium text-muted-foreground mb-3">Pipeline local de procesamiento</p>
      <div className="flex items-center gap-1.5 flex-wrap" role="list" aria-label="Etapas del pipeline">
        <PipelineStep icon={<Play className="h-3 w-3" />} label="Mapeo" sublabel="Columnas" state={pipelineState.mapping} />
        <Connector active={pipelineState.mapping === "done"} />
        <PipelineStep icon={<Wrench className="h-3 w-3" />} label="Reglas" sublabel="Limpieza" state={pipelineState.rules} />
        <Connector active={pipelineState.rules === "done"} />
        <PipelineStep icon={<Shield className="h-3 w-3" />} label="Validar" sublabel="E.164 / Email" state={pipelineState.validation} />
        <Connector active={pipelineState.validation === "done"} />
        <PipelineStep icon={<CheckCircle2 className="h-3 w-3" />} label="Dedup" sublabel="Unificación" state={pipelineState.dedup} ariaLabel="Deduplicación" />
      </div>
    </div>
  );
}

function PipelineStep({
  label,
  sublabel,
  state,
  ariaLabel,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  state: PipelineStage;
  ariaLabel?: string;
}) {
  const stateStyles: Record<PipelineStage, string> = {
    idle: "border-muted bg-muted/30 text-muted-foreground",
    active: "border-primary bg-primary/10 text-primary ring-2 ring-primary/30 animate-pulse",
    done: "border-green-500 bg-green-500/10 text-green-500",
    error: "border-red-500 bg-red-500/10 text-red-500",
  };
  const stateLabel: Record<PipelineStage, string> = {
    idle: "pendiente",
    active: "en progreso",
    done: "completado",
    error: "error",
  };
  const stateIcon =
    state === "done" ? (
      <CheckCircle2 className="h-3 w-3" />
    ) : state === "error" ? (
      <XCircle className="h-3 w-3" />
    ) : state === "active" ? (
      <Loader2 className="h-3 w-3 animate-spin" />
    ) : (
      <Clock className="h-3 w-3" />
    );
  return (
    <div
      role="listitem"
      aria-label={`${ariaLabel || label}: ${stateLabel[state]}`}
      className={`flex flex-col items-center gap-1 px-2.5 py-1.5 rounded-lg border transition-all duration-300 min-w-[68px] ${stateStyles[state]}`}
    >
      <div className="flex items-center gap-1">{stateIcon}</div>
      <span className="text-[10px] font-medium leading-none">{label}</span>
      {sublabel && <span className="text-[9px] opacity-70 leading-none">{sublabel}</span>}
    </div>
  );
}

function Connector({ active }: { active: boolean }) {
  return <div className={`h-0.5 w-4 shrink-0 rounded-full transition-colors duration-500 ${active ? "bg-green-500" : "bg-muted"}`} />;
}
