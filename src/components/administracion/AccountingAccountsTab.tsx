import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Pencil, Trash2, List, Layers, Search, X, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { AccountDetailView } from './AccountDetailView';

interface AccountingAccount {
  id: string;
  name: string;
  account_type: string;
  created_at: string;
  total_debit?: number;
  total_credit?: number;
  balance?: number;
}

interface AccountForm {
  name: string;
  account_type: string;
}

const ACCOUNT_TYPES = [
  'Compras y gastos',
  'Ventas e ingresos',
  'Clientes',
  'Proveedores',
  'Impuestos',
  'Tesorería'
];

const emptyForm: AccountForm = {
  name: '',
  account_type: ''
};

interface Props {
  highlightAccountId?: string | null;
  onHighlightHandled?: () => void;
  onNavigateToEntry?: (entryCode: number) => void;
}

export function AccountingAccountsTab({ highlightAccountId, onHighlightHandled, onNavigateToEntry }: Props) {
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountingAccount | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<AccountingAccount | null>(null);
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'alphabetic' | 'grouped'>('alphabetic');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<AccountingAccount | null>(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  // Handle highlight from navigation
  useEffect(() => {
    if (highlightAccountId && accounts.length > 0) {
      const accountToHighlight = accounts.find(a => a.id === highlightAccountId);
      if (accountToHighlight) {
        setSearchQuery(accountToHighlight.name);
        setTimeout(() => {
          const element = document.getElementById(`account-${highlightAccountId}`);
          element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
      onHighlightHandled?.();
    }
  }, [highlightAccountId, accounts, onHighlightHandled]);

  const fetchAccounts = async () => {
    try {
      const { data: accountsData, error: accountsError } = await supabase
        .from('accounting_accounts')
        .select('*')
        .order('name', { ascending: true });

      if (accountsError) throw accountsError;

      const { data: linesData, error: linesError } = await supabase
        .from('accounting_entry_lines')
        .select('account_id, debit_amount, credit_amount');

      if (linesError) throw linesError;

      const accountTotals = new Map<string, { debit: number; credit: number }>();
      linesData?.forEach(line => {
        const current = accountTotals.get(line.account_id) || { debit: 0, credit: 0 };
        current.debit += Number(line.debit_amount) || 0;
        current.credit += Number(line.credit_amount) || 0;
        accountTotals.set(line.account_id, current);
      });

      const enrichedAccounts = accountsData?.map(account => {
        const totals = accountTotals.get(account.id) || { debit: 0, credit: 0 };
        return {
          ...account,
          total_debit: totals.debit,
          total_credit: totals.credit,
          balance: totals.debit - totals.credit
        };
      }) || [];

      setAccounts(enrichedAccounts);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      toast.error('Error al cargar las cuentas contables');
    } finally {
      setLoading(false);
    }
  };

  const filteredAccounts = useMemo(() => {
    if (!searchQuery.trim()) return accounts;
    const query = searchQuery.toLowerCase();
    return accounts.filter(account => 
      account.name.toLowerCase().includes(query) ||
      account.account_type.toLowerCase().includes(query)
    );
  }, [accounts, searchQuery]);

  const accountsGroupedByType = useMemo(() => {
    const grouped = new Map<string, AccountingAccount[]>();
    
    filteredAccounts.forEach(account => {
      const list = grouped.get(account.account_type) || [];
      list.push(account);
      grouped.set(account.account_type, list);
    });

    return ACCOUNT_TYPES
      .filter(type => grouped.has(type))
      .map(type => ({
        type,
        accounts: grouped.get(type) || [],
        totalDebit: (grouped.get(type) || []).reduce((sum, a) => sum + (a.total_debit || 0), 0),
        totalCredit: (grouped.get(type) || []).reduce((sum, a) => sum + (a.total_credit || 0), 0),
        totalBalance: (grouped.get(type) || []).reduce((sum, a) => sum + (a.balance || 0), 0)
      }));
  }, [filteredAccounts]);

  const handleOpenCreate = () => {
    setEditingAccount(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const handleOpenEdit = (account: AccountingAccount) => {
    setEditingAccount(account);
    setForm({
      name: account.name,
      account_type: account.account_type
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.account_type) {
      toast.error('Nombre y tipo de cuenta son obligatorios');
      return;
    }

    setSaving(true);
    try {
      if (editingAccount) {
        const { error } = await supabase
          .from('accounting_accounts')
          .update({
            name: form.name.trim(),
            account_type: form.account_type
          })
          .eq('id', editingAccount.id);

        if (error) throw error;
        toast.success('Cuenta actualizada');
      } else {
        const { error } = await supabase
          .from('accounting_accounts')
          .insert({
            name: form.name.trim(),
            account_type: form.account_type
          });

        if (error) throw error;
        toast.success('Cuenta creada');
      }

      setDialogOpen(false);
      fetchAccounts();
    } catch (error) {
      console.error('Error saving account:', error);
      toast.error('Error al guardar la cuenta');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!accountToDelete) return;

    try {
      const { error } = await supabase
        .from('accounting_accounts')
        .delete()
        .eq('id', accountToDelete.id);

      if (error) {
        if (error.code === '23503') {
          toast.error('No se puede eliminar: la cuenta tiene apuntes asociados');
        } else {
          throw error;
        }
        return;
      }

      toast.success('Cuenta eliminada');
      setDeleteDialogOpen(false);
      setAccountToDelete(null);
      fetchAccounts();
    } catch (error) {
      console.error('Error deleting account:', error);
      toast.error('Error al eliminar la cuenta');
    }
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'Compras y gastos': return 'destructive';
      case 'Ventas e ingresos': return 'default';
      case 'Clientes': return 'secondary';
      case 'Proveedores': return 'outline';
      case 'Impuestos': return 'destructive';
      case 'Tesorería': return 'default';
      default: return 'secondary';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: true }).format(amount);
  };

  const handleViewAccount = (account: AccountingAccount) => {
    setSelectedAccount(account);
  };

  const handleBackFromDetail = () => {
    setSelectedAccount(null);
  };

  const handleAccountUpdated = () => {
    fetchAccounts();
  };

  const handleNavigateToEntryFromDetail = (entryCode: number) => {
    setSelectedAccount(null);
    onNavigateToEntry?.(entryCode);
  };

  const renderAccountRow = (account: AccountingAccount) => (
    <TableRow key={account.id} id={`account-${account.id}`} className={highlightAccountId === account.id ? 'bg-primary/10' : ''}>
      <TableCell className="font-medium">{account.name}</TableCell>
      <TableCell>
        <Badge variant={getTypeBadgeColor(account.account_type) as any}>
          {account.account_type}
        </Badge>
      </TableCell>
      <TableCell className="text-right font-mono">
        {formatCurrency(account.total_debit || 0)}
      </TableCell>
      <TableCell className="text-right font-mono">
        {formatCurrency(account.total_credit || 0)}
      </TableCell>
      <TableCell className={`text-right font-mono font-semibold ${(account.balance || 0) < 0 ? 'text-destructive' : ''}`}>
        {formatCurrency(account.balance || 0)}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleViewAccount(account)}
            title="Ver detalle"
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleOpenEdit(account)}
            title="Editar"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setAccountToDelete(account);
              setDeleteDialogOpen(true);
            }}
            title="Eliminar"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Show detail view if an account is selected
  if (selectedAccount) {
    return (
      <AccountDetailView
        account={selectedAccount}
        onBack={handleBackFromDetail}
        onNavigateToEntry={handleNavigateToEntryFromDetail}
        onAccountUpdated={handleAccountUpdated}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-semibold">Cuentas Contables</h2>
          <p className="text-sm text-muted-foreground">
            Plan de cuentas con saldos actuales
            {searchQuery && ` • ${filteredAccounts.length} de ${accounts.length} cuentas`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cuenta..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-[200px]"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                onClick={() => setSearchQuery('')}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'alphabetic' | 'grouped')}>
            <TabsList>
              <TabsTrigger value="alphabetic" className="gap-2">
                <List className="h-4 w-4" />
                Alfabético
              </TabsTrigger>
              <TabsTrigger value="grouped" className="gap-2">
                <Layers className="h-4 w-4" />
                Por Tipo
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button onClick={handleOpenCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Nueva Cuenta
          </Button>
        </div>
      </div>

      {viewMode === 'alphabetic' ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Debe (€)</TableHead>
                  <TableHead className="text-right">Haber (€)</TableHead>
                  <TableHead className="text-right">Saldo (€)</TableHead>
                  <TableHead className="w-[100px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAccounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {searchQuery ? 'No hay cuentas que coincidan con la búsqueda.' : 'No hay cuentas contables. Crea la primera cuenta.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAccounts.map(renderAccountRow)
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {accountsGroupedByType.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No hay cuentas contables. Crea la primera cuenta.
              </CardContent>
            </Card>
          ) : (
            accountsGroupedByType.map((group) => (
              <Card key={group.type}>
                <CardHeader className="py-3 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={getTypeBadgeColor(group.type) as any}>
                        {group.type}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        ({group.accounts.length} cuentas)
                      </span>
                    </div>
                    <div className="text-right text-sm">
                      <span className="text-muted-foreground mr-4">
                        Debe: {formatCurrency(group.totalDebit)} | Haber: {formatCurrency(group.totalCredit)}
                      </span>
                      <span className={`font-semibold ${group.totalBalance < 0 ? 'text-destructive' : ''}`}>
                        Saldo: {formatCurrency(group.totalBalance)}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-right">Debe (€)</TableHead>
                        <TableHead className="text-right">Haber (€)</TableHead>
                        <TableHead className="text-right">Saldo (€)</TableHead>
                        <TableHead className="w-[100px]">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.accounts.map(renderAccountRow)}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingAccount ? 'Editar Cuenta Contable' : 'Nueva Cuenta Contable'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre de la cuenta *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej: Banco BBVA, IVA Soportado..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account_type">Tipo de cuenta *</Label>
              <Select
                value={form.account_type}
                onValueChange={(value) => setForm({ ...form, account_type: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un tipo" />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : editingAccount ? 'Guardar Cambios' : 'Crear Cuenta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Eliminar Cuenta Contable"
        description={`¿Estás seguro de que deseas eliminar la cuenta "${accountToDelete?.name}"? Esta acción no se puede deshacer.`}
      />
    </div>
  );
}
