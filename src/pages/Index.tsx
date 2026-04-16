import { useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { FileDropzone } from "@/components/FileDropzone";
import { ProcessingPanel } from "@/components/ProcessingPanel";
import { ContactsTable } from "@/components/ContactsTable";
import { ExportPanel } from "@/components/ExportPanel";
import { DashboardPanel } from "@/components/DashboardPanel";
import { saveContacts, updateContact, deleteContact, clearContacts } from "@/lib/db";
import type { ParsedFile, UnifiedContact } from "@/types/contact";
import { toast } from "sonner";
import { Upload, Zap, Users, Download, BarChart3, Settings } from "lucide-react";
import { GoogleContactsPanel } from "@/components/GoogleContactsPanel";
import { ApiKeysPanel } from "@/components/ApiKeysPanel";

const Index = () => {
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [contacts, setContacts] = useState<UnifiedContact[]>([]);
  const [activeTab, setActiveTab] = useState("import");

  const handleFilesAdded = useCallback((newFiles: ParsedFile[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const handleRemoveFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleProcessingComplete = useCallback(async (processed: UnifiedContact[]) => {
    setContacts(processed);
    try {
      const clean = processed.filter((c) => !c.isDuplicate);
      await saveContacts(clean);
    } catch {
      toast.error("Error guardando en base de datos local");
    }
    setActiveTab("results");
  }, []);

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
    setFiles([]);
    setContacts([]);
    await clearContacts();
    setActiveTab("import");
    toast.success("Todo reiniciado");
  }, []);

  const uniqueCount = contacts.filter((c) => !c.isDuplicate).length;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-primary shadow-sm">
        <div className="container flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center">
                <Users className="h-4 w-4 text-accent-foreground" />
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-tight text-primary-foreground">ContactUnifier</h1>
              </div>
            </div>
            <Badge className="text-[10px] hidden sm:inline-flex bg-accent text-accent-foreground border-0 font-semibold">
              AI Pro
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            {contacts.length > 0 && (
              <Badge className="text-xs bg-primary-foreground/20 text-primary-foreground border-0">
                {uniqueCount.toLocaleString()} contactos
              </Badge>
            )}
            <div className="h-2 w-2 rounded-full bg-success animate-pulse-glow" title="Online" />
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 container px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="w-full grid grid-cols-6 h-11 bg-muted/50">
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
              <span className="hidden sm:inline">Config</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="import">
            <div className="space-y-4">
              <GoogleContactsPanel onContactsImported={(file) => handleFilesAdded([file])} />
              <FileDropzone files={files} onFilesAdded={handleFilesAdded} onRemoveFile={handleRemoveFile} />
            </div>
          </TabsContent>

          <TabsContent value="process">
            {files.length === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
                Cargá archivos primero en la pestaña Importar
              </div>
            ) : (
              <ProcessingPanel files={files} onProcessingComplete={handleProcessingComplete} onResetAll={handleResetAll} />
            )}
          </TabsContent>

          <TabsContent value="results">
            {contacts.length === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
                Procesá tus archivos para ver los resultados
              </div>
            ) : (
              <ContactsTable
                contacts={contacts}
                onUpdateContact={handleUpdateContact}
                onDeleteContact={handleDeleteContact}
              />
            )}
          </TabsContent>

          <TabsContent value="export">
            <ExportPanel contacts={contacts} />
          </TabsContent>

          <TabsContent value="dashboard">
            <DashboardPanel contacts={contacts} />
          </TabsContent>

          <TabsContent value="settings">
            <ApiKeysPanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
