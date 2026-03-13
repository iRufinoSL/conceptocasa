import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { TrendingUp, TrendingDown, Wallet, FileText } from 'lucide-react';
import { formatCurrency } from '@/lib/format-utils';

interface AccountWithBalance {
  id: string;
  name: string;
  account_type: string;
  total_debit: number;
  total_credit: number;
  balance: number;
}

interface TypeSummary {
  type: string;
  accounts: AccountWithBalance[];
  totalDebit: number;
  totalCredit: number;
  totalBalance: number;
}

const ACCOUNT_TYPE_ORDER = [
  'Tesorería',
  'Clientes',
  'Proveedores',
  'Ventas e ingresos',
  'Compras y gastos',
  'Impuestos'
];

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'Ventas e ingresos': return <TrendingUp className="h-4 w-4 text-green-600" />;
    case 'Compras y gastos': return <TrendingDown className="h-4 w-4 text-red-600" />;
    case 'Tesorería': return <Wallet className="h-4 w-4 text-blue-600" />;
    default: return <FileText className="h-4 w-4 text-muted-foreground" />;
  }
};

const getTypeBadgeVariant = (type: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (type) {
    case 'Ventas e ingresos': return 'default';
    case 'Compras y gastos': return 'destructive';
    case 'Tesorería': return 'secondary';
    default: return 'outline';
  }
};

export function AccountingBalanceReport({ budgetId: fixedBudgetId, ledgerId }: { budgetId?: string; ledgerId?: string } = {}) {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [ledgerId]);

  const fetchData = async () => {
    try {
      let accountsQuery = supabase
        .from('accounting_accounts')
        .select('*');
      if (ledgerId && ledgerId !== '__total__') {
        accountsQuery = accountsQuery.eq('ledger_id', ledgerId);
      }
      const { data: accountsData, error: accountsError } = await accountsQuery
        .order('account_type')
        .order('name');

      if (accountsError) throw accountsError;

      let linesQuery = supabase
        .from('accounting_entry_lines')
        .select('account_id, debit_amount, credit_amount, entry:accounting_entries(budget_id)');
      
      const { data: linesData, error: linesError } = await linesQuery;

      if (linesError) throw linesError;

      const accountTotals = new Map<string, { debit: number; credit: number }>();
      linesData?.forEach((line: any) => {
        // Filter by budget if fixedBudgetId is set
        if (fixedBudgetId && line.entry?.budget_id !== fixedBudgetId) return;
        const current = accountTotals.get(line.account_id) || { debit: 0, credit: 0 };
        current.debit += Number(line.debit_amount) || 0;
        current.credit += Number(line.credit_amount) || 0;
        accountTotals.set(line.account_id, current);
      });

      const enrichedAccounts: AccountWithBalance[] = accountsData?.map(account => {
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
      console.error('Error fetching balance data:', error);
    } finally {
      setLoading(false);
    }
  };

  const summaryByType = useMemo((): TypeSummary[] => {
    const grouped = new Map<string, AccountWithBalance[]>();
    
    accounts.forEach(account => {
      const list = grouped.get(account.account_type) || [];
      list.push(account);
      grouped.set(account.account_type, list);
    });

    return ACCOUNT_TYPE_ORDER
      .filter(type => grouped.has(type))
      .map(type => {
        const typeAccounts = grouped.get(type) || [];
        return {
          type,
          accounts: typeAccounts,
          totalDebit: typeAccounts.reduce((sum, a) => sum + a.total_debit, 0),
          totalCredit: typeAccounts.reduce((sum, a) => sum + a.total_credit, 0),
          totalBalance: typeAccounts.reduce((sum, a) => sum + a.balance, 0)
        };
      });
  }, [accounts]);

  const globalTotals = useMemo(() => {
    return {
      totalDebit: accounts.reduce((sum, a) => sum + a.total_debit, 0),
      totalCredit: accounts.reduce((sum, a) => sum + a.total_credit, 0),
      totalBalance: accounts.reduce((sum, a) => sum + a.balance, 0)
    };
  }, [accounts]);

  const resultadoOperativo = useMemo(() => {
    const ingresos = summaryByType.find(s => s.type === 'Ventas e ingresos')?.totalBalance || 0;
    const gastos = summaryByType.find(s => s.type === 'Compras y gastos')?.totalBalance || 0;
    return Math.abs(ingresos) - Math.abs(gastos);
  }, [summaryByType]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Informe de Balance</h2>
        <p className="text-sm text-muted-foreground">Resumen de saldos por tipo de cuenta contable</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Debe</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(globalTotals.totalDebit)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Haber</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(globalTotals.totalCredit)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Diferencia</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${globalTotals.totalBalance !== 0 ? 'text-amber-600' : 'text-green-600'}`}>
              {formatCurrency(globalTotals.totalBalance)}
            </p>
          </CardContent>
        </Card>
        <Card className={resultadoOperativo >= 0 ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Resultado Operativo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${resultadoOperativo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(resultadoOperativo)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detail by Type */}
      <div className="space-y-6">
        {summaryByType.map((typeSummary) => (
          <Card key={typeSummary.type}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getTypeIcon(typeSummary.type)}
                  <CardTitle className="text-base">{typeSummary.type}</CardTitle>
                  <Badge variant={getTypeBadgeVariant(typeSummary.type)}>
                    {typeSummary.accounts.length} cuenta{typeSummary.accounts.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
                <div className="text-right">
                  <span className={`text-lg font-bold ${typeSummary.totalBalance < 0 ? 'text-destructive' : ''}`}>
                    {formatCurrency(typeSummary.totalBalance)}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cuenta</TableHead>
                    <TableHead className="text-right">Debe (€)</TableHead>
                    <TableHead className="text-right">Haber (€)</TableHead>
                    <TableHead className="text-right">Saldo (€)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {typeSummary.accounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell>{account.name}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(account.total_debit)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(account.total_credit)}
                      </TableCell>
                      <TableCell className={`text-right font-mono text-sm font-medium ${account.balance < 0 ? 'text-destructive' : ''}`}>
                        {formatCurrency(account.balance)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell>Total {typeSummary.type}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(typeSummary.totalDebit)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(typeSummary.totalCredit)}
                    </TableCell>
                    <TableCell className={`text-right font-mono ${typeSummary.totalBalance < 0 ? 'text-destructive' : ''}`}>
                      {formatCurrency(typeSummary.totalBalance)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}

        {summaryByType.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No hay datos contables para mostrar. Crea cuentas y asientos para ver el informe.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
