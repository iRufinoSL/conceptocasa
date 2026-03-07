import { useState, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen, Calculator, BarChart3, FileText, Receipt, Percent, Mic, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AccountingEntriesTab } from '@/components/administracion/AccountingEntriesTab';
import { AccountingEntryLinesTab } from '@/components/administracion/AccountingEntryLinesTab';
import { AccountingAccountsTab } from '@/components/administracion/AccountingAccountsTab';
import { AccountingBalanceReport } from '@/components/administracion/AccountingBalanceReport';
import { InvoicesTab } from '@/components/administracion/InvoicesTab';
import { VATReportTab } from '@/components/administracion/VATReportTab';
import { ProvisionalAccountsAlerts } from '@/components/administracion/ProvisionalAccountsAlerts';
import { VoiceAssistantDialog, VoiceAction } from '@/components/voice/VoiceAssistantDialog';
import { useVoiceAccountingEntry } from '@/hooks/useVoiceAccountingEntry';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

interface Props {
  budgetId: string;
  isAdmin: boolean;
}

export function BudgetAdministracionTab({ budgetId, isAdmin }: Props) {
  const [activeTab, setActiveTab] = useState('invoices');
  const [highlightEntryCode, setHighlightEntryCode] = useState<string | null>(null);
  const [highlightAccountId, setHighlightAccountId] = useState<string | null>(null);
  const [voiceAssistantOpen, setVoiceAssistantOpen] = useState(false);
  const [entriesKey, setEntriesKey] = useState(0);
  const [provisionalCount, setProvisionalCount] = useState(0);

  const { createEntryFromVoice } = useVoiceAccountingEntry();

  useEffect(() => {
    fetchProvisionalCount();
  }, [budgetId]);

  const fetchProvisionalCount = async () => {
    try {
      const { count, error } = await supabase
        .from('accounting_entries')
        .select('*', { count: 'exact', head: true })
        .eq('has_provisional_account', true)
        .eq('budget_id', budgetId);

      if (!error && count !== null) {
        setProvisionalCount(count);
      }
    } catch (error) {
      console.error('Error fetching provisional count:', error);
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

  const handleVoiceAction = useCallback(async (action: VoiceAction) => {
    if (action.type === 'create_payment_entry' && action.data) {
      const data = action.data as {
        entry_type?: string;
        entry_date?: string;
        amount?: number;
        recipient_name?: string;
        treasury_account?: string;
        description?: string;
      };

      const result = await createEntryFromVoice({
        entry_type: (data.entry_type as 'pago' | 'cobro' | 'compra' | 'venta') || 'pago',
        entry_date: data.entry_date || new Date().toISOString().split('T')[0],
        amount: data.amount || 0,
        recipient_name: data.recipient_name || 'Desconocido',
        treasury_account: data.treasury_account || 'Caja',
        description: data.description || 'Asiento creado por voz',
        budget_name: undefined
      });

      if (result.success) {
        setEntriesKey(prev => prev + 1);
        setActiveTab('entries');
        if (result.entryCode) {
          setHighlightEntryCode(result.entryCode);
        }
      }
    }
  }, [createEntryFromVoice]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Administración del Presupuesto</h2>
          <p className="text-sm text-muted-foreground">
            Contabilidad y facturación asociada a este presupuesto
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setVoiceAssistantOpen(true)}
          title="Asistente de voz"
        >
          <Mic className="h-4 w-4" />
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex-wrap">
          {provisionalCount > 0 && (
            <TabsTrigger value="alerts" className="gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Alertas
              <Badge variant="destructive" className="ml-1 h-5 px-1.5">
                {provisionalCount}
              </Badge>
            </TabsTrigger>
          )}
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

        {provisionalCount > 0 && (
          <TabsContent value="alerts">
            <ProvisionalAccountsAlerts
              onEntryFixed={() => {
                fetchProvisionalCount();
                setEntriesKey(prev => prev + 1);
              }}
              onNavigateToEntry={handleNavigateToEntry}
            />
          </TabsContent>
        )}

        <TabsContent value="invoices">
          <InvoicesTab budgetId={budgetId} />
        </TabsContent>

        <TabsContent value="entries">
          <AccountingEntriesTab
            key={entriesKey}
            highlightCode={highlightEntryCode}
            onHighlightHandled={() => setHighlightEntryCode(null)}
            budgetId={budgetId}
            onNavigateToAccount={handleNavigateToAccount}
          />
        </TabsContent>

        <TabsContent value="lines">
          <AccountingEntryLinesTab
            onNavigateToEntry={handleNavigateToEntry}
            onNavigateToAccount={handleNavigateToAccount}
            budgetId={budgetId}
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
          <AccountingBalanceReport budgetId={budgetId} />
        </TabsContent>

        <TabsContent value="vat">
          <VATReportTab budgetId={budgetId} />
        </TabsContent>
      </Tabs>

      <VoiceAssistantDialog
        open={voiceAssistantOpen}
        onOpenChange={setVoiceAssistantOpen}
        context="accounting"
        onActionDetected={handleVoiceAction}
      />
    </div>
  );
}
