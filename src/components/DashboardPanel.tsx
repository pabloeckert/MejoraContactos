import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Sparkles, Copy, Mail, Phone } from "lucide-react";
import type { UnifiedContact } from "@/types/contact";

interface DashboardPanelProps {
  contacts: UnifiedContact[];
}

export function DashboardPanel({ contacts }: DashboardPanelProps) {
  const stats = useMemo(() => {
    const clean = contacts.filter((c) => !c.isDuplicate);
    const sources = new Map<string, number>();
    const companies = new Map<string, number>();
    let withEmail = 0, withWhatsApp = 0, aiCleaned = 0;

    for (const c of clean) {
      sources.set(c.source, (sources.get(c.source) || 0) + 1);
      if (c.company) companies.set(c.company, (companies.get(c.company) || 0) + 1);
      if (c.email) withEmail++;
      if (c.whatsapp) withWhatsApp++;
      if (c.aiCleaned) aiCleaned++;
    }

    return {
      total: contacts.length,
      unique: clean.length,
      dupes: contacts.length - clean.length,
      withEmail,
      withWhatsApp,
      aiCleaned,
      sources: [...sources.entries()].sort((a, b) => b[1] - a[1]),
      topCompanies: [...companies.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
      maxSourceCount: Math.max(...[...sources.values()], 1),
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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <SummaryCard icon={<Users className="h-4 w-4" />} label="Únicos" value={stats.unique} color="text-green-600" />
        <SummaryCard icon={<Copy className="h-4 w-4" />} label="Duplicados" value={stats.dupes} color="text-red-500" />
        <SummaryCard icon={<Mail className="h-4 w-4" />} label="Con Email" value={stats.withEmail} color="text-blue-500" />
        <SummaryCard icon={<Phone className="h-4 w-4" />} label="Con WhatsApp" value={stats.withWhatsApp} color="text-emerald-500" />
        <SummaryCard icon={<Sparkles className="h-4 w-4" />} label="IA Limpiados" value={stats.aiCleaned} color="text-purple-500" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Por fuente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.sources.map(([source, count]) => (
              <div key={source} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="truncate">{source}</span>
                  <span className="font-medium">{count}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(count / stats.maxSourceCount) * 100}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top empresas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.topCompanies.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin datos de empresa</p>
            ) : (
              stats.topCompanies.map(([company, count]) => (
                <div key={company} className="flex justify-between items-center text-xs">
                  <span className="truncate">{company}</span>
                  <Badge variant="secondary" className="text-[10px]">{count}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <Card>
      <CardContent className="p-3 text-center">
        <div className={`flex justify-center mb-1 ${color}`}>{icon}</div>
        <p className={`text-xl font-bold ${color}`}>{value.toLocaleString()}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
