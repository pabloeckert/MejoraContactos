/**
 * FunnelPanel — Visual funnel: visit → import → map → process → export.
 * Shows conversion rates between steps.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { analytics } from "@/lib/analytics";
import { TrendingDown, Eye, Upload, Columns3, Zap, Download } from "lucide-react";
import { useState, useEffect } from "react";

const STEP_META: Record<string, { label: string; icon: React.ReactNode }> = {
  page_view: { label: "Visita", icon: <Eye className="h-3.5 w-3.5" /> },
  file_imported: { label: "Importa", icon: <Upload className="h-3.5 w-3.5" /> },
  columns_mapped: { label: "Mapea", icon: <Columns3 className="h-3.5 w-3.5" /> },
  processing_started: { label: "Procesa", icon: <Zap className="h-3.5 w-3.5" /> },
  processing_completed: { label: "Completa", icon: <Zap className="h-3.5 w-3.5 text-green-500" /> },
  export_completed: { label: "Exporta", icon: <Download className="h-3.5 w-3.5" /> },
};

export function FunnelPanel() {
  const [funnel, setFunnel] = useState<{ step: string; count: number }[]>([]);

  useEffect(() => {
    setFunnel(analytics.getFunnelStats());
  }, []);

  const maxCount = Math.max(...funnel.map((f) => f.count), 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingDown className="h-4 w-4" />
          Funnel de conversión
        </CardTitle>
      </CardHeader>
      <CardContent>
        {funnel.every((f) => f.count === 0) ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Sin datos todavía. Los eventos se registran automáticamente.
          </p>
        ) : (
          <div className="space-y-2">
            {funnel.map((f, i) => {
              const meta = STEP_META[f.step] || { label: f.step, icon: null };
              const pct = maxCount > 0 ? (f.count / maxCount) * 100 : 0;
              const convRate = i > 0 && funnel[i - 1].count > 0
                ? Math.round((f.count / funnel[i - 1].count) * 100)
                : null;

              return (
                <div key={f.step} className="flex items-center gap-2">
                  <div className="w-20 shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {meta.icon}
                    <span>{meta.label}</span>
                  </div>
                  <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/70 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 text-xs text-right font-mono">{f.count}</span>
                  {convRate !== null && (
                    <span className={`w-10 text-[10px] text-right font-mono ${convRate < 30 ? "text-destructive" : convRate < 60 ? "text-amber-500" : "text-green-500"}`}>
                      {convRate}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
