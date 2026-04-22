import { useState, useCallback, useEffect } from "react";
import { Chrome, Loader2, Users, Download, RefreshCw, LogOut, ChevronDown, ChevronUp, Plus, CheckCircle2, XCircle } from "lucide-react";
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

interface GoogleAccount {
  id: string;
  email: string;
  displayName: string;
  accessToken: string;
  avatarUrl?: string;
  contactsCount: number;
  lastSync: Date | null;
  status: 'connected' | 'expired' | 'error';
  color: string;
  contacts: GoogleContact[];
}

const ACCOUNT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
const MAX_ACCOUNTS = 5;
const STORAGE_KEY = 'mejoracontactos_google_accounts';

const REDIRECT_URI = typeof window !== "undefined" ? window.location.origin : "";

// Load accounts from localStorage
function loadAccounts(): GoogleAccount[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

// Save accounts to localStorage
function saveAccounts(accounts: GoogleAccount[]) {
  try {
    // Don't store contacts in localStorage (too large)
    const toStore = accounts.map(a => ({ ...a, contacts: [] }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch {}
}

export function GoogleContactsPanel({ onContactsImported }: GoogleContactsPanelProps) {
  const [accounts, setAccounts] = useState<GoogleAccount[]>([]);
  const [isLoading, setIsLoading] = useState<string | null>(null); // account id or null
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Load accounts on mount
  useEffect(() => {
    const stored = loadAccounts();
    if (stored.length > 0) {
      setAccounts(stored.map((a, i) => ({
        ...a,
        color: a.color || ACCOUNT_COLORS[i % ACCOUNT_COLORS.length],
        contacts: [],
        status: 'connected' as const,
      })));
    }
  }, []);

  // Check for OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state"); // account index for adding to existing
    if (code) {
      window.history.replaceState({}, "", window.location.pathname);
      handleOAuthCallback(code, state ? parseInt(state) : undefined);
    }
  }, []);

  const handleOAuthCallback = async (code: string, accountIndex?: number) => {
    setIsLoading('new');
    try {
      const { data, error } = await supabase.functions.invoke("google-contacts-auth", {
        body: { action: "exchange", code, redirectUri: REDIRECT_URI },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Token exchange failed");

      const newAccount: GoogleAccount = {
        id: crypto.randomUUID(),
        email: data.email || `cuenta${accounts.length + 1}@gmail.com`,
        displayName: data.name || `Cuenta ${accounts.length + 1}`,
        accessToken: data.access_token,
        avatarUrl: data.avatar,
        contactsCount: 0,
        lastSync: null,
        status: 'connected',
        color: ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length],
        contacts: [],
      };

      const updated = [...accounts, newAccount];
      setAccounts(updated);
      saveAccounts(updated);
      toast.success(`Cuenta ${newAccount.email} conectada`);

      // Auto-fetch contacts
      fetchAccountContacts(newAccount.id);
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setIsLoading(null);
    }
  };

  const startAuth = async () => {
    if (accounts.length >= MAX_ACCOUNTS) {
      toast.warning(`Máximo ${MAX_ACCOUNTS} cuentas permitidas`);
      return;
    }
    setIsLoading('new');
    try {
      const { data, error } = await supabase.functions.invoke("google-contacts-auth", {
        body: { action: "auth_url", redirectUri: REDIRECT_URI, state: accounts.length.toString() },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Failed to get auth URL");
      window.location.href = data.authUrl;
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
      setIsLoading(null);
    }
  };

  const fetchAccountContacts = async (accountId: string) => {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;
    setIsLoading(accountId);
    try {
      const { data, error } = await supabase.functions.invoke("google-contacts-auth", {
        body: { action: "fetch_contacts", code: account.accessToken, redirectUri: REDIRECT_URI },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Failed to fetch contacts");

      const fetchedContacts: GoogleContact[] = (data.contacts || []).map((c: any) => ({
        ...c,
        source: `Google (${account.email})`,
      }));

      const updated = accounts.map(a =>
        a.id === accountId
          ? { ...a, contacts: fetchedContacts, contactsCount: fetchedContacts.length, lastSync: new Date(), status: 'connected' as const }
          : a
      );
      setAccounts(updated);
      saveAccounts(updated);
      toast.success(`${fetchedContacts.length} contactos de ${account.email}`);
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
      const updated = accounts.map(a =>
        a.id === accountId ? { ...a, status: 'error' as const } : a
      );
      setAccounts(updated);
    } finally {
      setIsLoading(null);
    }
  };

  const syncAllAccounts = async () => {
    for (const account of accounts) {
      await fetchAccountContacts(account.id);
    }
  };

  const importAccountContacts = useCallback((accountId: string) => {
    const account = accounts.find(a => a.id === accountId);
    if (!account || account.contacts.length === 0) return;

    const columns = ["firstName", "lastName", "email", "whatsapp", "company", "jobTitle"];
    const rows = account.contacts.map(c => ({
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      whatsapp: c.whatsapp,
      company: c.company,
      jobTitle: c.jobTitle,
    }));

    const parsed: ParsedFile = {
      id: crypto.randomUUID(),
      name: `Google ${account.email} (${account.contacts.length})`,
      size: JSON.stringify(rows).length,
      type: "Google",
      rows,
      columns,
      addedAt: new Date(),
    };

    onContactsImported(parsed);
    toast.success(`${account.contacts.length} contactos importados de ${account.email}`);
  }, [accounts, onContactsImported]);

  const importAllAccounts = useCallback(() => {
    const allContacts: GoogleContact[] = [];
    for (const account of accounts) {
      allContacts.push(...account.contacts);
    }
    if (allContacts.length === 0) {
      toast.error("No hay contactos para importar. Sincroniza primero.");
      return;
    }

    const columns = ["firstName", "lastName", "email", "whatsapp", "company", "jobTitle"];
    const rows = allContacts.map(c => ({
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      whatsapp: c.whatsapp,
      company: c.company,
      jobTitle: c.jobTitle,
    }));

    const parsed: ParsedFile = {
      id: crypto.randomUUID(),
      name: `Google Contacts Todos (${allContacts.length})`,
      size: JSON.stringify(rows).length,
      type: "Google",
      rows,
      columns,
      addedAt: new Date(),
    };

    onContactsImported(parsed);
    toast.success(`${allContacts.length} contactos importados de ${accounts.length} cuentas`);
  }, [accounts, onContactsImported]);

  const disconnectAccount = (accountId: string) => {
    const updated = accounts.filter(a => a.id !== accountId);
    setAccounts(updated);
    saveAccounts(updated);
    toast.success("Cuenta desconectada");
  };

  const totalContacts = accounts.reduce((sum, a) => sum + a.contactsCount, 0);
  const anySynced = accounts.some(a => a.contactsCount > 0);

  return (
    <Card className="border-blue-500/30 bg-blue-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Chrome className="h-4 w-4 text-blue-500" />
            Google Contacts
            {accounts.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {accounts.length}/{MAX_ACCOUNTS} cuentas
              </Badge>
            )}
          </span>
          {anySynced && totalContacts > 0 && (
            <Badge className="bg-green-500/20 text-green-500 border-green-500/30 text-[10px]">
              {totalContacts.toLocaleString()} contactos
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Accounts grid */}
        {accounts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="rounded-lg border bg-card p-3 space-y-2"
                style={{ borderLeftWidth: '3px', borderLeftColor: account.color }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ backgroundColor: account.color }}
                    >
                      {account.displayName?.[0]?.toUpperCase() || account.email[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{account.email}</p>
                      <div className="flex items-center gap-1">
                        {account.status === 'connected' ? (
                          <CheckCircle2 className="h-2.5 w-2.5 text-green-500" />
                        ) : (
                          <XCircle className="h-2.5 w-2.5 text-red-500" />
                        )}
                        <span className="text-[9px] text-muted-foreground">
                          {account.contactsCount > 0
                            ? `${account.contactsCount.toLocaleString()} contactos`
                            : 'Sin sincronizar'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={() => disconnectAccount(account.id)}
                  >
                    <LogOut className="h-3 w-3" />
                  </Button>
                </div>

                {/* Account actions */}
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] flex-1 gap-1"
                    onClick={() => fetchAccountContacts(account.id)}
                    disabled={isLoading === account.id}
                  >
                    {isLoading === account.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Sync
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-[10px] flex-1 gap-1"
                    onClick={() => importAccountContacts(account.id)}
                    disabled={account.contactsCount === 0}
                  >
                    <Download className="h-3 w-3" />
                    Importar
                  </Button>
                </div>

                {/* Preview toggle */}
                {account.contactsCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-6 text-[9px] text-muted-foreground"
                    onClick={() => setExpandedAccount(expandedAccount === account.id ? null : account.id)}
                  >
                    {expandedAccount === account.id ? 'Ocultar' : `Ver contactos (${account.contactsCount})`}
                  </Button>
                )}

                {/* Contact preview */}
                {expandedAccount === account.id && account.contacts.length > 0 && (
                  <ScrollArea className="h-[120px]">
                    <div className="space-y-0.5">
                      {account.contacts.slice(0, 50).map((c, i) => (
                        <div key={i} className="text-[10px] py-0.5 px-1 truncate text-muted-foreground">
                          {c.firstName} {c.lastName} • {c.email || c.whatsapp || '—'}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            ))}

            {/* Add account button */}
            {accounts.length < MAX_ACCOUNTS && (
              <button
                onClick={startAuth}
                disabled={isLoading === 'new'}
                className="rounded-lg border-2 border-dashed border-muted-foreground/20 p-3 flex flex-col items-center justify-center gap-2 hover:border-blue-500/50 hover:bg-blue-500/5 transition-colors min-h-[100px]"
              >
                {isLoading === 'new' ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  <Plus className="h-5 w-5 text-muted-foreground" />
                )}
                <span className="text-[10px] text-muted-foreground">
                  {isLoading === 'new' ? 'Conectando...' : '+ Conectar cuenta'}
                </span>
              </button>
            )}
          </div>
        )}

        {/* No accounts yet */}
        {accounts.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-4">
            <p className="text-xs text-muted-foreground text-center">
              Conecta hasta {MAX_ACCOUNTS} cuentas de Google para importar contactos
            </p>
            <Button onClick={startAuth} disabled={isLoading === 'new'} className="gap-2">
              {isLoading === 'new' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Chrome className="h-4 w-4" />}
              Conectar Google Contacts
            </Button>
          </div>
        )}

        {/* Global actions */}
        {accounts.length > 1 && (
          <div className="flex gap-2 pt-1 border-t">
            <Button size="sm" variant="outline" onClick={syncAllAccounts} disabled={!!isLoading} className="gap-1.5 text-xs flex-1">
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Sincronizar todas
            </Button>
            <Button size="sm" onClick={importAllAccounts} disabled={!anySynced || !!isLoading} className="gap-1.5 text-xs flex-1">
              <Download className="h-3.5 w-3.5" />
              Importar todas ({totalContacts.toLocaleString()})
            </Button>
          </div>
        )}

        {/* Single account: simple import button */}
        {accounts.length === 1 && anySynced && (
          <Button size="sm" onClick={() => importAccountContacts(accounts[0].id)} disabled={accounts[0].contactsCount === 0} className="w-full gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Importar {accounts[0].contactsCount.toLocaleString()} contactos
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
