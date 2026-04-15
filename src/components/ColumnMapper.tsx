import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ColumnMapping, ContactField } from "@/types/contact";
import { CONTACT_FIELDS } from "@/types/contact";
import { ArrowRight } from "lucide-react";

interface ColumnMapperProps {
  mappings: ColumnMapping[];
  sampleData: Record<string, string>[];
  onMappingChange: (index: number, target: ContactField) => void;
}

export function ColumnMapper({ mappings, sampleData, onMappingChange }: ColumnMapperProps) {
  if (mappings.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          Mapeo de columnas
          <Badge variant="secondary" className="text-xs">
            {mappings.filter((m) => m.target !== "ignore").length} mapeadas
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
          {mappings.map((mapping, i) => {
            const sample = sampleData[0]?.[mapping.source] || "";
            return (
              <div
                key={mapping.source}
                className="flex items-center gap-2 rounded-md bg-secondary/30 px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{mapping.source}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    ej: {sample || "—"}
                  </p>
                </div>
                <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                <Select
                  value={mapping.target}
                  onValueChange={(v) => onMappingChange(i, v as ContactField)}
                >
                  <SelectTrigger className="w-[160px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTACT_FIELDS.map((f) => (
                      <SelectItem key={f.value} value={f.value} className="text-xs">
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
