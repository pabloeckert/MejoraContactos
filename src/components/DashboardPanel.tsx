import { useMemo, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Sparkles, Copy, Mail, Phone, Shield, Building2, Briefcase, Globe } from "lucide-react";
import { validateContactFields } from "@/lib/field-validator";
import type { UnifiedContact } from "@/types/contact";

interface DashboardPanelProps {
  contacts: UnifiedContact[];
}

export const DashboardPanel = memo(function DashboardPanel({ contacts }: DashboardPanelProps) {
  const stats = useMemo(() => {
    const clean = contacts.filter((c) => !c.isDuplicate);
    const sources = new Map<string, number>();
    const companies = new Map<string, number>();
    const jobs = new Map<string, number>();
    const countries = new Map<string, number>();
    let withEmail = 0, withWhatsApp = 0, aiCleaned = 0;
    let totalScore = 0, excellent = 0, needsReview = 0;

    for (const c of clean) {
      sources.set(c.source, (sources.get(c.source) || 0) + 1);
      if (c.company) companies.set(c.company, (companies.get(c.company) || 0) + 1);
      if (c.jobTitle) jobs.set(c.jobTitle, (jobs.get(c.jobTitle) || 0) + 1);
      if (c.email) withEmail++;
      if (c.whatsapp) withWhatsApp++;
      if (c.aiCleaned) aiCleaned++;

      // Quality scores
      const validation = validateContactFields(c);
      totalScore += validation.overallScore;
      if (validation.overallScore >= 90) excellent++;
      if (validation.needsReview) needsReview++;

      // Country from phone
      if (c.phoneCountry) countries.set(c.phoneCountry, (countries.get(c.phoneCountry) || 0) + 1);
    }

    const avgScore = clean.length > 0 ? Math.round(totalScore / clean.length) : 0;

    return {
      total: contacts.length,
      unique: clean.length,
      dupes: contacts.length - clean.length,
      withEmail,
      withWhatsApp,
      aiCleaned,
      avgScore,
      excellent,
      needsReview,
      sources: [...sources.entries()].sort((a, b) => b[1] - a[1]),
      topCompanies: [...companies.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
      topJobs: [...jobs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
      countries: [...countries.entries()].sort((a, b) => b[1] - a[1]),
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

  const scoreColor = stats.avgScore >= 90 ? 'text-green-600' : stats.avgScore >= 60 ? 'text-yellow-600' : 'text-red-500';

  return (
    <div className="space-y-4">
      {/* Main stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <SummaryCard icon={<Users className="h-4 w-4" />} label="Únicos" value={stats.unique} color="text-green-600" />
        <SummaryCard icon={<Copy className="h-4 w-4" />} label="Duplicados" value={stats.dupes} color="text-red-500" />
        <SummaryCard icon={<Mail className="h-4 w-4" />} label="Con Email" value={stats.withEmail} color="text-blue-500" />
        <SummaryCard icon={<Phone className="h-4 w-4" />} label="Con WhatsApp" value={stats.withWhatsApp} color="text-emerald-500" />
        <SummaryCard icon={<Sparkles className="h-4 w-4" />} label="IA Limpiados" value={stats.aiCleaned} color="text-purple-500" />
        <SummaryCard icon={<Shield className="h-4 w-4" />} label="Score Promedio" value={stats.avgScore} suffix="/100" color={scoreColor} />
      </div>

      {/* Quality breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-green-600">{stats.excellent}</div>
            <div className="text-[10px] text-muted-foreground mt-1">🟢 Excelentes (90+)</div>
            <div className="h-2 rounded-full bg-muted mt-2 overflow-hidden">
              <div className="h-full bg-green-500 rounded-full" style={{ width: `${(stats.excellent / Math.max(stats.unique, 1)) * 100}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-yellow-600">
              {stats.unique - stats.excellent - stats.needsReview}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">🟡 Con observaciones</div>
            <div className="h-2 rounded-full bg-muted mt-2 overflow-hidden">
              <div className="h-full bg-yellow-500 rounded-full"
                style={{ width: `${((stats.unique - stats.excellent - stats.needsReview) / Math.max(stats.unique, 1)) * 100}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-red-500">{stats.needsReview}</div>
            <div className="text-[10px] text-muted-foreground mt-1">🔴 Requieren revisión</div>
            <div className="h-2 rounded-full bg-muted mt-2 overflow-hidden">
              <div className="h-full bg-red-500 rounded-full" style={{ width: `${(stats.needsReview / Math.max(stats.unique, 1)) * 100}%` }} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* By source */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Globe className="h-4 w-4" /> Por fuente
            </CardTitle>
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

        {/* Top companies */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Top empresas
            </CardTitle>
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

        {/* Top jobs */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Briefcase className="h-4 w-4" /> Top cargos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.topJobs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin datos de cargo</p>
            ) : (
              stats.topJobs.map(([job, count]) => (
                <div key={job} className="flex justify-between items-center text-xs">
                  <span className="truncate">{job}</span>
                  <Badge variant="secondary" className="text-[10px]">{count}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Countries */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Phone className="h-4 w-4" /> Por país (teléfonos)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.countries.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin datos de país</p>
            ) : (
              stats.countries.slice(0, 5).map(([country, count]) => (
                <div key={country} className="flex justify-between items-center text-xs">
                  <span className="truncate">{country}</span>
                  <Badge variant="secondary" className="text-[10px]">{count}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
});

function SummaryCard({ icon, label, value, suffix, color }: { icon: React.ReactNode; label: string; value: number; suffix?: string; color: string }) {
  return (
    <Card>
      <CardContent className="p-3 text-center">
        <div className={`flex justify-center mb-1 ${color}`}>{icon}</div>
        <p className={`text-xl font-bold ${color}`}>{value.toLocaleString()}{suffix || ''}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
