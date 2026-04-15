import { useCallback, useState } from "react";
import { Upload, FileSpreadsheet, FileText, File, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { parseFile } from "@/lib/parsers";
import type { ParsedFile } from "@/types/contact";
import { toast } from "sonner";

interface FileDropzoneProps {
  files: ParsedFile[];
  onFilesAdded: (files: ParsedFile[]) => void;
  onRemoveFile: (id: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

const typeIcons: Record<string, React.ReactNode> = {
  CSV: <FileText className="h-4 w-4" />,
  Excel: <FileSpreadsheet className="h-4 w-4" />,
  VCF: <File className="h-4 w-4" />,
  JSON: <FileText className="h-4 w-4" />,
};

export function FileDropzone({ files, onFilesAdded, onRemoveFile }: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      setIsLoading(true);
      const parsed: ParsedFile[] = [];
      const items = Array.from(fileList);

      for (const file of items) {
        try {
          const result = await parseFile(file);
          parsed.push(result);
          toast.success(`${file.name}: ${result.rows.length} filas cargadas`);
        } catch (err: any) {
          toast.error(`Error en ${file.name}: ${err.message}`);
        }
      }

      if (parsed.length > 0) onFilesAdded(parsed);
      setIsLoading(false);
    },
    [onFilesAdded]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const totalRows = files.reduce((sum, f) => sum + f.rows.length, 0);

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50"
        }`}
        onClick={() => {
          const input = document.createElement("input");
          input.type = "file";
          input.multiple = true;
          input.accept = ".csv,.xlsx,.xls,.vcf,.json,.txt";
          input.onchange = (e) => {
            const target = e.target as HTMLInputElement;
            if (target.files) handleFiles(target.files);
          };
          input.click();
        }}
      >
        <Upload className={`h-10 w-10 mb-3 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
        <p className="text-sm font-medium">
          {isLoading ? "Procesando archivos..." : "Arrastrá archivos aquí o hacé clic"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">CSV, Excel, VCF, JSON</p>
      </div>

      {files.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>Archivos cargados ({files.length})</span>
              <Badge variant="secondary">{totalRows.toLocaleString()} filas totales</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {files.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {typeIcons[f.type] || <File className="h-4 w-4" />}
                  <span className="truncate font-medium">{f.name}</span>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {f.type}
                  </Badge>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {f.rows.length} filas · {formatSize(f.size)}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => onRemoveFile(f.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
