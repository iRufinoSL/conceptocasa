import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

  const { totalDebit, totalCredit, balance, linesWithBalance } = useMemo(() => {
    let sumDebit = 0;
    let sumCredit = 0;

    // Sort ascending by date then code for running balance
    const sorted = [...lines].sort((a, b) => {
      const dateCompare = a.line_date.localeCompare(b.line_date);
      if (dateCompare !== 0) return dateCompare;
      return a.code.localeCompare(b.code);
    });

    const withBalance = sorted.map(line => {
      sumDebit += Number(line.debit_amount) || 0;
      sumCredit += Number(line.credit_amount) || 0;
      return { ...line, runningBalance: sumDebit - sumCredit };
    });

    return {
      totalDebit: sumDebit,
      totalCredit: sumCredit,
      balance: sumDebit - sumCredit,
      linesWithBalance: withBalance.reverse() // show newest first
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

      {/* Unified movements table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Movimientos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {linesWithBalance.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No hay movimientos en esta cuenta
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Asiento</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Debe (€)</TableHead>
                  <TableHead className="text-right">Haber (€)</TableHead>
                  <TableHead className="text-right">Saldo (€)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linesWithBalance.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell className="text-sm">{formatDate(line.line_date)}</TableCell>
                    <TableCell>
                      <button
                        className="font-mono text-sm text-primary hover:underline cursor-pointer"
                        onClick={() => line.entry?.code && onNavigateToEntry(line.entry.code)}
                      >
                        {line.entry?.code || '-'}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                      {line.description || line.entry?.description || '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-emerald-600">
                      {Number(line.debit_amount) > 0 ? formatCurrency(Number(line.debit_amount)) : ''}
                    </TableCell>
                    <TableCell className="text-right font-mono text-rose-600">
                      {Number(line.credit_amount) > 0 ? formatCurrency(Number(line.credit_amount)) : ''}
                    </TableCell>
                    <TableCell className={`text-right font-mono font-semibold ${line.runningBalance < 0 ? 'text-destructive' : ''}`}>
                      {formatCurrency(line.runningBalance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
