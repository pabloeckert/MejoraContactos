/**
 * UsageBanner — Shows free tier usage stats and a CTA to upgrade.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getUsageStats } from "@/lib/usage-limits";
import { Zap, Key, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";

export function UsageBanner() {
  const [stats, setStats] = useState(getUsageStats());

  // Re-read on mount and when localStorage changes
  useEffect(() => {
    const refresh = () => setStats(getUsageStats());
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  if (!stats.isFreeTier) return null;

  const isLow = stats.batchesRemaining <= 1;
  const isExhausted = stats.batchesRemaining <= 0;

  return (
    <div className={`rounded-lg border p-3 flex flex-col sm:flex-row items-start sm:items-center gap-3 text-sm ${isExhausted ? "border-destructive/50 bg-destructive/5" : isLow ? "border-amber-500/50 bg-amber-500/5" : "border-border bg-muted/30"}`}>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {isExhausted ? (
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
        ) : (
          <Zap className="h-4 w-4 text-amber-500 shrink-0" />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Plan Free:</span>
          <Badge variant="outline" className="text-xs font-mono">
            {stats.batchesUsed}/{stats.maxBatchesPerDay} lotes hoy
          </Badge>
          <Badge variant="outline" className="text-xs font-mono">
            máx. {stats.maxBatchSize.toLocaleString()} contactos/lote
          </Badge>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 gap-1.5 text-xs"
        onClick={() => {
          const el = document.getElementById("pricing-section");
          if (el) el.scrollIntoView({ behavior: "smooth" });
          else window.location.href = `${import.meta.env.BASE_URL}#pricing`;
        }}
      >
        <Key className="h-3 w-3" />
        Eliminar límites
      </Button>
    </div>
  );
}
