import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Check, RefreshCw, Search, CheckSquare, Square, ArrowRight, Wallet, CreditCard, Building2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface AccountingEntry {
  id: string;
  code: string;
  description: string;
  entry_date: string;
  total_amount: number;
  entry_type: string | null;
  has_provisional_account: boolean;
  presupuesto?: {
    id: string;
    nombre: string;
    codigo_correlativo: number;
  };
}

interface AccountingAccount {
  id: string;
  name: string;
  account_type: string;
}

interface EntryLine {
  id: string;
  entry_id: string;
  account_id: string;
  description: string | null;
  debit_amount: number;
  credit_amount: number;
  account?: AccountingAccount;
}

interface Props {
  onEntryFixed?: () => void;
  onNavigateToEntry?: (entryCode: string) => void;
}

const ENTRY_TYPE_LABELS: Record<string, { label: string; icon: typeof Wallet }> = {
  compra: { label: 'Compra', icon: Building2 },
  venta: { label: 'Venta', icon: Building2 },
  cobro: { label: 'Cobro', icon: CreditCard },
  pago: { label: 'Pago', icon: Wallet },
};

export function ProvisionalAccountsAlerts({ onEntryFixed, onNavigateToEntry }: Props) {
  const [entries, setEntries] = useState<AccountingEntry[]>([]);
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [provisionalAccountId, setProvisionalAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [entryLines, setEntryLines] = useState<Map<string, EntryLine[]>>(new Map());
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [accountSearch, setAccountSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch accounts
      const { data: accountsData, error: accountsError } = await supabase
        .from('accounting_accounts')
        .select('*')
        .order('account_type')
        .order('name');

      if (accountsError) throw accountsError;
      setAccounts(accountsData || []);

      // Find provisional account
      const provisionalAccount = accountsData?.find(a => a.name === 'Cuenta Pendiente de Asignarse');
      setProvisionalAccountId(provisionalAccount?.id || null);

      // Fetch entries with provisional accounts
      const { data: entriesData, error: entriesError } = await supabase
        .from('accounting_entries')
        .select(`
          id, code, description, entry_date, total_amount, entry_type, has_provisional_account,
          presupuesto:presupuestos(id, nombre, codigo_correlativo)
        `)
        .eq('has_provisional_account', true)
        .order('entry_date', { ascending: false });

      if (entriesError) throw entriesError;
      setEntries(entriesData || []);

      // Fetch lines for these entries to show which accounts are provisional
      if (entriesData && entriesData.length > 0 && provisionalAccount) {
        const entryIds = entriesData.map(e => e.id);
        const { data: linesData, error: linesError } = await supabase
          .from('accounting_entry_lines')
          .select(`
            id, entry_id, account_id, description, debit_amount, credit_amount,
            account:accounting_accounts(id, name, account_type)
          `)
          .in('entry_id', entryIds);

        if (linesError) throw linesError;

        // Group lines by entry
        const linesByEntry = new Map<string, EntryLine[]>();
        linesData?.forEach(line => {
          const existing = linesByEntry.get(line.entry_id) || [];
          linesByEntry.set(line.entry_id, [...existing, line as unknown as EntryLine]);
        });
        setEntryLines(linesByEntry);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  const toggleEntrySelection = (entryId: string) => {
    const newSelection = new Set(selectedEntries);
    if (newSelection.has(entryId)) {
      newSelection.delete(entryId);
    } else {
      newSelection.add(entryId);
    }
    setSelectedEntries(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedEntries.size === entries.length) {
      setSelectedEntries(new Set());
    } else {
      setSelectedEntries(new Set(entries.map(e => e.id)));
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'dd/MM/yyyy', { locale: es });
  };

  const filteredAccounts = useMemo(() => {
    if (!accountSearch) return accounts.filter(a => a.id !== provisionalAccountId);
    const query = accountSearch.toLowerCase();
    return accounts.filter(a => 
      a.id !== provisionalAccountId &&
      (a.name.toLowerCase().includes(query) || a.account_type.toLowerCase().includes(query))
    );
  }, [accounts, accountSearch, provisionalAccountId]);

  const groupedAccounts = useMemo(() => {
    const groups = new Map<string, AccountingAccount[]>();
    filteredAccounts.forEach(account => {
      const existing = groups.get(account.account_type) || [];
      groups.set(account.account_type, [...existing, account]);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredAccounts]);

  const handleBulkAssign = async () => {
    if (!selectedAccountId || selectedEntries.size === 0) {
      toast.error('Selecciona asientos y una cuenta destino');
      return;
    }

    setSaving(true);
    try {
      // Update all lines that have the provisional account to the new account
      for (const entryId of selectedEntries) {
        const lines = entryLines.get(entryId) || [];
        const provisionalLines = lines.filter(l => l.account_id === provisionalAccountId);

        for (const line of provisionalLines) {
          const { error } = await supabase
            .from('accounting_entry_lines')
            .update({ account_id: selectedAccountId })
            .eq('id', line.id);

          if (error) throw error;
        }

        // Check if this entry still has provisional accounts
        const remainingProvisionalLines = lines.filter(l => 
          l.account_id === provisionalAccountId && !provisionalLines.some(pl => pl.id === l.id)
        );

        if (remainingProvisionalLines.length === 0) {
          // Update entry to mark as fixed
          const { error: entryError } = await supabase
            .from('accounting_entries')
            .update({ has_provisional_account: false })
            .eq('id', entryId);

          if (entryError) throw entryError;
        }
      }

      toast.success(`${selectedEntries.size} asiento(s) actualizado(s)`);
      setBulkAssignOpen(false);
      setSelectedEntries(new Set());
      setSelectedAccountId('');
      fetchData();
      onEntryFixed?.();
    } catch (error) {
      console.error('Error assigning accounts:', error);
      toast.error('Error al asignar cuentas');
    } finally {
      setSaving(false);
    }
  };

  const getProvisionalLinesCount = (entryId: string) => {
    const lines = entryLines.get(entryId) || [];
    return lines.filter(l => l.account_id === provisionalAccountId).length;
  };

  const getProvisionalLinesDescription = (entryId: string) => {
    const lines = entryLines.get(entryId) || [];
    const provisionalLines = lines.filter(l => l.account_id === provisionalAccountId);
    return provisionalLines.map(l => {
      const type = l.debit_amount > 0 ? 'Debe' : 'Haber';
      const amount = l.debit_amount > 0 ? l.debit_amount : l.credit_amount;
      return `${type}: ${formatCurrency(amount)}`;
    }).join(', ');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="rounded-full bg-primary/10 p-4 mb-4">
            <Check className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Sin asientos pendientes</h3>
          <p className="text-muted-foreground text-center max-w-md">
            Todos los asientos tienen sus cuentas contables correctamente asignadas.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-destructive/10 p-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <CardTitle className="text-lg">Asientos con Cuentas Pendientes</CardTitle>
                <CardDescription>
                  {entries.length} asiento(s) requieren asignación de cuentas contables
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchData}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Actualizar
              </Button>
              {selectedEntries.size > 0 && (
                <Button
                  size="sm"
                  onClick={() => setBulkAssignOpen(true)}
                  className="gap-2"
                >
                  <ArrowRight className="h-4 w-4" />
                  Asignar cuenta ({selectedEntries.size})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedEntries.size === entries.length && entries.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Presupuesto</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                  <TableHead>Cuentas Pendientes</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map(entry => {
                  const TypeIcon = entry.entry_type ? ENTRY_TYPE_LABELS[entry.entry_type]?.icon : null;
                  const provisionalCount = getProvisionalLinesCount(entry.id);
                  
                  return (
                    <TableRow key={entry.id} className="bg-destructive/5">
                      <TableCell>
                        <Checkbox
                          checked={selectedEntries.has(entry.id)}
                          onCheckedChange={() => toggleEntrySelection(entry.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="link"
                          className="p-0 h-auto font-mono text-sm"
                          onClick={() => onNavigateToEntry?.(entry.code)}
                        >
                          {entry.code}
                        </Button>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(entry.entry_date)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={entry.description}>
                        {entry.description}
                      </TableCell>
                      <TableCell>
                        {entry.presupuesto && (
                          <Badge variant="outline" className="text-xs">
                            {entry.presupuesto.codigo_correlativo} - {entry.presupuesto.nombre}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {entry.entry_type && TypeIcon && (
                          <div className="flex items-center gap-1">
                            <TypeIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{ENTRY_TYPE_LABELS[entry.entry_type]?.label}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(entry.total_amount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive" className="text-xs">
                          {provisionalCount} apunte(s)
                        </Badge>
                        <div className="text-xs text-muted-foreground mt-1">
                          {getProvisionalLinesDescription(entry.id)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedEntries(new Set([entry.id]));
                            setBulkAssignOpen(true);
                          }}
                        >
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Assign Dialog */}
      <Dialog open={bulkAssignOpen} onOpenChange={setBulkAssignOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Asignar Cuenta Contable</DialogTitle>
            <DialogDescription>
              Asigna una cuenta contable a los {selectedEntries.size} asiento(s) seleccionado(s).
              Esto reemplazará la "Cuenta Pendiente de Asignarse" en todos los apuntes afectados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Selected entries summary */}
            <div className="rounded-lg border p-3 bg-muted/50">
              <div className="text-sm font-medium mb-2">Asientos seleccionados:</div>
              <div className="flex flex-wrap gap-2">
                {Array.from(selectedEntries).map(entryId => {
                  const entry = entries.find(e => e.id === entryId);
                  return entry ? (
                    <Badge key={entry.id} variant="outline" className="font-mono">
                      {entry.code}
                    </Badge>
                  ) : null;
                })}
              </div>
            </div>

            <Separator />

            {/* Account search and selection */}
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar cuenta contable..."
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <ScrollArea className="h-[300px] border rounded-lg">
                <div className="p-2 space-y-3">
                  {groupedAccounts.map(([accountType, accountList]) => (
                    <div key={accountType}>
                      <div className="text-xs font-semibold text-muted-foreground px-2 py-1 sticky top-0 bg-background">
                        {accountType}
                      </div>
                      <div className="space-y-1">
                        {accountList.map(account => (
                          <div
                            key={account.id}
                            className={`p-3 rounded-md cursor-pointer transition-colors ${
                              selectedAccountId === account.id
                                ? 'bg-primary/10 border border-primary'
                                : 'hover:bg-muted'
                            }`}
                            onClick={() => setSelectedAccountId(account.id)}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{account.name}</span>
                              {selectedAccountId === account.id && (
                                <Check className="h-4 w-4 text-primary" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {groupedAccounts.length === 0 && (
                    <div className="p-4 text-center text-muted-foreground">
                      No se encontraron cuentas{accountSearch && ` para "${accountSearch}"`}
                    </div>
                  )}
                </div>
              </ScrollArea>

              {selectedAccountId && (
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="text-sm text-muted-foreground mb-1">Cuenta seleccionada:</div>
                  <div className="font-medium">
                    {accounts.find(a => a.id === selectedAccountId)?.name}
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkAssignOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleBulkAssign} 
              disabled={!selectedAccountId || saving}
              className="gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Asignando...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Asignar Cuenta
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
