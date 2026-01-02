import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Wallet, ArrowLeft, BookOpen, Calculator, BarChart3, FileText, Receipt, Percent } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppNavDropdown } from '@/components/AppNavDropdown';
import { AccountingEntriesTab } from '@/components/administracion/AccountingEntriesTab';
import { AccountingEntryLinesTab } from '@/components/administracion/AccountingEntryLinesTab';
import { AccountingAccountsTab } from '@/components/administracion/AccountingAccountsTab';
import { AccountingBalanceReport } from '@/components/administracion/AccountingBalanceReport';
import { InvoicesTab } from '@/components/administracion/InvoicesTab';
import { VATReportTab } from '@/components/administracion/VATReportTab';

export default function Administracion() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('invoices');
  const [highlightEntryCode, setHighlightEntryCode] = useState<string | null>(null);
  const [highlightAccountId, setHighlightAccountId] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate('/auth');
        return;
      }

      // Check if user is admin
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      const hasAdminRole = roles?.some(r => r.role === 'administrador');
      
      if (!hasAdminRole) {
        navigate('/dashboard');
        return;
      }

      setIsAdmin(true);
    } catch (error) {
      console.error('Error checking auth:', error);
      navigate('/auth');
    } finally {
      setLoading(false);
    }
  };

  const handleNavigateToEntry = (entryCode: string) => {
    setHighlightEntryCode(entryCode);
    setActiveTab('entries');
  };

  const handleNavigateToAccount = (accountId: string) => {
    setHighlightAccountId(accountId);
    setActiveTab('accounts');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <AppNavDropdown />
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Wallet className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Administración</h1>
              <p className="text-sm text-muted-foreground">
                Contabilidad y facturación
              </p>
            </div>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="invoices" className="gap-2">
              <Receipt className="h-4 w-4" />
              Facturas
            </TabsTrigger>
            <TabsTrigger value="entries" className="gap-2">
              <BookOpen className="h-4 w-4" />
              Asientos
            </TabsTrigger>
            <TabsTrigger value="lines" className="gap-2">
              <FileText className="h-4 w-4" />
              Apuntes
            </TabsTrigger>
            <TabsTrigger value="accounts" className="gap-2">
              <Calculator className="h-4 w-4" />
              Cuentas Contables
            </TabsTrigger>
            <TabsTrigger value="balance" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Informe Balance
            </TabsTrigger>
            <TabsTrigger value="vat" className="gap-2">
              <Percent className="h-4 w-4" />
              Informe IVA
            </TabsTrigger>
          </TabsList>

          <TabsContent value="invoices">
            <InvoicesTab />
          </TabsContent>

          <TabsContent value="entries">
            <AccountingEntriesTab 
              highlightCode={highlightEntryCode}
              onHighlightHandled={() => setHighlightEntryCode(null)}
            />
          </TabsContent>

          <TabsContent value="lines">
            <AccountingEntryLinesTab 
              onNavigateToEntry={handleNavigateToEntry}
              onNavigateToAccount={handleNavigateToAccount}
            />
          </TabsContent>

          <TabsContent value="accounts">
            <AccountingAccountsTab 
              highlightAccountId={highlightAccountId}
              onHighlightHandled={() => setHighlightAccountId(null)}
              onNavigateToEntry={handleNavigateToEntry}
            />
          </TabsContent>

          <TabsContent value="balance">
            <AccountingBalanceReport />
          </TabsContent>

          <TabsContent value="vat">
            <VATReportTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
