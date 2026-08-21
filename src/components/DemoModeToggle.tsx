import { Sparkles } from "lucide-react";
import { useDemoMode, setDemoMode } from "@/lib/demoMode";

/**
 * Toggle de modo demostración (Fase 7 de MejoraSuite) — mismo estilo de
 * pill que "Simple/Avanzado" en el header de Index.tsx, para no meter un
 * componente Switch nuevo (este repo no tenía uno) ni un estilo distinto.
 */
export function DemoModeToggle() {
  const demoMode = useDemoMode();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={demoMode}
      onClick={() => setDemoMode(!demoMode)}
      className={`h-7 px-2 rounded-full flex items-center gap-1 text-[10px] font-medium transition-all ${
        demoMode
          ? "text-accent bg-primary-foreground/10 hover:bg-primary-foreground/20"
          : "text-primary-foreground/50 hover:text-primary-foreground hover:bg-primary-foreground/10"
      }`}
      title={demoMode ? "Modo demostración activo — apagar para usar tus datos reales" : "Prender modo demostración"}
      aria-label={demoMode ? "Apagar modo demostración" : "Prender modo demostración"}
    >
      <Sparkles className="h-3 w-3" />
      <span className="hidden sm:inline">Demo</span>
    </button>
  );
}
