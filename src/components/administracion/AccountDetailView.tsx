import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Save, TrendingDown, TrendingUp, Scale } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface AccountingAccount {
  id: string;
  name: string;
  account_type: string;
  created_at: string;
}

interface EntryLine {
  id: string;
  code: string;
  entry_id: string;
  line_date: string;
  description: string | null;
  debit_amount: number;
  credit_amount: number;
  entry?: {
    code: string;
    description: string;
  };
}

const ACCOUNT_TYPES = [
  'Compras y gastos',
  'Ventas e ingresos',
  'Clientes',
  'Proveedores',
  'Impuestos',
  'Tesorería'
];

interface Props {
  account: AccountingAccount;
  onBack: () => void;
  onNavigateToEntry: (entryCode: string) => void;
  onAccountUpdated: () => void;
}

export function AccountDetailView({ account, onBack, onNavigateToEntry, onAccountUpdated }: Props) {
  const [lines, setLines] = useState<EntryLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: account.name,
    account_type: account.account_type
  });

  useEffect(() => {
    fetchAccountLines();
  }, [account.id]);

  const fetchAccountLines = async () => {
    try {
      const { data, error } = await supabase
        .from('accounting_entry_lines')
        .select(`
          *,
          entry:accounting_entries(code, description)
        `)
        .eq('account_id', account.id)
        .order('line_date', { ascending: false })
        .order('code', { ascending: false });

      if (error) throw error;
      setLines(data || []);
    } catch (error) {
      console.error('Error fetching account lines:', error);
      toast.error('Error al cargar los apuntes de la cuenta');
    } finally {
      setLoading(false);
    }
  };

  const { debitLines, creditLines, totalDebit, totalCredit, balance } = useMemo(() => {
    const debit: EntryLine[] = [];
    const credit: EntryLine[] = [];
    let sumDebit = 0;
    let sumCredit = 0;

    lines.forEach(line => {
      if (Number(line.debit_amount) > 0) {
        debit.push(line);
        sumDebit += Number(line.debit_amount);
      }
      if (Number(line.credit_amount) > 0) {
        credit.push(line);
        sumCredit += Number(line.credit_amount);
      }
    });

    return {
      debitLines: debit,
      creditLines: credit,
      totalDebit: sumDebit,
      totalCredit: sumCredit,
      balance: sumDebit - sumCredit
    };
  }, [lines]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.account_type) {
      toast.error('Nombre y tipo de cuenta son obligatorios');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('accounting_accounts')
        .update({
          name: form.name.trim(),
          account_type: form.account_type
        })
        .eq('id', account.id);

      if (error) throw error;
      toast.success('Cuenta actualizada');
      onAccountUpdated();
    } catch (error) {
      console.error('Error saving account:', error);
      toast.error('Error al guardar la cuenta');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: true }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'dd/MM/yyyy', { locale: es });
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

  const handleLineClick = (line: EntryLine) => {
    if (line.entry?.code) {
      onNavigateToEntry(line.entry.code);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">Detalle de Cuenta Contable</h2>
          <p className="text-sm text-muted-foreground">
            Ver y editar datos de la cuenta
          </p>
        </div>
      </div>

      {/* Account Header Card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center justify-between">
            <span>Datos de la Cuenta</span>
            <Badge variant={getTypeBadgeColor(form.account_type) as any}>
              {form.account_type}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Edit form */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre de la cuenta</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nombre de la cuenta"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account_type">Tipo de cuenta</Label>
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

          {/* Save button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </div>

          {/* Balance summary */}
          <div className="grid gap-4 md:grid-cols-3 pt-4 border-t">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <div className="p-2 rounded-full bg-emerald-500/20">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Debe</p>
                <p className="text-xl font-bold text-emerald-600">{formatCurrency(totalDebit)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-lg bg-rose-500/10 border border-rose-500/20">
              <div className="p-2 rounded-full bg-rose-500/20">
                <TrendingDown className="h-5 w-5 text-rose-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Haber</p>
                <p className="text-xl font-bold text-rose-600">{formatCurrency(totalCredit)}</p>
              </div>
            </div>
            <div className={`flex items-center gap-3 p-4 rounded-lg border ${balance >= 0 ? 'bg-primary/10 border-primary/20' : 'bg-destructive/10 border-destructive/20'}`}>
              <div className={`p-2 rounded-full ${balance >= 0 ? 'bg-primary/20' : 'bg-destructive/20'}`}>
                <Scale className={`h-5 w-5 ${balance >= 0 ? 'text-primary' : 'text-destructive'}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Saldo</p>
                <p className={`text-xl font-bold ${balance >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {formatCurrency(balance)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Two-column layout for Debit and Credit entries */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Debit Column (Debe) */}
        <Card>
          <CardHeader className="bg-emerald-500/10 border-b border-emerald-500/20">
            <CardTitle className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
              <span className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Apuntes al Debe
              </span>
              <Badge variant="outline" className="text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                {debitLines.length} apuntes
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {debitLines.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No hay apuntes al debe
              </div>
            ) : (
              <div className="divide-y">
                {debitLines.map((line) => (
                  <div
                    key={line.id}
                    className="p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => handleLineClick(line)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium text-primary hover:underline">
                            #{line.code}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            (Asiento #{line.entry?.code})
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {formatDate(line.line_date)}
                        </p>
                        {line.description && (
                          <p className="text-sm text-muted-foreground truncate mt-1">
                            {line.description}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono font-semibold text-emerald-600">
                          {formatCurrency(Number(line.debit_amount))}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {debitLines.length > 0 && (
              <div className="p-4 bg-emerald-500/5 border-t border-emerald-500/20">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">Total Debe</span>
                  <span className="font-mono font-bold text-emerald-600">
                    {formatCurrency(totalDebit)}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Credit Column (Haber) */}
        <Card>
          <CardHeader className="bg-rose-500/10 border-b border-rose-500/20">
            <CardTitle className="flex items-center justify-between text-rose-700 dark:text-rose-400">
              <span className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5" />
                Apuntes al Haber
              </span>
              <Badge variant="outline" className="text-rose-700 dark:text-rose-400 border-rose-500/30">
                {creditLines.length} apuntes
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {creditLines.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No hay apuntes al haber
              </div>
            ) : (
              <div className="divide-y">
                {creditLines.map((line) => (
                  <div
                    key={line.id}
                    className="p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => handleLineClick(line)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium text-primary hover:underline">
                            #{line.code}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            (Asiento #{line.entry?.code})
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {formatDate(line.line_date)}
                        </p>
                        {line.description && (
                          <p className="text-sm text-muted-foreground truncate mt-1">
                            {line.description}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono font-semibold text-rose-600">
                          {formatCurrency(Number(line.credit_amount))}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {creditLines.length > 0 && (
              <div className="p-4 bg-rose-500/5 border-t border-rose-500/20">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-rose-700 dark:text-rose-400">Total Haber</span>
                  <span className="font-mono font-bold text-rose-600">
                    {formatCurrency(totalCredit)}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
