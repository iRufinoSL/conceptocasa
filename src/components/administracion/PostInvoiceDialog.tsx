import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCircle, CheckCircle, Search, Plus, X, BookOpen } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency } from '@/lib/format-utils';

interface Presupuesto {
  id: string;
  nombre: string;
  codigo_correlativo: number;
  version: string;
}

interface AccountingAccount {
  id: string;
  name: string;
  account_type: string;
  contact_id?: string | null;
}

interface Invoice {
  id: string;
  invoice_number: number;
  invoice_date: string;
  description: string | null;
  budget_id: string | null;
  receiver_account_id: string | null;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  document_type: string;
  presupuesto?: {
    id: string;
    nombre: string;
    codigo_correlativo: number;
    version: string;
  } | null;
  receiver_account?: AccountingAccount | null;
}

interface Props {
  invoice: Invoice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPosted: () => void;
}

const VAT_ACCOUNTS: Record<number, string> = {
  21: 'IVA 21% Repercutido',
  10: 'IVA 10% Repercutido',
  4: 'IVA 4% Repercutido',
  0: 'IVA Exento Repercutido',
};

export function PostInvoiceDialog({ invoice, open, onOpenChange, onPosted }: Props) {
  const [saving, setSaving] = useState(false);
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [budgetSearch, setBudgetSearch] = useState('');
  const [salesAccountSearch, setSalesAccountSearch] = useState('');
  const [clientAccountSearch, setClientAccountSearch] = useState('');
  const [vatAccountSearch, setVatAccountSearch] = useState('');

  const [formData, setFormData] = useState({
    budget_id: invoice.budget_id || '',
    entry_date: invoice.invoice_date,
    description: invoice.description || `Factura nº ${invoice.invoice_number}`,
    sales_account_id: '',
    client_account_id: invoice.receiver_account_id || '',
    vat_account_id: '',
  });

  const [showCreateAccountDialog, setShowCreateAccountDialog] = useState(false);
  const [createAccountType, setCreateAccountType] = useState<'ventas' | 'cliente' | 'iva'>('ventas');
  const [savingAccount, setSavingAccount] = useState(false);
  const [newAccount, setNewAccount] = useState({
    name: '',
    account_type: 'Ventas e ingresos'
  });

  useEffect(() => {
    if (open) {
      fetchData();
      setFormData({
        budget_id: invoice.budget_id || '',
        entry_date: invoice.invoice_date,
        description: invoice.description || `Factura nº ${invoice.invoice_number}`,
        sales_account_id: '',
        client_account_id: invoice.receiver_account_id || '',
        vat_account_id: '',
      });
    }
  }, [open, invoice]);

  const fetchData = async () => {
    try {
      const [presupuestosRes, accountsRes] = await Promise.all([
        supabase
          .from('presupuestos')
          .select('id, nombre, codigo_correlativo, version')
          .eq('archived', false)
          .order('codigo_correlativo', { ascending: false }),
        supabase
          .from('accounting_accounts')
          .select('id, name, account_type, contact_id')
          .order('account_type')
          .order('name'),
      ]);

      if (presupuestosRes.data) setPresupuestos(presupuestosRes.data);
      if (accountsRes.data) {
        setAccounts(accountsRes.data);
        
        // Auto-select VAT account based on invoice VAT rate
        const vatAccountName = VAT_ACCOUNTS[invoice.vat_rate];
        if (vatAccountName) {
          const vatAccount = accountsRes.data.find(
            (a: AccountingAccount) => a.account_type === 'Impuestos' && 
            a.name.toLowerCase().includes('repercutido') &&
            a.name.includes(invoice.vat_rate.toString())
          );
          if (vatAccount) {
            setFormData(prev => ({ ...prev, vat_account_id: vatAccount.id }));
          }
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar los datos');
    }
  };

  // Filter accounts by type
  const salesAccounts = useMemo(() => 
    accounts.filter(a => a.account_type === 'Ventas e ingresos'), 
    [accounts]
  );

  const clientAccounts = useMemo(() => 
    accounts.filter(a => a.account_type === 'Clientes'), 
    [accounts]
  );

  const vatAccounts = useMemo(() => 
    accounts.filter(a => a.account_type === 'Impuestos' && a.name.toLowerCase().includes('repercutido')), 
    [accounts]
  );

  const filteredBudgets = presupuestos.filter(p =>
    budgetSearch === '' ||
    p.nombre.toLowerCase().includes(budgetSearch.toLowerCase()) ||
    p.codigo_correlativo.toString().includes(budgetSearch)
  );

  const filteredSalesAccounts = salesAccounts.filter(a =>
    salesAccountSearch === '' ||
    a.name.toLowerCase().includes(salesAccountSearch.toLowerCase())
  );

  const filteredClientAccounts = clientAccounts.filter(a =>
    clientAccountSearch === '' ||
    a.name.toLowerCase().includes(clientAccountSearch.toLowerCase())
  );

  const filteredVatAccounts = vatAccounts.filter(a =>
    vatAccountSearch === '' ||
    a.name.toLowerCase().includes(vatAccountSearch.toLowerCase())
  );

  const formatInvoiceNumber = (number: number, date: string): string => {
    const year = new Date(date).getFullYear().toString().slice(-2);
    const paddedNumber = String(number).padStart(4, '0');
    return `Factura #${paddedNumber}/${year}`;
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'dd/MM/yyyy', { locale: es });
  };

  const handleCreateAccount = async () => {
    if (!newAccount.name.trim()) {
      toast.error('Introduce un nombre para la cuenta');
      return;
    }

    setSavingAccount(true);
    try {
      const { data, error } = await supabase
        .from('accounting_accounts')
        .insert({
          name: newAccount.name.trim(),
          account_type: newAccount.account_type
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Cuenta creada');
      setAccounts(prev => [...prev, data]);
      
      // Auto-select the new account based on type
      if (createAccountType === 'ventas') {
        setFormData(prev => ({ ...prev, sales_account_id: data.id }));
      } else if (createAccountType === 'cliente') {
        setFormData(prev => ({ ...prev, client_account_id: data.id }));
      } else if (createAccountType === 'iva') {
        setFormData(prev => ({ ...prev, vat_account_id: data.id }));
      }
      
      setShowCreateAccountDialog(false);
      setNewAccount({ name: '', account_type: 'Ventas e ingresos' });
    } catch (error) {
      console.error('Error creating account:', error);
      toast.error('Error al crear la cuenta');
    } finally {
      setSavingAccount(false);
    }
  };

  const openCreateAccount = (type: 'ventas' | 'cliente' | 'iva') => {
    setCreateAccountType(type);
    setNewAccount({
      name: '',
      account_type: type === 'ventas' ? 'Ventas e ingresos' : 
                    type === 'cliente' ? 'Clientes' : 'Impuestos'
    });
    setShowCreateAccountDialog(true);
  };

  const handlePost = async () => {
    if (!formData.budget_id) {
      toast.error('Selecciona un presupuesto');
      return;
    }
    if (!formData.sales_account_id) {
      toast.error('Selecciona una cuenta de ventas');
      return;
    }
    if (!formData.client_account_id) {
      toast.error('Selecciona una cuenta de cliente');
      return;
    }
    if (invoice.vat_rate > 0 && !formData.vat_account_id) {
      toast.error('Selecciona una cuenta de IVA');
      return;
    }

    setSaving(true);
    try {
      // 1. Generate entry code
      const entryYear = new Date(formData.entry_date).getFullYear();
      const { data: codeData, error: codeError } = await supabase
        .rpc('generate_entry_code', { entry_year: entryYear });

      if (codeError) throw codeError;

      // 2. Create the accounting entry
      const { data: entry, error: entryError } = await supabase
        .from('accounting_entries')
        .insert({
          code: codeData,
          budget_id: formData.budget_id,
          description: formData.description,
          entry_date: formData.entry_date,
          total_amount: invoice.total,
          entry_type: 'venta',
          vat_rate: invoice.vat_rate
        })
        .select()
        .single();

      if (entryError) throw entryError;

      // 3. Create entry lines
      const entryLines = [];

      // Debit: Client account (total amount)
      entryLines.push({
        entry_id: entry.id,
        account_id: formData.client_account_id,
        line_date: formData.entry_date,
        description: `${formData.description} - Cliente`,
        debit_amount: invoice.total,
        credit_amount: 0
      });

      // Credit: Sales account (subtotal/base)
      entryLines.push({
        entry_id: entry.id,
        account_id: formData.sales_account_id,
        line_date: formData.entry_date,
        description: `${formData.description} - Base imponible`,
        debit_amount: 0,
        credit_amount: invoice.subtotal
      });

      // Credit: VAT account (vat amount) - only if vat > 0
      if (invoice.vat_rate > 0 && invoice.vat_amount > 0) {
        entryLines.push({
          entry_id: entry.id,
          account_id: formData.vat_account_id,
          line_date: formData.entry_date,
          description: `${formData.description} - IVA ${invoice.vat_rate}%`,
          debit_amount: 0,
          credit_amount: invoice.vat_amount
        });
      }

      const { error: linesError } = await supabase
        .from('accounting_entry_lines')
        .insert(entryLines);

      if (linesError) throw linesError;

      // 4. Update invoice to mark as posted
      const { error: updateError } = await supabase
        .from('invoices')
        .update({
          is_posted: true,
          accounting_entry_id: entry.id
        })
        .eq('id', invoice.id);

      if (updateError) throw updateError;

      toast.success(`Factura contabilizada con asiento ${codeData}`);
      onPosted();
      onOpenChange(false);
    } catch (error) {
      console.error('Error posting invoice:', error);
      toast.error('Error al contabilizar la factura');
    } finally {
      setSaving(false);
    }
  };

  // Calculate preview
  const selectedBudget = presupuestos.find(p => p.id === formData.budget_id);
  const selectedSalesAccount = accounts.find(a => a.id === formData.sales_account_id);
  const selectedClientAccount = accounts.find(a => a.id === formData.client_account_id);
  const selectedVatAccount = accounts.find(a => a.id === formData.vat_account_id);

  const isValid = formData.budget_id && formData.sales_account_id && formData.client_account_id && 
    (invoice.vat_rate === 0 || formData.vat_account_id);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Contabilizar Factura de Venta
            </DialogTitle>
            <DialogDescription>
              Genera el asiento contable para la factura seleccionada
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-6 py-4">
              {/* Invoice Summary */}
              <Card>
                <CardContent className="pt-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-sm text-muted-foreground">Factura</div>
                      <div className="font-semibold">
                        {formatInvoiceNumber(invoice.invoice_number, invoice.invoice_date)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Fecha</div>
                      <div className="font-medium">{formatDate(invoice.invoice_date)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Cliente</div>
                      <div className="font-medium">{invoice.receiver_account?.name || 'No definido'}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Total</div>
                      <div className="font-semibold text-lg">{formatCurrency(invoice.total)}</div>
                    </div>
                  </div>
                  <Separator className="my-4" />
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Base: </span>
                      <span className="font-medium">{formatCurrency(invoice.subtotal)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">IVA {invoice.vat_rate}%: </span>
                      <span className="font-medium">{formatCurrency(invoice.vat_amount)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total: </span>
                      <span className="font-semibold">{formatCurrency(invoice.total)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Configuration */}
              <div className="space-y-4">
                {/* Budget Selection */}
                <div className="space-y-2">
                  <Label>Presupuesto *</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar presupuesto..."
                      value={budgetSearch}
                      onChange={(e) => setBudgetSearch(e.target.value)}
                      className="pl-9"
                    />
                    {budgetSearch && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                        onClick={() => setBudgetSearch('')}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  {formData.budget_id && selectedBudget && (
                    <Badge variant="secondary" className="gap-1">
                      {selectedBudget.codigo_correlativo} - {selectedBudget.nombre}
                      <X 
                        className="h-3 w-3 cursor-pointer" 
                        onClick={() => setFormData(prev => ({ ...prev, budget_id: '' }))}
                      />
                    </Badge>
                  )}
                  <div className="max-h-32 overflow-y-auto border rounded-md">
                    {filteredBudgets.map((p) => (
                      <div
                        key={p.id}
                        className={`px-3 py-2 cursor-pointer hover:bg-muted ${
                          formData.budget_id === p.id ? 'bg-primary/10' : ''
                        }`}
                        onClick={() => setFormData(prev => ({ ...prev, budget_id: p.id }))}
                      >
                        <span className="font-medium">{p.codigo_correlativo}</span>
                        <span className="text-muted-foreground"> - {p.nombre}</span>
                        <span className="text-xs text-muted-foreground ml-2">({p.version})</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Entry Date */}
                <div className="space-y-2">
                  <Label htmlFor="entry_date">Fecha del Asiento</Label>
                  <Input
                    id="entry_date"
                    type="date"
                    value={formData.entry_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, entry_date: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Por defecto, la fecha de la factura
                  </p>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">Descripción del Asiento</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Descripción del asiento contable..."
                  />
                </div>

                <Separator />

                {/* Accounts Selection */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Sales Account */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Cuenta de Ventas (Haber) *</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openCreateAccount('ventas')}
                        className="h-6 text-xs"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Nueva
                      </Button>
                    </div>
                    <Select
                      value={formData.sales_account_id}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, sales_account_id: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar cuenta de ventas..." />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="p-2">
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                            <Input
                              placeholder="Buscar..."
                              value={salesAccountSearch}
                              onChange={(e) => setSalesAccountSearch(e.target.value)}
                              className="h-8 pl-7 text-sm"
                            />
                          </div>
                        </div>
                        {filteredSalesAccounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Base imponible: {formatCurrency(invoice.subtotal)}
                    </p>
                  </div>

                  {/* Client Account */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Cuenta de Cliente (Debe) *</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openCreateAccount('cliente')}
                        className="h-6 text-xs"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Nueva
                      </Button>
                    </div>
                    <Select
                      value={formData.client_account_id}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, client_account_id: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar cuenta de cliente..." />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="p-2">
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                            <Input
                              placeholder="Buscar..."
                              value={clientAccountSearch}
                              onChange={(e) => setClientAccountSearch(e.target.value)}
                              className="h-8 pl-7 text-sm"
                            />
                          </div>
                        </div>
                        {filteredClientAccounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Total factura: {formatCurrency(invoice.total)}
                    </p>
                  </div>
                </div>

                {/* VAT Account */}
                {invoice.vat_rate > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Cuenta de IVA {invoice.vat_rate}% Repercutido (Haber) *</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openCreateAccount('iva')}
                        className="h-6 text-xs"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Nueva
                      </Button>
                    </div>
                    <Select
                      value={formData.vat_account_id}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, vat_account_id: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar cuenta de IVA..." />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="p-2">
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                            <Input
                              placeholder="Buscar..."
                              value={vatAccountSearch}
                              onChange={(e) => setVatAccountSearch(e.target.value)}
                              className="h-8 pl-7 text-sm"
                            />
                          </div>
                        </div>
                        {filteredVatAccounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Importe IVA: {formatCurrency(invoice.vat_amount)}
                    </p>
                  </div>
                )}

                <Separator />

                {/* Entry Preview */}
                <div className="space-y-2">
                  <Label>Vista Previa del Asiento</Label>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">Código del asiento:</span>
                          <span className="text-muted-foreground">Se generará automáticamente</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">Fecha:</span>
                          <span>{formatDate(formData.entry_date)}</span>
                        </div>
                        {selectedBudget && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">Presupuesto:</span>
                            <span>{selectedBudget.codigo_correlativo} - {selectedBudget.nombre}</span>
                          </div>
                        )}
                      </div>
                      
                      <Separator className="my-3" />
                      
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2">Cuenta</th>
                            <th className="text-right py-2">Debe</th>
                            <th className="text-right py-2">Haber</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b">
                            <td className="py-2">
                              {selectedClientAccount?.name || (
                                <span className="text-muted-foreground italic">
                                  Cuenta de Cliente (pendiente)
                                </span>
                              )}
                            </td>
                            <td className="text-right py-2 font-medium text-green-600">
                              {formatCurrency(invoice.total)}
                            </td>
                            <td className="text-right py-2">-</td>
                          </tr>
                          <tr className="border-b">
                            <td className="py-2">
                              {selectedSalesAccount?.name || (
                                <span className="text-muted-foreground italic">
                                  Cuenta de Ventas (pendiente)
                                </span>
                              )}
                            </td>
                            <td className="text-right py-2">-</td>
                            <td className="text-right py-2 font-medium text-blue-600">
                              {formatCurrency(invoice.subtotal)}
                            </td>
                          </tr>
                          {invoice.vat_rate > 0 && (
                            <tr className="border-b">
                              <td className="py-2">
                                {selectedVatAccount?.name || (
                                  <span className="text-muted-foreground italic">
                                    Cuenta de IVA (pendiente)
                                  </span>
                                )}
                              </td>
                              <td className="text-right py-2">-</td>
                              <td className="text-right py-2 font-medium text-blue-600">
                                {formatCurrency(invoice.vat_amount)}
                              </td>
                            </tr>
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="font-semibold">
                            <td className="py-2">Total</td>
                            <td className="text-right py-2">{formatCurrency(invoice.total)}</td>
                            <td className="text-right py-2">{formatCurrency(invoice.total)}</td>
                          </tr>
                        </tfoot>
                      </table>
                      
                      {isValid ? (
                        <Alert className="mt-4">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <AlertTitle>Asiento equilibrado</AlertTitle>
                          <AlertDescription>
                            El asiento está correctamente equilibrado. Debe = Haber
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <Alert variant="destructive" className="mt-4">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Faltan datos</AlertTitle>
                          <AlertDescription>
                            Selecciona todas las cuentas necesarias para continuar
                          </AlertDescription>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handlePost} disabled={saving || !isValid}>
              {saving ? 'Contabilizando...' : 'Contabilizar Factura'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Account Dialog */}
      <Dialog open={showCreateAccountDialog} onOpenChange={setShowCreateAccountDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva Cuenta Contable</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre de la Cuenta *</Label>
              <Input
                value={newAccount.name}
                onChange={(e) => setNewAccount(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Nombre de la cuenta..."
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Cuenta</Label>
              <Select
                value={newAccount.account_type}
                onValueChange={(value) => setNewAccount(prev => ({ ...prev, account_type: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ventas e ingresos">Ventas e ingresos</SelectItem>
                  <SelectItem value="Clientes">Clientes</SelectItem>
                  <SelectItem value="Impuestos">Impuestos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateAccountDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateAccount} disabled={savingAccount}>
              {savingAccount ? 'Creando...' : 'Crear Cuenta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
