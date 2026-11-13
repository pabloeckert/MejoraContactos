import { useState, useCallback } from "react";
import { Sparkles, Zap, ArrowRight, Settings2, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileDropzone } from "@/components/FileDropzone";
import { PreviewPanel } from "@/components/PreviewPanel";
import { ProcessingPanel } from "@/components/ProcessingPanel";
import { analytics } from "@/lib/analytics";
import type { ParsedFile, UnifiedContact } from "@/types/contact";

interface SimpleModeProps {
  onSwitchToAdvanced: () => void;
  onStartImport: () => void;
  files: ParsedFile[];
  onFilesAdded: (files: ParsedFile[]) => void;
  onRemoveFile: (id: string) => void;
  onProcessingComplete: (contacts: UnifiedContact[]) => void;
}

export function SimpleMode({
  onSwitchToAdvanced,
  files,
  onFilesAdded,
  onRemoveFile,
  onProcessingComplete,
}: SimpleModeProps) {
  const [step, setStep] = useState<"upload" | "preview" | "processing">("upload");

  const handleFilesAdded = useCallback(
    (newFiles: ParsedFile[]) => {
      onFilesAdded(newFiles);
      if (newFiles.length > 0) {
        setStep("preview");
      }
    },
    [onFilesAdded]
  );

  const handleReset = useCallback(() => {
    setStep("upload");
  }, []);

  return (
    <div className="space-y-4">
      {/* Mode switcher */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-medium">Modo simple</span>
          <Badge variant="outline" className="text-xs">Recomendado</Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground"
          onClick={() => {
            analytics.simpleModeToggled(false);
            onSwitchToAdvanced();
          }}
        >
          <Settings2 className="h-3.5 w-3.5 mr-1" />
          Modo avanzado
        </Button>
      </div>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Paso 1: Subí tus archivos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FileDropzone files={files} onFilesAdded={handleFilesAdded} onRemoveFile={onRemoveFile} />
          </CardContent>
        </Card>
      )}

      {/* Step 2: Preview + confirm */}
      {step === "preview" && files.length > 0 && (
        <>
          <PreviewPanel files={files} />
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-violet-500" />
                Paso 2: ¿Listo para limpiar?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                La IA normalizará nombres, teléfonos y emails. Eliminará duplicados.
                Todo automático con los mejores proveedores.
              </p>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => {
                    analytics.processingStarted("auto", files.reduce((s, f) => s + f.rows.length, 0));
                    setStep("processing");
                  }}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Limpiar con IA
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                <Button variant="outline" onClick={() => setStep("upload")}>
                  Cambiar archivos
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Step 3: Processing */}
      {step === "processing" && files.length > 0 && (
        <ProcessingPanel
          files={files}
          onProcessingComplete={(contacts) => {
            onProcessingComplete(contacts);
          }}
          onResetAll={handleReset}
        />
      )}
    </div>
  );
}
