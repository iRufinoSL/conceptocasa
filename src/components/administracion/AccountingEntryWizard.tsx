import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, ArrowRight, Check, ShoppingCart, Receipt, CreditCard, Wallet, Search, X, AlertTriangle, CheckCircle, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';

const ACCOUNT_TYPES = [
  'Compras y gastos',
  'Ventas e ingresos',
  'Clientes',
  'Proveedores',
  'Impuestos',
  'Tesorería'
];

const ENTRY_TYPES = [
  { value: 'compra', label: 'Compra / Gasto', icon: ShoppingCart, description: 'Registro de compras y gastos realizados' },
  { value: 'venta', label: 'Venta / Ingreso', icon: Receipt, description: 'Registro de ventas e ingresos obtenidos' },
  { value: 'cobro', label: 'Cobro', icon: CreditCard, description: 'Registro de cobros recibidos de clientes' },
  { value: 'pago', label: 'Pago', icon: Wallet, description: 'Registro de pagos realizados a proveedores' },
];

const VAT_RATES = [
  { value: 21, label: '21% (General)' },
  { value: 10, label: '10% (Reducido)' },
  { value: 4, label: '4% (Superreducido)' },
  { value: 0, label: '0% (Exento)' },
];

interface Presupuesto {
  id: string;
  nombre: string;
  codigo_correlativo: number;
  version: string;
}

interface Contact {
  id: string;
  name: string;
  surname: string | null;
  contact_type: string;
}

interface AccountingAccount {
  id: string;
  name: string;
  account_type: string;
}

interface WizardFormData {
  entry_type: string;
  budget_id: string | null;
  description: string;
  entry_date: string;
  total_amount: string;
  vat_rate: number;
  supplier_id: string;
  expense_account_id: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEntryCreated: () => void;
}

export function AccountingEntryWizard({ open, onOpenChange, onEntryCreated }: Props) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [budgetSearch, setBudgetSearch] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const [showCreateAccountDialog, setShowCreateAccountDialog] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [newAccount, setNewAccount] = useState({
    name: '',
    account_type: 'Compras y gastos'
  });

  const [formData, setFormData] = useState<WizardFormData>({
    entry_type: 'compra',
    budget_id: null,
    description: '',
    entry_date: format(new Date(), 'yyyy-MM-dd'),
    total_amount: '',
    vat_rate: 21,
    supplier_id: '',
    expense_account_id: '',
  });

  useEffect(() => {
    if (open) {
      fetchData();
      resetForm();
    }
  }, [open]);

  const resetForm = () => {
    setStep(1);
    setFormData({
      entry_type: 'compra',
      budget_id: null,
      description: '',
      entry_date: format(new Date(), 'yyyy-MM-dd'),
      total_amount: '',
      vat_rate: 21,
      supplier_id: '',
      expense_account_id: '',
    });
    setBudgetSearch('');
    setContactSearch('');
    setAccountSearch('');
  };

  const fetchData = async () => {
    try {
      const [presupuestosRes, contactsRes, accountsRes] = await Promise.all([
        supabase
          .from('presupuestos')
          .select('id, nombre, codigo_correlativo, version')
          .eq('archived', false)
          .order('codigo_correlativo', { ascending: false }),
        supabase
          .from('crm_contacts')
          .select('id, name, surname, contact_type')
          .order('name'),
        supabase
          .from('accounting_accounts')
          .select('*')
          .order('account_type')
          .order('name'),
      ]);

      if (presupuestosRes.data) setPresupuestos(presupuestosRes.data);
      if (contactsRes.data) setContacts(contactsRes.data);
      if (accountsRes.data) setAccounts(accountsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar los datos');
    }
  };

  const filteredBudgets = presupuestos.filter(p => 
    budgetSearch === '' ||
    p.nombre.toLowerCase().includes(budgetSearch.toLowerCase()) ||
    p.codigo_correlativo.toString().includes(budgetSearch)
  );

  const filteredContacts = contacts.filter(c => {
    if (contactSearch === '') return true;
    const fullName = `${c.name} ${c.surname || ''}`.toLowerCase();
    return fullName.includes(contactSearch.toLowerCase());
  });

  const getFilteredAccounts = () => {
    const typeFilter = formData.entry_type === 'compra' ? 'Compras y gastos' : 
                        formData.entry_type === 'venta' ? 'Ventas e ingresos' :
                        formData.entry_type === 'cobro' ? 'Tesorería' :
                        formData.entry_type === 'pago' ? 'Tesorería' : '';
    
    return accounts.filter(a => {
      if (accountSearch === '') {
        return a.account_type === typeFilter;
      }
      return a.name.toLowerCase().includes(accountSearch.toLowerCase()) ||
             a.account_type.toLowerCase().includes(accountSearch.toLowerCase());
    });
  };

  const getDefaultAccountType = () => {
    switch (formData.entry_type) {
      case 'compra': return 'Compras y gastos';
      case 'venta': return 'Ventas e ingresos';
      case 'cobro': return 'Tesorería';
      case 'pago': return 'Tesorería';
      default: return 'Compras y gastos';
    }
  };

  const handleOpenCreateAccount = () => {
    setNewAccount({
      name: accountSearch,
      account_type: getDefaultAccountType()
    });
    setShowCreateAccountDialog(true);
  };

  const handleCreateAccount = async () => {
    if (!newAccount.name.trim()) {
      toast.error('El nombre de la cuenta es obligatorio');
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

      toast.success('Cuenta contable creada');
      setShowCreateAccountDialog(false);
      setNewAccount({ name: '', account_type: 'Compras y gastos' });
      setAccountSearch('');
      
      // Add to accounts list and select it
      if (data) {
        setAccounts(prev => [...prev, data]);
        setFormData(prev => ({ ...prev, expense_account_id: data.id }));
      }
    } catch (error) {
      console.error('Error creating account:', error);
      toast.error('Error al crear la cuenta contable');
    } finally {
      setSavingAccount(false);
    }
  };

  const getContactLabel = () => {
    switch (formData.entry_type) {
      case 'compra': return 'Proveedor';
      case 'venta': return 'Cliente';
      case 'cobro': return 'Cliente';
      case 'pago': return 'Proveedor';
      default: return 'Contacto';
    }
  };

  const getAccountLabel = () => {
    switch (formData.entry_type) {
      case 'compra': return 'Cuenta de Gasto';
      case 'venta': return 'Cuenta de Ingreso';
      case 'cobro': return 'Cuenta de Tesorería';
      case 'pago': return 'Cuenta de Tesorería';
      default: return 'Cuenta';
    }
  };

  const getTotalSteps = () => {
    // compra/venta: 7 steps (type, budget, description, date/amount, vat, contact, account)
    // cobro/pago: 5 steps (type, budget, description, date/amount, contact) - no VAT, no expense account
    return ['cobro', 'pago'].includes(formData.entry_type) ? 5 : 7;
  };

  const canProceed = () => {
    switch (step) {
      case 1: return formData.entry_type !== '';
      case 2: return true; // Budget is optional
      case 3: return formData.description.trim() !== '';
      case 4: return formData.total_amount !== '' && parseFloat(formData.total_amount) > 0;
      case 5:
        if (['cobro', 'pago'].includes(formData.entry_type)) {
          return formData.supplier_id !== '';
        }
        return true; // VAT step for compra/venta
      case 6: return formData.supplier_id !== '';
      case 7: return formData.expense_account_id !== '';
      default: return false;
    }
  };

  const nextStep = () => {
    if (canProceed()) {
      setStep(step + 1);
    }
  };

  const prevStep = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const calculateAmounts = () => {
    const total = parseFloat(formData.total_amount) || 0;
    const vatRate = formData.vat_rate;
    
    // For compra/venta, calculate base and VAT from total
    // total = base + vat = base + (base * vatRate / 100) = base * (1 + vatRate/100)
    // base = total / (1 + vatRate/100)
    const base = total / (1 + vatRate / 100);
    const vat = total - base;
    
    return { total, base, vat, vatRate };
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', { 
      style: 'currency', 
      currency: 'EUR', 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    }).format(amount);
  };

  const getVATAccountId = async () => {
    // Find or create VAT account based on entry type and rate
    const vatAccountName = formData.entry_type === 'compra' 
      ? `IVA ${formData.vat_rate}% Soportado`
      : `IVA ${formData.vat_rate}% Repercutido`;
    
    let vatAccount = accounts.find(a => 
      a.name === vatAccountName && a.account_type === 'Impuestos'
    );
    
    if (!vatAccount) {
      // Create the VAT account
      const { data, error } = await supabase
        .from('accounting_accounts')
        .insert({
          name: vatAccountName,
          account_type: 'Impuestos'
        })
        .select()
        .single();
      
      if (error) throw error;
      vatAccount = data;
    }
    
    return vatAccount?.id;
  };

  const getContactAccountId = async () => {
    const contact = contacts.find(c => c.id === formData.supplier_id);
    if (!contact) return null;
    
    const contactFullName = `${contact.name}${contact.surname ? ' ' + contact.surname : ''}`;
    const accountType = ['compra', 'pago'].includes(formData.entry_type) ? 'Proveedores' : 'Clientes';
    
    let contactAccount = accounts.find(a => 
      a.name === contactFullName && a.account_type === accountType
    );
    
    if (!contactAccount) {
      // Create the contact account
      const { data, error } = await supabase
        .from('accounting_accounts')
        .insert({
          name: contactFullName,
          account_type: accountType
        })
        .select()
        .single();
      
      if (error) throw error;
      contactAccount = data;
    }
    
    return contactAccount?.id;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { total, base, vat } = calculateAmounts();
      
      // Get the year from the entry date
      const entryYear = new Date(formData.entry_date).getFullYear();
      
      // Generate the entry code using the SQL function
      const { data: codeData, error: codeError } = await supabase
        .rpc('generate_entry_code', { entry_year: entryYear });
      
      if (codeError) throw codeError;
      
      // Create the entry with the generated code
      const { data: entry, error: entryError } = await supabase
        .from('accounting_entries')
        .insert({
          code: codeData,
          description: formData.description.trim(),
          entry_date: formData.entry_date,
          budget_id: formData.budget_id || presupuestos[0]?.id, // Fallback to first budget if none selected
          total_amount: total,
          entry_type: formData.entry_type,
          supplier_id: formData.supplier_id || null,
          vat_rate: formData.vat_rate,
          expense_account_id: formData.expense_account_id || null,
        })
        .select()
        .single();

      if (entryError) throw entryError;

      // Create entry lines based on entry type
      const lines = [];
      
      if (formData.entry_type === 'compra') {
        // Debit: Expense account (base amount)
        lines.push({
          entry_id: entry.id,
          account_id: formData.expense_account_id,
          line_date: formData.entry_date,
          description: 'Gasto',
          debit_amount: base,
          credit_amount: 0,
        });
        
        // Debit: VAT account (if VAT > 0)
        if (vat > 0) {
          const vatAccountId = await getVATAccountId();
          if (vatAccountId) {
            lines.push({
              entry_id: entry.id,
              account_id: vatAccountId,
              line_date: formData.entry_date,
              description: `IVA ${formData.vat_rate}% Soportado`,
              debit_amount: vat,
              credit_amount: 0,
            });
          }
        }
        
        // Credit: Supplier account (total)
        const supplierAccountId = await getContactAccountId();
        if (supplierAccountId) {
          lines.push({
            entry_id: entry.id,
            account_id: supplierAccountId,
            line_date: formData.entry_date,
            description: 'Proveedor',
            debit_amount: 0,
            credit_amount: total,
          });
        }
      } else if (formData.entry_type === 'venta') {
        // Debit: Customer account (total)
        const customerAccountId = await getContactAccountId();
        if (customerAccountId) {
          lines.push({
            entry_id: entry.id,
            account_id: customerAccountId,
            line_date: formData.entry_date,
            description: 'Cliente',
            debit_amount: total,
            credit_amount: 0,
          });
        }
        
        // Credit: Income account (base amount)
        lines.push({
          entry_id: entry.id,
          account_id: formData.expense_account_id, // In this case it's income account
          line_date: formData.entry_date,
          description: 'Ingreso',
          debit_amount: 0,
          credit_amount: base,
        });
        
        // Credit: VAT account (if VAT > 0)
        if (vat > 0) {
          const vatAccountId = await getVATAccountId();
          if (vatAccountId) {
            lines.push({
              entry_id: entry.id,
              account_id: vatAccountId,
              line_date: formData.entry_date,
              description: `IVA ${formData.vat_rate}% Repercutido`,
              debit_amount: 0,
              credit_amount: vat,
            });
          }
        }
      } else if (formData.entry_type === 'cobro') {
        // Debit: Treasury account (total)
        // Credit: Customer account (total)
        const customerAccountId = await getContactAccountId();
        if (customerAccountId) {
          lines.push({
            entry_id: entry.id,
            account_id: customerAccountId,
            line_date: formData.entry_date,
            description: 'Cobro de cliente',
            debit_amount: 0,
            credit_amount: total,
          });
        }
        
        // We need a treasury account - use a default or create one
        let treasuryAccount = accounts.find(a => a.account_type === 'Tesorería');
        if (!treasuryAccount) {
          const { data } = await supabase
            .from('accounting_accounts')
            .insert({ name: 'Caja', account_type: 'Tesorería' })
            .select()
            .single();
          treasuryAccount = data;
        }
        
        if (treasuryAccount) {
          lines.push({
            entry_id: entry.id,
            account_id: treasuryAccount.id,
            line_date: formData.entry_date,
            description: 'Entrada en caja',
            debit_amount: total,
            credit_amount: 0,
          });
        }
      } else if (formData.entry_type === 'pago') {
        // Debit: Supplier account (total)
        const supplierAccountId = await getContactAccountId();
        if (supplierAccountId) {
          lines.push({
            entry_id: entry.id,
            account_id: supplierAccountId,
            line_date: formData.entry_date,
            description: 'Pago a proveedor',
            debit_amount: total,
            credit_amount: 0,
          });
        }
        
        // Credit: Treasury account (total)
        let treasuryAccount = accounts.find(a => a.account_type === 'Tesorería');
        if (!treasuryAccount) {
          const { data } = await supabase
            .from('accounting_accounts')
            .insert({ name: 'Caja', account_type: 'Tesorería' })
            .select()
            .single();
          treasuryAccount = data;
        }
        
        if (treasuryAccount) {
          lines.push({
            entry_id: entry.id,
            account_id: treasuryAccount.id,
            line_date: formData.entry_date,
            description: 'Salida de caja',
            debit_amount: 0,
            credit_amount: total,
          });
        }
      }

      // Insert all lines
      if (lines.length > 0) {
        const { error: linesError } = await supabase
          .from('accounting_entry_lines')
          .insert(lines);
        
        if (linesError) throw linesError;
      }

      toast.success('Asiento creado correctamente');
      onOpenChange(false);
      onEntryCreated();
    } catch (error) {
      console.error('Error creating entry:', error);
      toast.error('Error al crear el asiento');
    } finally {
      setSaving(false);
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <h3 className="font-medium text-lg">1. Tipo de Asiento</h3>
            <p className="text-sm text-muted-foreground">Selecciona el tipo de operación contable</p>
            <RadioGroup
              value={formData.entry_type}
              onValueChange={(value) => setFormData({ ...formData, entry_type: value })}
              className="grid grid-cols-2 gap-4"
            >
              {ENTRY_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <Label
                    key={type.value}
                    htmlFor={type.value}
                    className={`flex flex-col items-center gap-2 p-4 border rounded-lg cursor-pointer transition-all ${
                      formData.entry_type === type.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <RadioGroupItem value={type.value} id={type.value} className="sr-only" />
                    <Icon className={`h-8 w-8 ${formData.entry_type === type.value ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="font-medium">{type.label}</span>
                    <span className="text-xs text-muted-foreground text-center">{type.description}</span>
                  </Label>
                );
              })}
            </RadioGroup>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <h3 className="font-medium text-lg">2. Presupuesto Relacionado</h3>
            <p className="text-sm text-muted-foreground">Selecciona el presupuesto asociado (opcional)</p>
            
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

            <ScrollArea className="h-[250px] border rounded-lg">
              <div className="p-2 space-y-1">
                <div
                  className={`p-3 rounded-md cursor-pointer transition-colors ${
                    formData.budget_id === null ? 'bg-primary/10 border border-primary' : 'hover:bg-muted'
                  }`}
                  onClick={() => setFormData({ ...formData, budget_id: null })}
                >
                  <span className="text-muted-foreground italic">Sin presupuesto asociado</span>
                </div>
                {filteredBudgets.map((p) => (
                  <div
                    key={p.id}
                    className={`p-3 rounded-md cursor-pointer transition-colors ${
                      formData.budget_id === p.id ? 'bg-primary/10 border border-primary' : 'hover:bg-muted'
                    }`}
                    onClick={() => setFormData({ ...formData, budget_id: p.id })}
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{p.codigo_correlativo}</Badge>
                      <span className="font-medium">{p.nombre}</span>
                      <span className="text-sm text-muted-foreground">({p.version})</span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <h3 className="font-medium text-lg">3. Descripción del Asiento</h3>
            <p className="text-sm text-muted-foreground">Describe la operación (ej: Factura nº 263 compra energía)</p>
            <Input
              placeholder="Descripción del asiento..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="text-lg py-6"
              autoFocus
            />
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <h3 className="font-medium text-lg">4. Fecha e Importe</h3>
            <p className="text-sm text-muted-foreground">Indica la fecha y el importe total del asiento</p>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha del asiento</Label>
                <Input
                  type="date"
                  value={formData.entry_date}
                  onChange={(e) => setFormData({ ...formData, entry_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Importe total (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={formData.total_amount}
                  onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })}
                  className="text-lg font-mono"
                  autoFocus
                />
              </div>
            </div>
          </div>
        );

      case 5:
        // For cobro/pago, this is the contact step
        if (['cobro', 'pago'].includes(formData.entry_type)) {
          return renderContactStep();
        }
        // For compra/venta, this is the VAT step
        return (
          <div className="space-y-4">
            <h3 className="font-medium text-lg">5. Tipo de IVA</h3>
            <p className="text-sm text-muted-foreground">Selecciona el tipo de IVA aplicable</p>
            
            <RadioGroup
              value={formData.vat_rate.toString()}
              onValueChange={(value) => setFormData({ ...formData, vat_rate: parseInt(value) })}
              className="space-y-2"
            >
              {VAT_RATES.map((rate) => (
                <Label
                  key={rate.value}
                  htmlFor={`vat-${rate.value}`}
                  className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-all ${
                    formData.vat_rate === rate.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <RadioGroupItem value={rate.value.toString()} id={`vat-${rate.value}`} />
                  <span className="font-medium">{rate.label}</span>
                </Label>
              ))}
            </RadioGroup>
            
            {parseFloat(formData.total_amount) > 0 && (
              <Card className="mt-4">
                <CardContent className="pt-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Base imponible:</span>
                      <span className="font-mono">{formatCurrency(calculateAmounts().base)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>IVA ({formData.vat_rate}%):</span>
                      <span className="font-mono">{formatCurrency(calculateAmounts().vat)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-semibold">
                      <span>Total:</span>
                      <span className="font-mono">{formatCurrency(calculateAmounts().total)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        );

      case 6:
        return renderContactStep();

      case 7:
        return renderAccountStep();

      default:
        return null;
    }
  };

  const renderContactStep = () => (
    <div className="space-y-4">
      <h3 className="font-medium text-lg">
        {['cobro', 'pago'].includes(formData.entry_type) ? '5' : '6'}. {getContactLabel()}
      </h3>
      <p className="text-sm text-muted-foreground">
        Selecciona el {getContactLabel().toLowerCase()} de la operación
      </p>
      
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={`Buscar ${getContactLabel().toLowerCase()}...`}
          value={contactSearch}
          onChange={(e) => setContactSearch(e.target.value)}
          className="pl-9"
        />
        {contactSearch && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
            onClick={() => setContactSearch('')}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      <ScrollArea className="h-[250px] border rounded-lg">
        <div className="p-2 space-y-1">
          {filteredContacts.length === 0 ? (
            <p className="p-4 text-center text-muted-foreground">No hay contactos disponibles</p>
          ) : (
            filteredContacts.map((c) => (
              <div
                key={c.id}
                className={`p-3 rounded-md cursor-pointer transition-colors ${
                  formData.supplier_id === c.id ? 'bg-primary/10 border border-primary' : 'hover:bg-muted'
                }`}
                onClick={() => setFormData({ ...formData, supplier_id: c.id })}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.name} {c.surname}</span>
                  <Badge variant="outline" className="text-xs">{c.contact_type}</Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );

  const renderAccountStep = () => (
    <div className="space-y-4">
      <h3 className="font-medium text-lg">7. {getAccountLabel()}</h3>
      <p className="text-sm text-muted-foreground">
        Selecciona la cuenta de {formData.entry_type === 'compra' ? 'gasto' : 'ingreso'} correspondiente
      </p>
      
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar cuenta..."
          value={accountSearch}
          onChange={(e) => setAccountSearch(e.target.value)}
          className="pl-9"
        />
        {accountSearch && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
            onClick={() => setAccountSearch('')}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      <ScrollArea className="h-[200px] border rounded-lg">
        <div className="p-2 space-y-1">
          {getFilteredAccounts().length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-muted-foreground mb-3">
                No se encontraron cuentas{accountSearch && ` para "${accountSearch}"`}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenCreateAccount}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Crear nueva cuenta
              </Button>
            </div>
          ) : (
            getFilteredAccounts().map((a) => (
              <div
                key={a.id}
                className={`p-3 rounded-md cursor-pointer transition-colors ${
                  formData.expense_account_id === a.id ? 'bg-primary/10 border border-primary' : 'hover:bg-muted'
                }`}
                onClick={() => setFormData({ ...formData, expense_account_id: a.id })}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{a.name}</span>
                  <Badge variant="outline" className="text-xs">{a.account_type}</Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
      
      {/* Button to create account even when there are results */}
      {getFilteredAccounts().length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleOpenCreateAccount}
          className="w-full gap-2"
        >
          <Plus className="h-4 w-4" />
          Crear nueva cuenta
        </Button>
      )}
    </div>
  );

  const renderPreview = () => {
    const { total, base, vat } = calculateAmounts();
    const selectedBudget = presupuestos.find(p => p.id === formData.budget_id);
    const selectedContact = contacts.find(c => c.id === formData.supplier_id);
    const selectedAccount = accounts.find(a => a.id === formData.expense_account_id);
    const entryTypeInfo = ENTRY_TYPES.find(t => t.value === formData.entry_type);
    
    const isCobroPago = ['cobro', 'pago'].includes(formData.entry_type);
    
    return (
      <div className="space-y-4">
        <h3 className="font-medium text-lg flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-600" />
          Resumen del Asiento
        </h3>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              {entryTypeInfo && <entryTypeInfo.icon className="h-5 w-5" />}
              {entryTypeInfo?.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Descripción:</span>
              <span className="font-medium">{formData.description}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fecha:</span>
              <span>{format(new Date(formData.entry_date), 'dd/MM/yyyy', { locale: es })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Presupuesto:</span>
              <span>{selectedBudget ? `${selectedBudget.codigo_correlativo} - ${selectedBudget.nombre}` : 'Sin presupuesto'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{getContactLabel()}:</span>
              <span>{selectedContact ? `${selectedContact.name} ${selectedContact.surname || ''}` : '-'}</span>
            </div>
            
            <Separator />
            
            <div className="font-semibold">Apuntes contables:</div>
            
            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              {formData.entry_type === 'compra' && (
                <>
                  <div className="flex justify-between">
                    <span>{selectedAccount?.name || 'Cuenta de gasto'}</span>
                    <span className="font-mono text-green-600">{formatCurrency(base)} (D)</span>
                  </div>
                  {vat > 0 && (
                    <div className="flex justify-between">
                      <span>IVA {formData.vat_rate}% Soportado</span>
                      <span className="font-mono text-green-600">{formatCurrency(vat)} (D)</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>{selectedContact?.name || 'Proveedor'}</span>
                    <span className="font-mono text-red-600">{formatCurrency(total)} (H)</span>
                  </div>
                </>
              )}
              
              {formData.entry_type === 'venta' && (
                <>
                  <div className="flex justify-between">
                    <span>{selectedContact?.name || 'Cliente'}</span>
                    <span className="font-mono text-green-600">{formatCurrency(total)} (D)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{selectedAccount?.name || 'Cuenta de ingreso'}</span>
                    <span className="font-mono text-red-600">{formatCurrency(base)} (H)</span>
                  </div>
                  {vat > 0 && (
                    <div className="flex justify-between">
                      <span>IVA {formData.vat_rate}% Repercutido</span>
                      <span className="font-mono text-red-600">{formatCurrency(vat)} (H)</span>
                    </div>
                  )}
                </>
              )}
              
              {formData.entry_type === 'cobro' && (
                <>
                  <div className="flex justify-between">
                    <span>Tesorería</span>
                    <span className="font-mono text-green-600">{formatCurrency(total)} (D)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{selectedContact?.name || 'Cliente'}</span>
                    <span className="font-mono text-red-600">{formatCurrency(total)} (H)</span>
                  </div>
                </>
              )}
              
              {formData.entry_type === 'pago' && (
                <>
                  <div className="flex justify-between">
                    <span>{selectedContact?.name || 'Proveedor'}</span>
                    <span className="font-mono text-green-600">{formatCurrency(total)} (D)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tesorería</span>
                    <span className="font-mono text-red-600">{formatCurrency(total)} (H)</span>
                  </div>
                </>
              )}
            </div>
            
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-4 w-4" />
              <span className="font-medium">Asiento cuadrado</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const isLastStep = step === getTotalSteps();
  const isPreviewStep = step === getTotalSteps() + 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Nuevo Asiento Contable</DialogTitle>
          {!isPreviewStep && (
            <div className="flex items-center gap-1 mt-2">
              {Array.from({ length: getTotalSteps() }, (_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i + 1 <= step ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              ))}
            </div>
          )}
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto py-4">
          {isPreviewStep ? renderPreview() : renderStepContent()}
        </div>
        
        <DialogFooter className="flex-shrink-0 pt-4 border-t">
          <div className="flex w-full justify-between">
            <Button
              variant="outline"
              onClick={isPreviewStep ? () => setStep(getTotalSteps()) : prevStep}
              disabled={step === 1 && !isPreviewStep}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Anterior
            </Button>
            
            {isPreviewStep ? (
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Guardando...' : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Crear Asiento
                  </>
                )}
              </Button>
            ) : isLastStep ? (
              <Button onClick={() => setStep(step + 1)} disabled={!canProceed()}>
                Ver Resumen
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={nextStep} disabled={!canProceed()}>
                Siguiente
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Dialog for creating new account */}
      <Dialog open={showCreateAccountDialog} onOpenChange={setShowCreateAccountDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Cuenta Contable</DialogTitle>
            <DialogDescription>
              Crear una nueva cuenta contable para usar en los asientos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-account-name">Nombre de la cuenta *</Label>
              <Input
                id="new-account-name"
                value={newAccount.name}
                onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                placeholder="Ej: Gastos de oficina"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-account-type">Tipo de cuenta</Label>
              <Select
                value={newAccount.account_type}
                onValueChange={(value) => setNewAccount({ ...newAccount, account_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
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
            <Button variant="outline" onClick={() => setShowCreateAccountDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateAccount} disabled={savingAccount}>
              {savingAccount ? 'Creando...' : 'Crear cuenta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
