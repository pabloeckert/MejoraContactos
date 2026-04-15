import { useState, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, Edit, Trash2, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { UnifiedContact } from "@/types/contact";

interface ContactsTableProps {
  contacts: UnifiedContact[];
  onUpdateContact: (contact: UnifiedContact) => void;
  onDeleteContact: (id: string) => void;
}

export function ContactsTable({ contacts, onUpdateContact, onDeleteContact }: ContactsTableProps) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("unique");
  const [editContact, setEditContact] = useState<UnifiedContact | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    let result = contacts;
    if (filterType === "unique") result = result.filter((c) => !c.isDuplicate);
    else if (filterType === "dupes") result = result.filter((c) => c.isDuplicate);
    else if (filterType === "ai") result = result.filter((c) => c.aiCleaned);
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

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar contactos..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px] h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos ({contacts.length})</SelectItem>
            <SelectItem value="unique">Únicos ({contacts.filter((c) => !c.isDuplicate).length})</SelectItem>
            <SelectItem value="dupes">Duplicados ({contacts.filter((c) => c.isDuplicate).length})</SelectItem>
            <SelectItem value="ai">IA Limpiados ({contacts.filter((c) => c.aiCleaned).length})</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{filtered.length.toLocaleString()} contactos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_60px] gap-2 px-4 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/30">
            <span>Nombre</span>
            <span>Apellido</span>
            <span>WhatsApp</span>
            <span>Empresa</span>
            <span>Cargo</span>
            <span>Email</span>
            <span></span>
          </div>
          <div ref={parentRef} className="h-[400px] overflow-auto">
            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
              {virtualizer.getVirtualItems().map((vItem) => {
                const c = filtered[vItem.index];
                return (
                  <div
                    key={c.id}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: `${vItem.size}px`, transform: `translateY(${vItem.start}px)` }}
                    className={`grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_60px] gap-2 px-4 items-center text-xs border-b border-border/50 hover:bg-muted/40 ${c.isDuplicate ? "opacity-50" : ""}`}
                  >
                    <span className="truncate font-medium flex items-center gap-1">
                      {c.firstName}
                      {c.aiCleaned && <Sparkles className="h-3 w-3 text-blue-500 shrink-0" />}
                    </span>
                    <span className="truncate">{c.lastName}</span>
                    <span className="truncate font-mono text-[11px]">{c.whatsapp}</span>
                    <span className="truncate">{c.company}</span>
                    <span className="truncate">{c.jobTitle}</span>
                    <span className="truncate">{c.email}</span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditContact(c)}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => onDeleteContact(c.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
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
}

function EditForm({ contact, onSave }: { contact: UnifiedContact; onSave: (c: UnifiedContact) => void }) {
  const [form, setForm] = useState(contact);
  const fields: Array<{ key: keyof UnifiedContact; label: string }> = [
    { key: "firstName", label: "Nombre" },
    { key: "lastName", label: "Apellido" },
    { key: "whatsapp", label: "WhatsApp" },
    { key: "company", label: "Empresa" },
    { key: "jobTitle", label: "Cargo" },
    { key: "email", label: "Email" },
  ];
  return (
    <div className="space-y-3">
      {fields.map(({ key, label }) => (
        <div key={key}>
          <Label className="text-xs">{label}</Label>
          <Input value={String(form[key] || "")} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="h-8 text-sm" />
        </div>
      ))}
      <Button onClick={() => onSave(form)} className="w-full">Guardar</Button>
    </div>
  );
}
