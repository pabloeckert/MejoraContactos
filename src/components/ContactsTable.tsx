import { useState, useMemo, useRef, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, Edit, Trash2, Sparkles, Phone, Mail, Shield } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { validateContactFields, getScoreColor, getFieldIcon } from "@/lib/field-validator";
import { validatePhone, getPhoneBadge } from "@/lib/phone-validator";
import type { UnifiedContact, FieldValidation } from "@/types/contact";

interface ContactsTableProps {
  contacts: UnifiedContact[];
  onUpdateContact: (contact: UnifiedContact) => void;
  onDeleteContact: (id: string) => void;
}

export const ContactsTable = memo(function ContactsTable({ contacts, onUpdateContact, onDeleteContact }: ContactsTableProps) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("unique");
  const [editContact, setEditContact] = useState<UnifiedContact | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    let result = contacts;
    if (filterType === "unique") result = result.filter((c) => !c.isDuplicate);
    else if (filterType === "dupes") result = result.filter((c) => c.isDuplicate);
    else if (filterType === "ai") result = result.filter((c) => c.aiCleaned);
    else if (filterType === "review") result = result.filter((c) => {
      const v = validateContactFields(c);
      return v.needsReview;
    });
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((c) =>
        `${c.firstName} ${c.lastName} ${c.email} ${c.whatsapp} ${c.company} ${c.jobTitle}`.toLowerCase().includes(q)
      );
    }
    return result;
  }, [contacts, search, filterType]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 20,
  });

  const reviewCount = contacts.filter(c => {
    const v = validateContactFields(c);
    return v.needsReview && !c.isDuplicate;
  }).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar contactos..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" aria-label="Buscar contactos" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[180px] h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos ({contacts.length})</SelectItem>
            <SelectItem value="unique">Únicos ({contacts.filter((c) => !c.isDuplicate).length})</SelectItem>
            <SelectItem value="dupes">Duplicados ({contacts.filter((c) => c.isDuplicate).length})</SelectItem>
            <SelectItem value="ai">IA Limpiados ({contacts.filter((c) => c.aiCleaned).length})</SelectItem>
            {reviewCount > 0 && <SelectItem value="review">⚠️ Revisar ({reviewCount})</SelectItem>}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <span>{filtered.length.toLocaleString()} contactos</span>
            {reviewCount > 0 && (
              <Badge variant="outline" className="text-[10px] text-yellow-600 border-yellow-300">
                {reviewCount} requieren revisión
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <TooltipProvider>
            <div role="grid" aria-label="Tabla de contactos" className="grid grid-cols-[40px_1fr_1fr_1fr_1fr_1fr_1fr_52px] gap-1 px-3 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/30">
              <span className="text-center" role="columnheader">Score</span>
              <span role="columnheader">Nombre</span>
              <span role="columnheader">Apellido</span>
              <span role="columnheader">WhatsApp</span>
              <span role="columnheader">Empresa</span>
              <span role="columnheader">Cargo</span>
              <span role="columnheader">Email</span>
              <span role="columnheader"><span className="sr-only">Acciones</span></span>
            </div>
            <div ref={parentRef} className="overflow-auto" style={{ height: 'calc(100vh - 340px)', minHeight: '300px' }} role="rowgroup" aria-label="Lista de contactos virtualizada" tabIndex={0}>
              <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
                {virtualizer.getVirtualItems().map((vItem) => {
                  const c = filtered[vItem.index];
                  const validation = validateContactFields(c);
                  const scoreStyle = getScoreColor(validation.overallScore);

                  return (
                    <div
                      key={c.id}
                      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: `${vItem.size}px`, transform: `translateY(${vItem.start}px)` }}
                      className={`grid grid-cols-[40px_1fr_1fr_1fr_1fr_1fr_1fr_52px] gap-1 px-3 items-center text-xs border-b border-border/50 hover:bg-muted/40 ${c.isDuplicate ? "opacity-50" : ""}`}
                    >
                      {/* Score badge */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex justify-center">
                            <span className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold ${scoreStyle.bg} ${scoreStyle.text}`}>
                              {validation.overallScore}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="text-xs max-w-[200px]">
                          <p className="font-medium mb-1">Calidad: {scoreStyle.label}</p>
                          {validation.validations.filter(v => !v.isValid || v.score < 60).map(v => (
                            <p key={v.field} className="text-[10px]">{getFieldIcon(v)} {v.field}: {v.reason}</p>
                          ))}
                        </TooltipContent>
                      </Tooltip>

                      {/* Name with field-level indicators */}
                      <span className="truncate font-medium flex items-center gap-1">
                        <FieldIcon validation={validation.validations[0]} />
                        {c.firstName}
                        {c.aiCleaned && <Sparkles className="h-3 w-3 text-blue-500 shrink-0" />}
                      </span>
                      <span className="truncate flex items-center gap-1">
                        <FieldIcon validation={validation.validations[1]} />
                        {c.lastName}
                      </span>

                      {/* Phone with WhatsApp indicator */}
                      <span className="truncate font-mono text-[11px] flex items-center gap-1">
                        {c.whatsapp && (() => {
                          const phoneVal = validatePhone(c.whatsapp, 'AR');
                          const badge = getPhoneBadge(phoneVal);
                          return (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">{badge.icon}</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{badge.label}</p>
                                {phoneVal.e164 && <p className="text-[10px]">{phoneVal.e164}</p>}
                              </TooltipContent>
                            </Tooltip>
                          );
                        })()}
                        {c.whatsapp}
                      </span>

                      <span className="truncate flex items-center gap-1">
                        <FieldIcon validation={validation.validations[4]} />
                        {c.company}
                      </span>
                      <span className="truncate flex items-center gap-1">
                        <FieldIcon validation={validation.validations[5]} />
                        {c.jobTitle}
                      </span>
                      <span className="truncate flex items-center gap-1">
                        {c.email && <FieldIcon validation={validation.validations[3]} />}
                        {c.email}
                      </span>

                      <div className="flex gap-0.5">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditContact(c)} aria-label={`Editar ${c.firstName} ${c.lastName}`}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => onDeleteContact(c.id)} aria-label={`Eliminar ${c.firstName} ${c.lastName}`}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </TooltipProvider>
        </CardContent>
      </Card>

      <Dialog open={!!editContact} onOpenChange={() => setEditContact(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar contacto</DialogTitle>
          </DialogHeader>
          {editContact && <EditForm contact={editContact} onSave={(c) => { onUpdateContact(c); setEditContact(null); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
});

function FieldIcon({ validation }: { validation: FieldValidation }) {
  if (!validation) return null;
  const icon = getFieldIcon(validation);
  if (icon === '✅') return null; // Don't show check marks for valid fields (clean UI)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help text-[10px] shrink-0">{icon}</span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-[10px]">{validation.reason || (validation.isValid ? 'Válido' : 'Inválido')}</p>
        {validation.correctedValue && <p className="text-[10px] text-blue-400">Sugerencia: {validation.correctedValue}</p>}
      </TooltipContent>
    </Tooltip>
  );
}

function EditForm({ contact, onSave }: { contact: UnifiedContact; onSave: (c: UnifiedContact) => void }) {
  const [form, setForm] = useState(contact);
  const validation = validateContactFields(form);

  const fields: Array<{ key: keyof UnifiedContact; label: string; index: number }> = [
    { key: "firstName", label: "Nombre", index: 0 },
    { key: "lastName", label: "Apellido", index: 1 },
    { key: "whatsapp", label: "WhatsApp", index: 2 },
    { key: "email", label: "Email", index: 3 },
    { key: "company", label: "Empresa", index: 4 },
    { key: "jobTitle", label: "Cargo", index: 5 },
  ];

  return (
    <div className="space-y-3">
      {/* Score */}
      <div className="flex items-center gap-2 pb-2 border-b">
        <Shield className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Score de calidad:</span>
        <span className={`text-lg font-bold ${getScoreColor(validation.overallScore).text}`}>
          {validation.overallScore}/100
        </span>
        <Badge className={getScoreColor(validation.overallScore).bg + ' ' + getScoreColor(validation.overallScore).text}>
          {getScoreColor(validation.overallScore).label}
        </Badge>
      </div>

      {fields.map(({ key, label, index }) => {
        const fieldVal = validation.validations[index];
        return (
          <div key={key}>
            <div className="flex items-center justify-between">
              <Label className="text-xs">{label}</Label>
              {fieldVal && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  {getFieldIcon(fieldVal)} {fieldVal.reason || ''}
                </span>
              )}
            </div>
            <Input
              value={String(form[key] || "")}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className={`h-8 text-sm ${fieldVal && !fieldVal.isValid ? 'border-red-300 focus-visible:ring-red-200' : ''}`}
            />
            {fieldVal?.correctedValue && (
              <button
                className="text-[10px] text-blue-500 hover:underline mt-0.5"
                onClick={() => setForm({ ...form, [key]: fieldVal.correctedValue })}
              >
                → Aplicar sugerencia: {fieldVal.correctedValue}
              </button>
            )}
          </div>
        );
      })}
      <Button onClick={() => onSave(form)} className="w-full">Guardar</Button>
    </div>
  );
}
