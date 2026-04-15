import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { UnifiedContact } from "@/types/contact";

interface DashboardPanelProps {
  contacts: UnifiedContact[];
}

export function DashboardPanel({ contacts }: DashboardPanelProps) {
  const stats = useMemo(() => {
    const clean = contacts.filter((c) => !c.isDuplicate);
    const countries = new Map<string, number>();
    const sources = new Map<string, number>();
    let totalConfidence = 0;
    let validPhones = 0;
    let withEmail = 0;

    for (const c of clean) {
      const country = c.countryCode || c.country || "N/A";
      countries.set(country, (countries.get(country) || 0) + 1);
      sources.set(c.source, (sources.get(c.source) || 0) + 1);
      totalConfidence += c.confidence;
      if (c.phoneValid) validPhones++;
      if (c.email) withEmail++;
    }

    const sortedCountries = [...countries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const sortedSources = [...sources.entries()].sort((a, b) => b[1] - a[1]);

    return {
      total: contacts.length,
      unique: clean.length,
      dupes: contacts.length - clean.length,
      avgConfidence: clean.length > 0 ? Math.round(totalConfidence / clean.length) : 0,
      validPhones,
      withEmail,
      countries: sortedCountries,
      sources: sortedSources,
      maxCountryCount: sortedCountries[0]?.[1] || 1,
    };
  }, [contacts]);

  if (contacts.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
        <p>Procesá contactos para ver el dashboard</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Total" value={stats.total} />
        <SummaryCard label="Únicos" value={stats.unique} color="text-green-400" />
        <SummaryCard label="Duplicados" value={stats.dupes} color="text-yellow-400" />
        <SummaryCard label="Score ⌀" value={`${stats.avgConfidence}%`} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Country distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Distribución por país</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.countries.map(([country, count]) => (
              <div key={country} className="flex items-center gap-2">
                <span className="text-xs w-8 font-mono">{country}</span>
                <div className="flex-1 h-5 bg-secondary rounded-sm overflow-hidden">
                  <div
                    className="h-full bg-primary/70 rounded-sm transition-all"
                    style={{ width: `${(count / stats.maxCountryCount) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-10 text-right">{count}</span>
              </div>
            ))}
            {stats.countries.length === 0 && (
              <p className="text-xs text-muted-foreground">Sin datos de país</p>
            )}
          </CardContent>
        </Card>

        {/* Sources */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Por fuente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.sources.map(([source, count]) => (
              <div key={source} className="flex items-center justify-between text-sm">
                <span className="truncate text-xs">{source}</span>
                <Badge variant="secondary">{count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Quality */}
        <Card className="sm:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Calidad de datos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <QualityMetric label="Teléfonos válidos" value={stats.validPhones} total={stats.unique} />
              <QualityMetric label="Con email" value={stats.withEmail} total={stats.unique} />
              <QualityMetric label="Score ≥ 80%" value={contacts.filter((c) => c.confidence >= 80 && !c.isDuplicate).length} total={stats.unique} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="rounded-lg bg-secondary/50 p-4 text-center">
      <p className={`text-2xl font-bold ${color || ""}`}>{typeof value === "number" ? value.toLocaleString() : value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function QualityMetric({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="text-center">
      <div className="relative h-2 bg-secondary rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all ${pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-lg font-bold">{pct}%</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-[10px] text-muted-foreground">{value}/{total}</p>
    </div>
  );
}
