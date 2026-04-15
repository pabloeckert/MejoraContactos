import { useState, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, Filter, Edit, Trash2 } from "lucide-react";
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
  const [filterDupes, setFilterDupes] = useState<string>("all");
  const [editContact, setEditContact] = useState<UnifiedContact | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    let result = contacts;

    if (filterDupes === "unique") result = result.filter((c) => !c.isDuplicate);
    else if (filterDupes === "dupes") result = result.filter((c) => c.isDuplicate);

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.firstName.toLowerCase().includes(q) ||
          c.lastName.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          c.company.toLowerCase().includes(q)
      );
    }

    return result;
  }, [contacts, search, filterDupes]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 20,
  });

  const confidenceBadge = (score: number) => {
    if (score >= 90) return <Badge className="bg-green-500/20 text-green-400 text-[10px]">{score}%</Badge>;
    if (score >= 70) return <Badge className="bg-yellow-500/20 text-yellow-400 text-[10px]">{score}%</Badge>;
    return <Badge className="bg-red-500/20 text-red-400 text-[10px]">{score}%</Badge>;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar contactos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={filterDupes} onValueChange={setFilterDupes}>
            <SelectTrigger className="w-[140px] h-9 text-xs">
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos ({contacts.length})</SelectItem>
              <SelectItem value="unique">Únicos ({contacts.filter((c) => !c.isDuplicate).length})</SelectItem>
              <SelectItem value="dupes">Duplicados ({contacts.filter((c) => c.isDuplicate).length})</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {filtered.length.toLocaleString()} contactos
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Header */}
          <div className="grid grid-cols-[1fr_1fr_1fr_80px_60px] gap-2 px-4 py-2 text-xs font-medium text-muted-foreground border-b">
            <span>Nombre</span>
            <span>Email / Teléfono</span>
            <span>Empresa</span>
            <span>Score</span>
            <span></span>
          </div>

          {/* Virtual list */}
          <div ref={parentRef} className="h-[400px] overflow-auto">
            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
              {virtualizer.getVirtualItems().map((vItem) => {
                const c = filtered[vItem.index];
                return (
                  <div
                    key={c.id}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${vItem.size}px`,
                      transform: `translateY(${vItem.start}px)`,
                    }}
                    className={`grid grid-cols-[1fr_1fr_1fr_80px_60px] gap-2 px-4 items-center text-sm border-b border-border/50 hover:bg-secondary/30 ${
                      c.isDuplicate ? "opacity-60" : ""
                    }`}
                  >
                    <div className="truncate">
                      <span className="font-medium">{c.firstName} {c.lastName}</span>
                      {c.isDuplicate && (
                        <Badge variant="outline" className="ml-1 text-[9px] text-yellow-400">DUP</Badge>
                      )}
                    </div>
                    <div className="truncate text-xs">
                      <div className="truncate">{c.email}</div>
                      <div className="text-muted-foreground truncate">
                        {c.phoneFormatted || c.phone}
                        {c.phone && !c.phoneValid && (
                          <span className="text-red-400 ml-1">⚠</span>
                        )}
                      </div>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{c.company}</div>
                    <div>{confidenceBadge(c.confidence)}</div>
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

      {/* Edit Dialog */}
      <Dialog open={!!editContact} onOpenChange={() => setEditContact(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar contacto</DialogTitle>
          </DialogHeader>
          {editContact && (
            <EditForm
              contact={editContact}
              onSave={(c) => {
                onUpdateContact(c);
                setEditContact(null);
              }}
            />
          )}
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
    { key: "email", label: "Email" },
    { key: "phone", label: "Teléfono" },
    { key: "phone2", label: "Teléfono 2" },
    { key: "company", label: "Empresa" },
    { key: "jobTitle", label: "Cargo" },
    { key: "address", label: "Dirección" },
    { key: "city", label: "Ciudad" },
    { key: "country", label: "País" },
    { key: "notes", label: "Notas" },
  ];

  return (
    <div className="space-y-3">
      {fields.map(({ key, label }) => (
        <div key={key}>
          <Label className="text-xs">{label}</Label>
          <Input
            value={String(form[key] || "")}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
      ))}
      <Button onClick={() => onSave(form)} className="w-full">Guardar</Button>
    </div>
  );
}
