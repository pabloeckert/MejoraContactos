import { useCallback, useRef, useState } from "react";
import { Upload, FolderOpen, FileSpreadsheet, FileText, File, X } from "lucide-react";
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
  CSV: <FileText className="h-4 w-4 text-success" />,
  Excel: <FileSpreadsheet className="h-4 w-4 text-secondary" />,
  VCF: <File className="h-4 w-4 text-primary" />,
  JSON: <FileText className="h-4 w-4 text-accent-foreground" />,
};

const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".xls", ".vcf", ".json", ".txt"];

function filterValidFiles(fileList: FileList | File[]): File[] {
  return Array.from(fileList).filter((f) => {
    const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
    return ACCEPTED_EXTENSIONS.includes(ext) && f.size > 0;
  });
}

export function FileDropzone({ files, onFilesAdded, onRemoveFile }: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const validFiles = filterValidFiles(fileList);
      if (validFiles.length === 0) {
        toast.error("No se encontraron archivos válidos (CSV, Excel, VCF, JSON)");
        return;
      }
      setIsLoading(true);
      toast.info(`Procesando ${validFiles.length} archivo(s)...`);
      const parsed: ParsedFile[] = [];
      for (const file of validFiles) {
        try {
          const result = await parseFile(file);
          parsed.push(result);
          toast.success(`${file.name}: ${result.rows.length} filas cargadas`);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Error desconocido";
          toast.error(`Error en ${file.name}: ${message}`);
        }
      }
      if (parsed.length > 0) onFilesAdded(parsed);
      setIsLoading(false);
    },
    [onFilesAdded]
  );

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      // Handle folder drops via DataTransferItem webkitGetAsEntry
      const items = e.dataTransfer.items;
      if (items && items.length > 0) {
        const allFiles: File[] = [];

        const readEntry = (entry: FileSystemEntry): Promise<File[]> => {
          return new Promise((resolve) => {
            if (entry.isFile) {
              (entry as FileSystemFileEntry).file((f) => resolve([f]), () => resolve([]));
            } else if (entry.isDirectory) {
              const reader = (entry as FileSystemDirectoryEntry).createReader();
              const readAll = (entries: FileSystemEntry[], accumulated: File[]): Promise<File[]> => {
                return new Promise((res) => {
                  reader.readEntries(async (batch) => {
                    if (batch.length === 0) {
                      res(accumulated);
                    } else {
                      const nested = await Promise.all(batch.map(readEntry));
                      res(readAll([...entries, ...batch], [...accumulated, ...nested.flat()]));
                    }
                  }, () => res(accumulated));
                });
              };
              readAll([], []).then(resolve);
            } else {
              resolve([]);
            }
          });
        };

        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry?.();
          if (entry) {
            const found = await readEntry(entry);
            allFiles.push(...found);
          }
        }

        if (allFiles.length > 0) {
          handleFiles(allFiles);
          return;
        }
      }

      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleFolderSelect = () => {
    folderInputRef.current?.click();
  };

  const handleFolderInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
    // Reset so same folder can be selected again
    e.target.value = "";
  };

  const totalRows = files.reduce((sum, f) => sum + f.rows.length, 0);

  return (
    <div className="space-y-4">
      {/* Hidden folder input */}
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        // @ts-expect-error - webkitdirectory is non-standard but widely supported
        webkitdirectory=""
        directory=""
        multiple
        onChange={handleFolderInput}
      />

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 transition-all ${
          isDragging ? "border-primary bg-primary/5 shadow-lg" : "border-border hover:border-primary/50 hover:bg-muted/30"
        }`}
      >
        <div className={`h-14 w-14 rounded-full flex items-center justify-center mb-4 ${isDragging ? "bg-primary/10" : "bg-muted"}`}>
          <Upload className={`h-6 w-6 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
        </div>
        <p className="text-sm font-semibold text-foreground">
          {isLoading ? "Procesando archivos..." : "Arrastrá archivos o carpetas aquí"}
        </p>
        <p className="text-xs text-muted-foreground mt-1 mb-4">CSV, Excel, VCF, JSON — recorre subcarpetas automáticamente</p>

        <div className="flex gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              const input = document.createElement("input");
              input.type = "file"; input.multiple = true;
              input.accept = ".csv,.xlsx,.xls,.vcf,.json,.txt";
              input.onchange = (ev) => { const t = ev.target as HTMLInputElement; if (t.files) handleFiles(t.files); };
              input.click();
            }}
          >
            <Upload className="h-4 w-4 mr-1" />
            Archivos
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => { e.stopPropagation(); handleFolderSelect(); }}
          >
            <FolderOpen className="h-4 w-4 mr-1" />
            Carpeta
          </Button>
        </div>
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
              <div key={f.id} className="flex items-center justify-between rounded-lg border bg-card px-3 py-2.5 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  {typeIcons[f.type] || <File className="h-4 w-4" />}
                  <span className="truncate font-medium text-foreground">{f.name}</span>
                  <Badge variant="outline" className="text-xs shrink-0">{f.type}</Badge>
                  <span className="text-xs text-muted-foreground shrink-0">{f.rows.length} filas · {formatSize(f.size)}</span>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => onRemoveFile(f.id)}>
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
