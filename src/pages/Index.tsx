import { useState, useCallback, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "next-themes";
import { FileDropzone } from "@/components/FileDropzone";
import { ProcessingPanel } from "@/components/ProcessingPanel";
import { ContactsTable } from "@/components/ContactsTable";
import { ExportPanel } from "@/components/ExportPanel";
import { DashboardPanel } from "@/components/DashboardPanel";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { EmptyState } from "@/components/EmptyState";
import { PreviewPanel } from "@/components/PreviewPanel";
import { SimpleMode } from "@/components/SimpleMode";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { analytics } from "@/lib/analytics";
import { saveContacts, updateContact, deleteContact, clearContacts, saveHistorySnapshot } from "@/lib/db";
import { handleError } from "@/lib/error-handler";
import type { ParsedFile, UnifiedContact } from "@/types/contact";
import { Upload, Zap, Users, Download, BarChart3, Settings, Moon, Sun, Sparkles, Settings2, Globe } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { HistoryPanel } from "@/components/HistoryPanel";
import { Button } from "@/components/ui/button";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { toast } from "sonner";

analytics.pageView();

const ONBOARDING_KEY = "__mc_onboarded__";
const MODE_KEY = "__mc_simple_mode__";

const TABS = ["import", "process", "results", "export", "dashboard", "settings"] as const;

const Index = () => {
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [contacts, setContacts] = useState<UnifiedContact[]>([]);
  const [activeTab, setActiveTab] = useState("import");
  const { theme, setTheme } = useTheme();
  const { isInstallable, isStandalone, install } = usePWAInstall();
  const { locale, setLocale } = useI18n();

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem(ONBOARDING_KEY);
  });

  // Simple/Advanced mode
  const [simpleMode, setSimpleMode] = useState(() => {
    const stored = localStorage.getItem(MODE_KEY);
    return stored === null ? true : stored === "true";
  });

  useEffect(() => {
    localStorage.setItem(MODE_KEY, String(simpleMode));
  }, [simpleMode]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      // Don't trigger with modifiers (except shift for some)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();

      // Number keys 1-6 → switch tabs (only in advanced mode)
      if (!simpleMode && key >= "1" && key <= "6") {
        const tabIdx = parseInt(key) - 1;
        if (TABS[tabIdx]) {
          setActiveTab(TABS[tabIdx]);
          e.preventDefault();
        }
      }

      // D → toggle dark mode
      if (key === "d") {
        setTheme(theme === "dark" ? "light" : "dark");
        e.preventDefault();
      }

      // S → toggle simple/advanced mode
      if (key === "s") {
        const next = !simpleMode;
        setSimpleMode(next);
        analytics.simpleModeToggled(next);
        e.preventDefault();
      }

      // L → toggle language
      if (key === "l") {
        setLocale(locale === "es" ? "en" : "es");
        e.preventDefault();
      }

      // ? → show shortcuts help
      if (key === "?") {
        toast.info("Atajos: 1-6 tabs · D tema · S modo · R reiniciar", { duration: 4000 });
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [theme, simpleMode, setTheme, locale, setLocale]);

  const handleOnboardingComplete = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setShowOnboarding(false);
  }, []);

  const handleOnboardingSkip = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setShowOnboarding(false);
  }, []);

  const handleFilesAdded = useCallback((newFiles: ParsedFile[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
    // Track analytics
    for (const f of newFiles) {
      const ext = f.name.split(".").pop()?.toLowerCase() || "unknown";
      analytics.fileImported(ext, f.rows.length);
    }
  }, []);

  const handleRemoveFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleProcessingComplete = useCallback(async (processed: UnifiedContact[]) => {
    // Save snapshot before overwriting (for undo)
    if (contacts.length > 0) {
      await saveHistorySnapshot("clean", `Limpieza de ${files.length} archivo(s)`, contacts);
    }
    setContacts(processed);
    try {
      const clean = processed.filter((c) => !c.isDuplicate);
      await saveContacts(clean);
    } catch (err) {
      handleError(err, {
        component: "Index",
        action: "saveContacts",
        category: "storage",
        severity: "high",
      });
      toast.error("Error guardando en base de datos local");
    }
    setActiveTab("results");
  }, [contacts, files]);

  const handleUpdateContact = useCallback(async (contact: UnifiedContact) => {
    setContacts((prev) => prev.map((c) => (c.id === contact.id ? contact : c)));
    await updateContact(contact);
    toast.success("Contacto actualizado");
  }, []);

  const handleDeleteContact = useCallback(async (id: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== id));
    await deleteContact(id);
    toast.success("Contacto eliminado");
  }, []);

  const handleResetAll = useCallback(async () => {
    // Save snapshot before resetting
    if (contacts.length > 0) {
      await saveHistorySnapshot("clean", "Reinicio completo", contacts);
    }
    setFiles([]);
    setContacts([]);
    await clearContacts();
    setActiveTab("import");
    toast.success("Todo reiniciado");
  }, [contacts]);

  const handleRestoreFromHistory = useCallback((restored: unknown[]) => {
    setContacts(restored as UnifiedContact[]);
    setActiveTab("results");
  }, []);

  const uniqueCount = contacts.filter((c) => !c.isDuplicate).length;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Onboarding wizard — shows on first visit */}
      {showOnboarding && (
        <OnboardingWizard
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
          onStartImport={() => setActiveTab("import")}
        />
      )}

      {/* Barra tricolor institucional Mejora Continua */}
      <div className="h-1 w-full flex shrink-0" aria-hidden="true">
        <div className="h-full bg-[#1A3D84] flex-[2]" />
        <div className="h-full bg-[#E1061E] flex-1" />
        <div className="h-full bg-[#F7CC13] flex-1" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-primary shadow-sm">
        <div className="container flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center">
              <Users className="h-4 w-4 text-accent-foreground" />
            </div>
            <h1 className="text-sm font-bold tracking-tight text-primary-foreground">MejoraContactos</h1>
            <Badge className="text-[10px] hidden sm:inline-flex bg-accent text-accent-foreground border-0 font-semibold">
              Autónomo
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {contacts.length > 0 && (
              <Badge className="text-xs bg-primary-foreground/20 text-primary-foreground border-0">
                {uniqueCount.toLocaleString()}
              </Badge>
            )}
            {/* PWA Install button */}
            {isInstallable && !isStandalone && (
              <button
                onClick={() => install()}
                className="h-7 px-2 rounded-full flex items-center gap-1 text-[10px] font-medium text-primary-foreground/75 hover:text-primary-foreground hover:bg-primary-foreground/10 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 transition-all"
                title="Instalar aplicación"
                aria-label="Instalar aplicación"
              >
                <Download className="h-3 w-3" />
                <span className="hidden sm:inline">Instalar</span>
              </button>
            )}
            {/* Simple/Advanced mode toggle */}
            <button
              onClick={() => {
                const next = !simpleMode;
                setSimpleMode(next);
                analytics.simpleModeToggled(next);
              }}
              className="h-7 px-2 rounded-full flex items-center gap-1 text-[10px] font-medium text-primary-foreground/75 hover:text-primary-foreground hover:bg-primary-foreground/10 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 transition-all"
              title={simpleMode ? "Cambiar a modo avanzado" : "Cambiar a modo simple"}
              aria-label={simpleMode ? "Cambiar a modo avanzado" : "Cambiar a modo simple"}
            >
              {simpleMode ? (
                <>
                  <Sparkles className="h-3 w-3" />
                  <span className="hidden sm:inline">Simple</span>
                </>
              ) : (
                <>
                  <Settings2 className="h-3 w-3" />
                  <span className="hidden sm:inline">Avanzado</span>
                </>
              )}
            </button>
            {/* Dark mode toggle */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="h-7 w-7 rounded-full flex items-center justify-center text-primary-foreground/75 hover:text-primary-foreground hover:bg-primary-foreground/10 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 transition-all"
              title="Cambiar tema"
              aria-label="Cambiar tema"
            >
              {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
            {/* Language toggle */}
            <button
              onClick={() => setLocale(locale === "es" ? "en" : "es")}
              className="h-7 px-2 rounded-full flex items-center gap-1 text-[10px] font-medium text-primary-foreground/75 hover:text-primary-foreground hover:bg-primary-foreground/10 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 transition-all"
              title={locale === "es" ? "Switch to English" : "Cambiar a español"}
              aria-label={locale === "es" ? "Switch to English" : "Cambiar a español"}
            >
              <Globe className="h-3 w-3" />
              <span className="hidden sm:inline">{locale.toUpperCase()}</span>
            </button>
            {/* Admin icon */}
            <button
              onClick={() => setActiveTab("settings")}
              className="h-7 w-7 rounded-full flex items-center justify-center text-primary-foreground/50 hover:text-primary-foreground hover:bg-primary-foreground/10 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 transition-all"
              title="Administrador"
              aria-label="Administrador"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 container px-4 py-6">
        {/* Simple mode */}
        {simpleMode ? (
          <SimpleMode
            onSwitchToAdvanced={() => setSimpleMode(false)}
            onStartImport={() => setActiveTab("import")}
            files={files}
            onFilesAdded={handleFilesAdded}
            onRemoveFile={handleRemoveFile}
            onProcessingComplete={handleProcessingComplete}
          />
        ) : null}

        {/* Advanced mode (full tabs) */}
        {!simpleMode && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="w-full flex overflow-x-auto flex-nowrap h-11 bg-muted/50 justify-start sm:grid sm:grid-cols-6">
              <TabsTrigger value="import" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Upload className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Importar</span>
              </TabsTrigger>
              <TabsTrigger value="process" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Zap className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Procesar</span>
              </TabsTrigger>
              <TabsTrigger value="results" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Users className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Resultados</span>
              </TabsTrigger>
              <TabsTrigger value="export" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Exportar</span>
              </TabsTrigger>
              <TabsTrigger value="dashboard" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <BarChart3 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Dashboard</span>
              </TabsTrigger>
              <TabsTrigger value="settings" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Settings className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Mantenimiento</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="import">
              <div className="space-y-4">
                <FileDropzone files={files} onFilesAdded={handleFilesAdded} onRemoveFile={handleRemoveFile} />
                {files.length > 0 && <PreviewPanel files={files} />}
              </div>
            </TabsContent>

            <TabsContent value="process">
              <ErrorBoundary>
                {files.length === 0 ? (
                  <EmptyState
                    illustration="process"
                    title="Primero importá tus contactos"
                    description="Subí archivos CSV, Excel, VCF o JSON desde la pestaña Importar para empezar a procesar."
                    action={{ label: "Ir a Importar", onClick: () => setActiveTab("import") }}
                  />
                ) : (
                  <ProcessingPanel files={files} onProcessingComplete={handleProcessingComplete} onResetAll={handleResetAll} />
                )}
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="results">
              <ErrorBoundary>
                {contacts.length === 0 ? (
                  <EmptyState
                    illustration="results"
                    title="Sin resultados todavía"
                    description="Procesá tus archivos para ver los contactos limpios y deduplicados acá."
                    action={files.length > 0 ? { label: "Ir a Procesar", onClick: () => setActiveTab("process") } : { label: "Importar archivos", onClick: () => setActiveTab("import") }}
                  />
                ) : (
                  <ContactsTable
                    contacts={contacts}
                    onUpdateContact={handleUpdateContact}
                    onDeleteContact={handleDeleteContact}
                  />
                )}
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="export">
              <ErrorBoundary>
                {contacts.length === 0 ? (
                  <EmptyState
                    illustration="export"
                    title="Nada para exportar"
                    description="Procesá tus contactos primero. Después podés exportarlos en CSV, Excel, VCF, JSON o informe HTML."
                    action={{ label: "Ir a Importar", onClick: () => setActiveTab("import") }}
                  />
                ) : (
                  <ExportPanel contacts={contacts} />
                )}
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="dashboard">
              <ErrorBoundary>
                {contacts.length === 0 ? (
                  <EmptyState
                    illustration="dashboard"
                    title="Dashboard vacío"
                    description="Cuando procesés tus contactos, acá vas a ver métricas de calidad, distribución de scores y más."
                    action={{ label: "Importar contactos", onClick: () => setActiveTab("import") }}
                  />
                ) : (
                  <DashboardPanel contacts={contacts} />
                )}
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="settings">
              <div className="grid gap-4 lg:grid-cols-2">
                <HistoryPanel onRestore={handleRestoreFromHistory} />
                <div className="rounded-lg border bg-card p-6 space-y-4 h-fit">
                  <div className="space-y-1">
                    <h2 className="text-sm font-semibold">Mantenimiento de Base Local</h2>
                    <p className="text-xs text-muted-foreground">
                      Limpiá los archivos en memoria y vaciá la base local del navegador para iniciar una prueba desde cero. Se guarda una copia automática en el historial antes de reiniciar.
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleResetAll}
                    title="Reiniciar base local a cero"
                    aria-label="Reiniciar base local a cero"
                  >
                    Reiniciar base local a cero
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </main>

      <footer className="py-3 px-4 text-center text-xs text-muted-foreground/60 border-t border-border/30">
        <span>MejoraContactos · Proyecto TypeScript Autónomo · 100% Local y Sin Conexiones</span>
      </footer>
    </div>
  );
};

export default Index;
