import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, AlertTriangle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface AccountingEntry {
  id: string;
  code: number;
  entry_date: string;
}

interface AccountingAccount {
  id: string;
  name: string;
  account_type: string;
}

interface EntryLine {
  id: string;
  code: number;
  entry_id: string;
  account_id: string;
  line_date: string;
  description: string | null;
  debit_amount: number;
  credit_amount: number;
  account?: AccountingAccount;
}

interface Props {
  entry: AccountingEntry;
  onUpdate: () => void;
}

export function AccountingEntryLinesEditor({ entry, onUpdate }: Props) {
  const [lines, setLines] = useState<EntryLine[]>([]);
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // New line form
  const [newLine, setNewLine] = useState({
    account_id: '',
    line_date: entry.entry_date,
    description: '',
    debit_amount: '',
    credit_amount: ''
  });

  useEffect(() => {
    fetchData();
  }, [entry.id]);

  const fetchData = async () => {
    try {
      // Fetch accounts
      const { data: accountsData, error: accountsError } = await supabase
        .from('accounting_accounts')
        .select('*')
        .order('account_type')
        .order('name');

      if (accountsError) throw accountsError;
      setAccounts(accountsData || []);

      // Fetch lines for this entry
      const { data: linesData, error: linesError } = await supabase
        .from('accounting_entry_lines')
        .select(`
          *,
          account:accounting_accounts(id, name, account_type)
        `)
        .eq('entry_id', entry.id)
        .order('code');

      if (linesError) throw linesError;
      setLines(linesData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar los apuntes');
    } finally {
      setLoading(false);
    }
  };

  const handleAddLine = async () => {
    if (!newLine.account_id) {
      toast.error('Selecciona una cuenta contable');
      return;
    }

    const debit = parseFloat(newLine.debit_amount) || 0;
    const credit = parseFloat(newLine.credit_amount) || 0;

    if (debit === 0 && credit === 0) {
      toast.error('Introduce un importe en Debe o Haber');
      return;
    }

    if (debit > 0 && credit > 0) {
      toast.error('Un apunte solo puede tener importe en Debe o en Haber, no en ambos');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('accounting_entry_lines')
        .insert({
          entry_id: entry.id,
          account_id: newLine.account_id,
          line_date: newLine.line_date || entry.entry_date,
          description: newLine.description.trim() || null,
          debit_amount: debit,
          credit_amount: credit
        });

      if (error) throw error;

      toast.success('Apunte añadido');
      setNewLine({
        account_id: '',
        line_date: entry.entry_date,
        description: '',
        debit_amount: '',
        credit_amount: ''
      });
      fetchData();
      onUpdate();
    } catch (error) {
      console.error('Error adding line:', error);
      toast.error('Error al añadir el apunte');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLine = async (lineId: string) => {
    try {
      const { error } = await supabase
        .from('accounting_entry_lines')
        .delete()
        .eq('id', lineId);

      if (error) throw error;

      toast.success('Apunte eliminado');
      fetchData();
      onUpdate();
    } catch (error) {
      console.error('Error deleting line:', error);
      toast.error('Error al eliminar el apunte');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const totalDebit = lines.reduce((sum, line) => sum + (Number(line.debit_amount) || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + (Number(line.credit_amount) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
  const difference = totalDebit - totalCredit;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Balance status */}
      <div className={`flex items-center gap-2 p-3 rounded-lg ${isBalanced ? 'bg-green-50 dark:bg-green-950/30' : 'bg-destructive/10'}`}>
        {isBalanced ? (
          <>
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="text-green-700 dark:text-green-400 font-medium">
              Asiento cuadrado
            </span>
          </>
        ) : (
          <>
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span className="text-destructive font-medium">
              Asiento descuadrado: diferencia de {formatCurrency(Math.abs(difference))}
              {difference > 0 ? ' (más Debe)' : ' (más Haber)'}
            </span>
          </>
        )}
      </div>

      {/* Lines table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[60px]">Nº</TableHead>
            <TableHead>Cuenta</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead className="text-right w-[120px]">Debe (€)</TableHead>
            <TableHead className="text-right w-[120px]">Haber (€)</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell className="font-mono text-muted-foreground">{line.code}</TableCell>
              <TableCell>
                <div>
                  <div className="font-medium">{line.account?.name}</div>
                  <div className="text-xs text-muted-foreground">{line.account?.account_type}</div>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{line.description || '-'}</TableCell>
              <TableCell className="text-right font-mono">
                {Number(line.debit_amount) > 0 ? formatCurrency(Number(line.debit_amount)) : '-'}
              </TableCell>
              <TableCell className="text-right font-mono">
                {Number(line.credit_amount) > 0 ? formatCurrency(Number(line.credit_amount)) : '-'}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeleteLine(line.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}

          {/* Totals row */}
          <TableRow className="bg-muted/50 font-semibold">
            <TableCell colSpan={3} className="text-right">Totales:</TableCell>
            <TableCell className="text-right font-mono">{formatCurrency(totalDebit)}</TableCell>
            <TableCell className="text-right font-mono">{formatCurrency(totalCredit)}</TableCell>
            <TableCell></TableCell>
          </TableRow>

          {/* New line row */}
          <TableRow>
            <TableCell>
              <span className="text-muted-foreground">Nuevo</span>
            </TableCell>
            <TableCell>
              <Select
                value={newLine.account_id}
                onValueChange={(value) => setNewLine({ ...newLine, account_id: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Cuenta..." />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} ({account.account_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TableCell>
            <TableCell>
              <Input
                placeholder="Descripción (opcional)"
                value={newLine.description}
                onChange={(e) => setNewLine({ ...newLine, description: e.target.value })}
              />
            </TableCell>
            <TableCell>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={newLine.debit_amount}
                onChange={(e) => setNewLine({ 
                  ...newLine, 
                  debit_amount: e.target.value,
                  credit_amount: e.target.value ? '' : newLine.credit_amount 
                })}
                className="text-right font-mono"
              />
            </TableCell>
            <TableCell>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={newLine.credit_amount}
                onChange={(e) => setNewLine({ 
                  ...newLine, 
                  credit_amount: e.target.value,
                  debit_amount: e.target.value ? '' : newLine.debit_amount 
                })}
                className="text-right font-mono"
              />
            </TableCell>
            <TableCell>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleAddLine}
                disabled={saving}
              >
                <Plus className="h-4 w-4 text-primary" />
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      {accounts.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No hay cuentas contables. Crea primero las cuentas en la pestaña "Cuentas Contables".
        </p>
      )}
    </div>
  );
}
