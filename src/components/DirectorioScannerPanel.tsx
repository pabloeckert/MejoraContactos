import { useState, useEffect, useRef, useCallback } from "react";
import {
  Activity,
  FolderSearch,
  UploadCloud,
  FileSpreadsheet,
  FileText,
  FileCode,
  CheckCircle2,
  AlertCircle,
  Clock,
  Play,
  Loader2,
  RefreshCw,
  FolderOpen,
  Sparkles,
  Layers,
  Database,
  Terminal,
  ShieldCheck,
  HelpCircle,
  Trash2,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface ScanStatus {
  estado: "idle" | "running" | "completed" | "error";
  ruta: string;
  archivo_actual: string;
  archivos_analizados: number;
  archivos_totales: number;
  registros_procesados: number;
  progreso_porcentaje: number;
  tiempo_transcurrido_segundos: number;
  tiempo_inicio?: string | null;
  ultimo_mensaje: string;
  actividad_reciente: Array<{ hora: string; mensaje: string }>;
  resultado?: {
    total_personas_unificadas?: number;
    raw_records_nuevos?: number;
    normalized_records_nuevos?: number;
    archivos_salida?: {
      lista_maestra?: string;
      whatsapp_csv?: string;
    };
    formatos_detectados?: Record<string, number>;
  } | null;
  error?: string | null;
}

interface CalidadResumen {
  total: number;
  util: number;
  dudoso: number;
  inutil: number;
  porcentajes: {
    util: number;
    dudoso: number;
    inutil: number;
  };
  top_motivos_dudoso?: Array<{ motivo: string; cantidad: number }>;
  top_motivos_inutil?: Array<{ motivo: string; cantidad: number }>;
  fuentes_procesadas?: number;
  personas_unificadas?: number;
}

const ESTADO_INICIAL_STATUS: ScanStatus = {
  estado: "idle",
  ruta: "",
  archivo_actual: "",
  archivos_analizados: 0,
  archivos_totales: 0,
  registros_procesados: 0,
  progreso_porcentaje: 0,
  tiempo_transcurrido_segundos: 0,
  ultimo_mensaje: "Listo para escanear carpetas locales o unidades Drive.",
  actividad_reciente: [],
};

export function DirectorioScannerPanel() {
  const [rutaCarpeta, setRutaCarpeta] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<ScanStatus>(ESTADO_INICIAL_STATUS);

  const [calidad, setCalidad] = useState<CalidadResumen | null>(null);
  const [cargandoCalidad, setCargandoCalidad] = useState(false);
  const [archivosSubidos, setArchivosSubidos] = useState<Array<{ nombre: string; tamano: number; fecha: string }>>([]);
  const [autoScroll, setAutoScroll] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const terminalBottomRef = useRef<HTMLDivElement>(null);

  // 1. Cargar estado de escaneo de forma defensiva
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/scan-status");
      if (!res.ok) return;
      const data = await res.json();
      if (data && typeof data === "object") {
        setStatus((prev) => ({
          estado: data.estado || prev.estado || "idle",
          ruta: data.ruta ?? prev.ruta ?? "",
          archivo_actual: data.archivo_actual ?? prev.archivo_actual ?? "",
          archivos_analizados: Number(data.archivos_analizados) || 0,
          archivos_totales: Number(data.archivos_totales) || 0,
          registros_procesados: Number(data.registros_procesados) || 0,
          progreso_porcentaje: Number(data.progreso_porcentaje) || 0,
          tiempo_transcurrido_segundos: Number(data.tiempo_transcurrido_segundos) || 0,
          tiempo_inicio: data.tiempo_inicio ?? prev.tiempo_inicio ?? null,
          ultimo_mensaje: data.ultimo_mensaje || prev.ultimo_mensaje || "Listo",
          actividad_reciente: Array.isArray(data.actividad_reciente)
            ? data.actividad_reciente
            : prev.actividad_reciente || [],
          resultado: data.resultado ?? prev.resultado ?? null,
          error: data.error ?? null,
        }));
        setIsScanning(data.estado === "running");
      }
    } catch {
      // Backend offline o sin proxy temporalmente
    }
  }, []);

  // 2. Cargar métricas de calidad de forma defensiva
  const fetchCalidad = useCallback(async () => {
    setCargandoCalidad(true);
    try {
      const res = await fetch("/api/calidad-resumen");
      if (!res.ok) return;
      const data = await res.json();
      if (data && typeof data === "object") {
        setCalidad({
          total: Number(data.total) || 0,
          util: Number(data.util) || 0,
          dudoso: Number(data.dudoso) || 0,
          inutil: Number(data.inutil) || 0,
          porcentajes: {
            util: Number(data?.porcentajes?.util) || 0,
            dudoso: Number(data?.porcentajes?.dudoso) || 0,
            inutil: Number(data?.porcentajes?.inutil) || 0,
          },
          top_motivos_dudoso: Array.isArray(data.top_motivos_dudoso) ? data.top_motivos_dudoso : [],
          top_motivos_inutil: Array.isArray(data.top_motivos_inutil) ? data.top_motivos_inutil : [],
          fuentes_procesadas: Number(data.fuentes_procesadas) || 0,
          personas_unificadas: Number(data.personas_unificadas) || 0,
        });
      }
    } catch {
      // Silencioso ante fallos temporales de conexión
    } finally {
      setCargandoCalidad(false);
    }
  }, []);

  // Polling dinámico cuando está corriendo
  useEffect(() => {
    fetchStatus();
    fetchCalidad();

    const interval = setInterval(() => {
      fetchStatus();
    }, isScanning ? 1000 : 4000);

    return () => clearInterval(interval);
  }, [fetchStatus, fetchCalidad, isScanning]);

  // Si el estado pasa a completed, refrescar calidad automáticamente
  useEffect(() => {
    if (status?.estado === "completed") {
      fetchCalidad();
    }
  }, [status?.estado, fetchCalidad]);

  // Auto-scroll del visor de logs
  useEffect(() => {
    if (autoScroll && terminalBottomRef.current) {
      terminalBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [status?.actividad_reciente, autoScroll]);

  // Iniciar Escaneo de Carpeta
  const handleIniciarEscaneo = async (rutaPersonalizada?: string) => {
    const destino = (rutaPersonalizada ?? rutaCarpeta).trim();
    if (!destino) {
      toast.error("Por favor ingresá la ruta de la carpeta que querés escanear");
      return;
    }

    setIsScanning(true);
    toast.info(`Iniciando escáner en: ${destino}`);

    try {
      const res = await fetch("/api/scan-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruta: destino }),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "No se pudo iniciar el escaneo");
      }

      toast.success(data?.mensaje || "Escaneo iniciado en segundo plano");
      fetchStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al conectar con el motor";
      toast.error(msg);
      setIsScanning(false);
    }
  };

  // Subir archivos sueltos
  const handleUploadFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setIsUploading(true);
    toast.info(`Subiendo ${fileArray.length} archivo(s) a Data/Crudos...`);

    const formData = new FormData();
    fileArray.forEach((f) => formData.append("files", f));

    try {
      const res = await fetch("/api/upload-files", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Error al subir archivos");
      }

      toast.success(data?.mensaje || "Archivos subidos correctamente");
      const nuevos = fileArray.map((f) => ({
        nombre: f.name,
        tamano: f.size,
        fecha: new Date().toLocaleTimeString(),
      }));
      setArchivosSubidos((prev) => [...nuevos, ...prev]);
      fetchStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error subiendo archivos";
      toast.error(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadFiles(e.dataTransfer.files);
    }
  };

  const estadoActual = status?.estado || "idle";
  const actividadLista = Array.isArray(status?.actividad_reciente) ? status.actividad_reciente : [];

  return (
    <div className="space-y-6">
      {/* 1. Header Hero con Estado del Escáner */}
      <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 via-background to-accent/10 p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <FolderSearch className="h-5 w-5" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Escáner Universal de Directorios
              </h2>
              <Badge
                variant="outline"
                className={
                  estadoActual === "running"
                    ? "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 animate-pulse font-semibold"
                    : estadoActual === "completed"
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold"
                    : estadoActual === "error"
                    ? "border-destructive/50 bg-destructive/10 text-destructive font-semibold"
                    : "border-primary/20 bg-muted/40 text-muted-foreground font-medium"
                }
              >
                {estadoActual === "running" && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                {estadoActual === "completed" && <CheckCircle2 className="mr-1.5 h-3 w-3 text-emerald-500" />}
                {estadoActual === "error" && <AlertCircle className="mr-1.5 h-3 w-3 text-destructive" />}
                {estadoActual === "running"
                  ? "Escaneando en vivo..."
                  : estadoActual === "completed"
                  ? "Escaneo completado"
                  : estadoActual === "error"
                  ? "Error en escaneo"
                  : "Listo para escanear"}
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Ingresá rutas locales de tu PC o Google Drive (.xlsx, .csv, .docx, .pdf) para extraer contactos, normalizar con IA y unificar identidades en tiempo real.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchStatus();
                fetchCalidad();
                toast.success("Telemetría actualizada");
              }}
              disabled={isScanning || cargandoCalidad}
              className="h-8 gap-1.5 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isScanning || cargandoCalidad ? "animate-spin" : ""}`} />
              <span>Actualizar</span>
            </Button>
          </div>
        </div>
      </div>

      {/* 2. Resumen Métrico de Calidad (KPIs) con render defensivo */}
      {calidad ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Útiles */}
          <Card className="border-emerald-500/20 bg-emerald-500/5 shadow-xs transition-all hover:shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                Contactos Útiles (CRM)
              </CardTitle>
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-emerald-800 dark:text-emerald-300">
                  {calidad?.util != null ? calidad.util.toLocaleString() : "0"}
                </span>
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  ({calidad?.porcentajes?.util ?? 0}%)
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Con nombre, apellido o empresa y móvil/WhatsApp o email verificado.
              </p>
            </CardContent>
          </Card>

          {/* Dudosos */}
          <Card className="border-amber-500/20 bg-amber-500/5 shadow-xs transition-all hover:shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                Dudosos (Revisión)
              </CardTitle>
              <HelpCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-amber-800 dark:text-amber-300">
                  {calidad?.dudoso != null ? calidad.dudoso.toLocaleString() : "0"}
                </span>
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                  ({calidad?.porcentajes?.dudoso ?? 0}%)
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Ambiguos o incompletos. Derivados para resolución con LLM o panel humano.
              </p>
            </CardContent>
          </Card>

          {/* Inútiles / Descarte */}
          <Card className="border-rose-500/20 bg-rose-500/5 shadow-xs transition-all hover:shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-rose-700 dark:text-rose-400">
                Inútiles / Descarte
              </CardTitle>
              <Trash2 className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-rose-800 dark:text-rose-300">
                  {calidad?.inutil != null ? calidad.inutil.toLocaleString() : "0"}
                </span>
                <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  ({calidad?.porcentajes?.inutil ?? 0}%)
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Filas vacías, códigos 2FA, pruebas técnicas o sin vías de contacto reales.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* Tarjetas esqueleto de carga defensiva */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="border-muted bg-muted/10 p-4 animate-pulse">
            <div className="h-3 w-28 bg-muted rounded mb-2" />
            <div className="h-7 w-24 bg-muted rounded" />
          </Card>
          <Card className="border-muted bg-muted/10 p-4 animate-pulse">
            <div className="h-3 w-28 bg-muted rounded mb-2" />
            <div className="h-7 w-24 bg-muted rounded" />
          </Card>
          <Card className="border-muted bg-muted/10 p-4 animate-pulse">
            <div className="h-3 w-28 bg-muted rounded mb-2" />
            <div className="h-7 w-24 bg-muted rounded" />
          </Card>
        </div>
      )}

      {/* 3. Panel de Configuración y Ejecución de Escaneo */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Columna Izquierda: Entrada de Rutas Locales / Drive */}
        <Card className="flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderOpen className="h-4 w-4 text-primary" />
              <span>Escanear Carpeta Local o Drive</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Escribí o pegá la ruta absoluta donde tenés tus planillas y documentos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">
                Ruta absoluta del directorio:
              </label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Ej: C:\Users\Nombre\Google Drive\Contactos o Data/Crudos"
                  value={rutaCarpeta}
                  onChange={(e) => setRutaCarpeta(e.target.value)}
                  disabled={isScanning}
                  className="font-mono text-xs"
                />
                <Button
                  onClick={() => handleIniciarEscaneo()}
                  disabled={isScanning || !rutaCarpeta.trim()}
                  className="gap-1.5 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Escaneando</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 fill-current" />
                      <span>Escanear</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Accesos rápidos sugeridos */}
            <div className="space-y-1.5">
              <span className="text-[11px] text-muted-foreground">Accesos directos rápidos:</span>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[11px] px-2"
                  onClick={() => {
                    setRutaCarpeta("../Data/Crudos");
                    handleIniciarEscaneo("../Data/Crudos");
                  }}
                  disabled={isScanning}
                >
                  📁 Data/Crudos (Default)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[11px] px-2"
                  onClick={() => {
                    setRutaCarpeta("G:\\Mi unidad\\Contactos");
                  }}
                  disabled={isScanning}
                >
                  ☁️ Google Drive G:
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[11px] px-2"
                  onClick={() => {
                    setRutaCarpeta("C:\\Users\\tabeg\\Google Drive");
                  }}
                  disabled={isScanning}
                >
                  💻 Drive Local PC
                </Button>
              </div>
            </div>

            {/* Formatos Aceptados */}
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-1.5">
                <Layers className="h-3.5 w-3.5 text-primary" />
                <span>Formatos analizados recursivamente:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <FileSpreadsheet className="h-3 w-3 text-emerald-500" /> Excel (.xlsx, .xls, .ods)
                </Badge>
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <FileCode className="h-3 w-3 text-sky-500" /> CSV / TSV delimitados
                </Badge>
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <FileText className="h-3 w-3 text-blue-500" /> Word (.docx)
                </Badge>
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <FileText className="h-3 w-3 text-rose-500" /> Documentos PDF (.pdf)
                </Badge>
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <Sparkles className="h-3 w-3 text-amber-500" /> Texto libre / Notas (.txt, .md)
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Columna Derecha: Zona Drag & Drop para Subir Archivos */}
        <Card className="flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UploadCloud className="h-4 w-4 text-primary" />
              <span>Subir Planillas y Documentos Sueltos</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Arrastrá archivos individuales a la carpeta 'Data/Crudos' para incorporarlos al truth engine.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all ${
                isDragging
                  ? "border-primary bg-primary/10 scale-[0.99]"
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".xlsx,.xls,.csv,.tsv,.ods,.docx,.pdf,.txt,.md,.log,.vcf,.json"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleUploadFiles(e.target.files);
                  }
                }}
              />
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-2">
                {isUploading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <UploadCloud className="h-6 w-6" />
                )}
              </div>
              <p className="text-sm font-semibold text-foreground">
                {isUploading ? "Subiendo archivos al servidor..." : "Soltá tus planillas o documentos acá"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                o hacé clic para explorar desde tu equipo (.xlsx, .csv, .docx, .pdf)
              </p>
            </div>

            {archivosSubidos.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Archivos subidos recientemente:</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 text-[10px] p-0 text-primary hover:underline"
                    onClick={() => handleIniciarEscaneo("../Data/Crudos")}
                    disabled={isScanning}
                  >
                    Escanear Data/Crudos ahora →
                  </Button>
                </div>
                <div className="max-h-24 overflow-y-auto space-y-1 rounded-md border bg-muted/20 p-2">
                  {archivosSubidos.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-0.5">
                      <span className="font-mono truncate max-w-[200px]">{f.nombre}</span>
                      <div className="flex items-center gap-2 text-muted-foreground text-[10px]">
                        <span>{(f.tamano / 1024).toFixed(1)} KB</span>
                        <span>{f.fecha}</span>
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 4. Barra de Progreso y Telemetría en Tiempo Real con guardias defensivas */}
      <Card className="overflow-hidden border-primary/20">
        <CardHeader className="bg-muted/20 pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-sm font-bold">
                <Activity className="h-4 w-4 text-primary" />
                <span>Telemetría de Procesamiento en Vivo</span>
              </CardTitle>
              <p className="text-xs text-muted-foreground font-mono">
                {status?.archivo_actual ? `Archivo actual: ${status.archivo_actual}` : (status?.ultimo_mensaje ?? "")}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1 font-mono text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>{status?.tiempo_transcurrido_segundos ?? 0}s</span>
              </div>
              <Badge variant="outline" className="font-mono text-xs">
                {status?.archivos_analizados ?? 0} / {(status?.archivos_totales ?? 0) > 0 ? status.archivos_totales : "?"} archivos
              </Badge>
              <Badge variant="secondary" className="font-mono text-xs text-primary font-bold">
                {status?.registros_procesados ?? 0} crudos
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-semibold">
              <span>Progreso General</span>
              <span>{status?.progreso_porcentaje ?? 0}%</span>
            </div>
            <Progress value={status?.progreso_porcentaje ?? 0} className="h-2.5 transition-all" />
          </div>

          {/* Si hubo resultado exitoso */}
          {status?.resultado && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Último Escaneo Completado Exitosamente</span>
                </div>
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-700 text-xs">
                  {status.resultado.total_personas_unificadas ?? 0} Personas Unificadas
                </Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
                <div className="rounded bg-background/80 p-2">
                  <span className="text-[10px] text-muted-foreground block">Raw records nuevos</span>
                  <span className="font-mono font-bold text-foreground">{status.resultado.raw_records_nuevos ?? 0}</span>
                </div>
                <div className="rounded bg-background/80 p-2">
                  <span className="text-[10px] text-muted-foreground block">Normalizados</span>
                  <span className="font-mono font-bold text-foreground">{status.resultado.normalized_records_nuevos ?? 0}</span>
                </div>
                <div className="rounded bg-background/80 p-2 sm:col-span-2">
                  <span className="text-[10px] text-muted-foreground block">Archivos de Salida</span>
                  <span className="font-mono text-[11px] text-primary truncate block" title={status.resultado.archivos_salida?.lista_maestra}>
                    lista-maestra.xlsx
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 5. Visor de Actividad Reciente (Terminal / Logs Monospace) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Terminal className="h-3.5 w-3.5 text-primary" />
                <span>Actividad Reciente del Motor e IA</span>
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded text-primary focus:ring-0"
                />
                <span>Auto-scroll</span>
              </label>
            </div>

            <div className="rounded-lg border bg-zinc-950 p-3 font-mono text-[11px] text-zinc-300 shadow-inner h-48 overflow-y-auto space-y-1">
              {actividadLista.length === 0 ? (
                <div className="flex h-full items-center justify-center text-zinc-500 italic">
                  Esperando actividad... los eventos del escáner y la IA aparecerán acá.
                </div>
              ) : (
                actividadLista.map((log, index) => {
                  const mensaje = log?.mensaje ?? "";
                  const hora = log?.hora ?? "--:--:--";
                  const esError = mensaje.includes("Error") || mensaje.includes("⚠️");
                  const esExito = mensaje.includes("✓") || mensaje.includes("✅") || mensaje.includes("🎉");

                  return (
                    <div key={index} className="flex items-start gap-2 leading-relaxed">
                      <span className="text-zinc-500 select-none shrink-0">[{hora}]</span>
                      <span className={esError ? "text-rose-400" : esExito ? "text-emerald-400" : "text-zinc-200"}>
                        {mensaje}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={terminalBottomRef} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
