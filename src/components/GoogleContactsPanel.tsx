import { useState, useCallback, useEffect } from "react";
import { Chrome, Loader2, Users, Download, RefreshCw, LogOut, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ParsedFile } from "@/types/contact";

interface GoogleContactsPanelProps {
  onContactsImported: (file: ParsedFile) => void;
}

interface GoogleContact {
  firstName: string;
  lastName: string;
  email: string;
  whatsapp: string;
  company: string;
  jobTitle: string;
  source: string;
}

const REDIRECT_URI = typeof window !== "undefined" ? window.location.origin : "";

export function GoogleContactsPanel({ onContactsImported }: GoogleContactsPanelProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [contacts, setContacts] = useState<GoogleContact[]>([]);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Check for OAuth callback code in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
      exchangeCode(code);
    }
  }, []);

  const startAuth = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-contacts-auth", {
        body: { action: "auth_url", redirectUri: REDIRECT_URI },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Failed to get auth URL");
      window.location.href = data.authUrl;
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
      setIsLoading(false);
    }
  };

  const exchangeCode = async (code: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-contacts-auth", {
        body: { action: "exchange", code, redirectUri: REDIRECT_URI },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      setAccessToken(data.access_token);
      setIsConnected(true);
      toast.success("Conectado a Google Contacts");
      // Auto-fetch contacts
      fetchContacts(data.access_token);
    } catch (err: any) {
      toast.error(`Error de autenticacion: ${err.message}`);
      setIsLoading(false);
    }
  };

  const fetchContacts = async (token?: string) => {
    const tk = token || accessToken;
    if (!tk) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-contacts-auth", {
        body: { action: "fetch_contacts", code: tk, redirectUri: REDIRECT_URI },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      setContacts(data.contacts || []);
      toast.success(`${data.total} contactos obtenidos de Google`);
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const importContacts = useCallback(() => {
    if (contacts.length === 0) return;

    const columns = ["firstName", "lastName", "email", "whatsapp", "company", "jobTitle"];
    const rows = contacts.map(c => ({
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      whatsapp: c.whatsapp,
      company: c.company,
      jobTitle: c.jobTitle,
    }));

    const parsed: ParsedFile = {
      id: crypto.randomUUID(),
      name: `Google Contacts (${contacts.length})`,
      size: JSON.stringify(rows).length,
      type: "Google",
      rows,
      columns,
      addedAt: new Date(),
    };

    onContactsImported(parsed);
    toast.success(`${contacts.length} contactos importados para procesamiento`);
  }, [contacts, onContactsImported]);

  const disconnect = () => {
    setAccessToken(null);
    setIsConnected(false);
    setContacts([]);
    setShowPreview(false);
  };

  // Stats
  const withEmail = contacts.filter(c => c.email).length;
  const withPhone = contacts.filter(c => c.whatsapp).length;
  const withCompany = contacts.filter(c => c.company).length;
  const noName = contacts.filter(c => !c.firstName && !c.lastName).length;

  return (
    <Card className="border-blue-500/30 bg-blue-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Chrome className="h-4 w-4 text-blue-500" />
            Google Contacts
          </span>
          {isConnected && (
            <div className="flex items-center gap-2">
              <Badge className="bg-green-500/20 text-green-500 border-green-500/30 text-[10px]">
                Conectado
              </Badge>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={disconnect}>
                <LogOut className="h-3 w-3" />
              </Button>
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isConnected ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <p className="text-xs text-muted-foreground text-center">
              Conecta tu cuenta de Google para importar tus contactos directamente
            </p>
            <Button onClick={startAuth} disabled={isLoading} className="gap-2">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Chrome className="h-4 w-4" />}
              Conectar Google Contacts
            </Button>
          </div>
        ) : (
          <>
            {/* Stats */}
            {contacts.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-lg border bg-card p-2 text-center">
                  <p className="text-sm font-bold text-foreground">{contacts.length.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">Total</p>
                </div>
                <div className="rounded-lg border bg-card p-2 text-center">
                  <p className="text-sm font-bold text-blue-500">{withEmail.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">Con email</p>
                </div>
                <div className="rounded-lg border bg-card p-2 text-center">
                  <p className="text-sm font-bold text-green-500">{withPhone.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">Con telefono</p>
                </div>
                <div className="rounded-lg border bg-card p-2 text-center">
                  <p className="text-sm font-bold text-yellow-500">{noName.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">Sin nombre</p>
                </div>
              </div>
            )}

            {/* Preview toggle */}
            {contacts.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs gap-1"
                onClick={() => setShowPreview(!showPreview)}
              >
                {showPreview ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {showPreview ? "Ocultar vista previa" : `Ver contactos de Google (${contacts.length})`}
              </Button>
            )}

            {showPreview && contacts.length > 0 && (
              <ScrollArea className="h-[200px] rounded-lg border">
                <div className="p-2 space-y-1">
                  {contacts.slice(0, 100).map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded hover:bg-muted/50 border-b border-border/30">
                      <Users className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="font-medium truncate min-w-[100px]">
                        {c.firstName || c.lastName ? `${c.firstName} ${c.lastName}`.trim() : <span className="text-muted-foreground italic">Sin nombre</span>}
                      </span>
                      {c.email && <Badge variant="outline" className="text-[9px] h-4 shrink-0">{c.email}</Badge>}
                      {c.whatsapp && <span className="text-muted-foreground truncate">{c.whatsapp}</span>}
                      {c.company && <span className="text-muted-foreground truncate hidden sm:inline">• {c.company}</span>}
                    </div>
                  ))}
                  {contacts.length > 100 && (
                    <p className="text-[10px] text-muted-foreground text-center py-2">
                      ... y {contacts.length - 100} contactos mas
                    </p>
                  )}
                </div>
              </ScrollArea>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => fetchContacts()} disabled={isLoading} className="gap-1.5">
                {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Actualizar
              </Button>
              <Button size="sm" onClick={importContacts} disabled={contacts.length === 0 || isLoading} className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Importar {contacts.length > 0 ? `(${contacts.length.toLocaleString()})` : ""}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
