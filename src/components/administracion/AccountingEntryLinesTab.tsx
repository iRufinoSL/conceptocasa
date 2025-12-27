import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowUpDown, List, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

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
  entry?: {
    code: number;
    description: string;
  };
}

type SortField = 'code' | 'line_date';
type SortDirection = 'asc' | 'desc';

interface Props {
  onNavigateToEntry?: (entryCode: number) => void;
  onNavigateToAccount?: (accountId: string) => void;
}

export function AccountingEntryLinesTab({ onNavigateToEntry, onNavigateToAccount }: Props) {
  const [lines, setLines] = useState<EntryLine[]>([]);
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('code');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [viewMode, setViewMode] = useState<'list' | 'grouped'>('list');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: linesData, error: linesError } = await supabase
        .from('accounting_entry_lines')
        .select(`
          *,
          account:accounting_accounts(id, name, account_type),
          entry:accounting_entries(code, description)
        `)
        .order('code', { ascending: false });

      if (linesError) throw linesError;
      setLines(linesData || []);

      const { data: accountsData, error: accountsError } = await supabase
        .from('accounting_accounts')
        .select('*')
        .order('account_type')
        .order('name');

      if (accountsError) throw accountsError;
      setAccounts(accountsData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar los apuntes');
    } finally {
      setLoading(false);
    }
  };

  const sortedLines = useMemo(() => {
    return [...lines].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'code') {
        comparison = a.code - b.code;
      } else if (sortField === 'line_date') {
        comparison = new Date(a.line_date).getTime() - new Date(b.line_date).getTime();
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [lines, sortField, sortDirection]);

  const linesGroupedByAccount = useMemo(() => {
    const grouped = new Map<string, { account: AccountingAccount; lines: EntryLine[]; totalDebit: number; totalCredit: number }>();
    
    lines.forEach(line => {
      if (!line.account) return;
      
      const existing = grouped.get(line.account_id) || {
        account: line.account,
        lines: [],
        totalDebit: 0,
        totalCredit: 0
      };
      
      existing.lines.push(line);
      existing.totalDebit += Number(line.debit_amount) || 0;
      existing.totalCredit += Number(line.credit_amount) || 0;
      grouped.set(line.account_id, existing);
    });

    return Array.from(grouped.values()).sort((a, b) => 
      a.account.name.localeCompare(b.account.name)
    );
  }, [lines]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: true }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'dd/MM/yyyy', { locale: es });
  };

  const totalDebit = lines.reduce((sum, line) => sum + (Number(line.debit_amount) || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + (Number(line.credit_amount) || 0), 0);

  const handleEntryClick = (entryCode: number) => {
    if (onNavigateToEntry) {
      onNavigateToEntry(entryCode);
    }
  };

  const handleAccountClick = (accountId: string) => {
    if (onNavigateToAccount) {
      onNavigateToAccount(accountId);
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Listado de Apuntes</h2>
          <p className="text-sm text-muted-foreground">
            {lines.length} apuntes • Debe: {formatCurrency(totalDebit)} • Haber: {formatCurrency(totalCredit)}
          </p>
        </div>
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'list' | 'grouped')}>
          <TabsList>
            <TabsTrigger value="list" className="gap-2">
              <List className="h-4 w-4" />
              Lista
            </TabsTrigger>
            <TabsTrigger value="grouped" className="gap-2">
              <Layers className="h-4 w-4" />
              Por Cuenta
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {viewMode === 'list' ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleSort('code')}
                      className="gap-1 -ml-3"
                    >
                      Código
                      <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className="w-[100px]">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleSort('line_date')}
                      className="gap-1 -ml-3"
                    >
                      Fecha
                      <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className="w-[100px]">Cód. Asiento</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right w-[120px]">Debe (€)</TableHead>
                  <TableHead className="text-right w-[120px]">Haber (€)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedLines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No hay apuntes contables.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedLines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="font-mono text-muted-foreground">{line.code}</TableCell>
                      <TableCell>{formatDate(line.line_date)}</TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className="font-mono cursor-pointer hover:bg-primary/10 transition-colors"
                          onClick={() => line.entry?.code && handleEntryClick(line.entry.code)}
                        >
                          #{line.entry?.code}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div 
                          className="cursor-pointer hover:text-primary transition-colors"
                          onClick={() => handleAccountClick(line.account_id)}
                        >
                          <div className="font-medium">{line.account?.name}</div>
                          <div className="text-xs text-muted-foreground">{line.account?.account_type}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {line.description || line.entry?.description || '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(line.debit_amount) > 0 ? formatCurrency(Number(line.debit_amount)) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(line.credit_amount) > 0 ? formatCurrency(Number(line.credit_amount)) : '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
                {sortedLines.length > 0 && (
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={5} className="text-right">Totales:</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(totalDebit)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(totalCredit)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {linesGroupedByAccount.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No hay apuntes contables.
              </CardContent>
            </Card>
          ) : (
            linesGroupedByAccount.map((group) => (
              <Card key={group.account.id}>
                <div className="p-4 border-b bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div 
                      className="cursor-pointer hover:text-primary transition-colors"
                      onClick={() => handleAccountClick(group.account.id)}
                    >
                      <h3 className="font-semibold">{group.account.name}</h3>
                      <Badge variant="outline" className="mt-1">{group.account.account_type}</Badge>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">
                        Debe: {formatCurrency(group.totalDebit)} | Haber: {formatCurrency(group.totalCredit)}
                      </div>
                      <div className={`font-semibold ${(group.totalDebit - group.totalCredit) < 0 ? 'text-destructive' : ''}`}>
                        Saldo: {formatCurrency(group.totalDebit - group.totalCredit)}
                      </div>
                    </div>
                  </div>
                </div>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">Código</TableHead>
                        <TableHead className="w-[100px]">Fecha</TableHead>
                        <TableHead className="w-[100px]">Cód. Asiento</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead className="text-right w-[120px]">Debe (€)</TableHead>
                        <TableHead className="text-right w-[120px]">Haber (€)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.lines.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell className="font-mono text-muted-foreground">{line.code}</TableCell>
                          <TableCell>{formatDate(line.line_date)}</TableCell>
                          <TableCell>
                            <Badge 
                              variant="outline" 
                              className="font-mono cursor-pointer hover:bg-primary/10 transition-colors"
                              onClick={() => line.entry?.code && handleEntryClick(line.entry.code)}
                            >
                              #{line.entry?.code}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {line.description || line.entry?.description || '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {Number(line.debit_amount) > 0 ? formatCurrency(Number(line.debit_amount)) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {Number(line.credit_amount) > 0 ? formatCurrency(Number(line.credit_amount)) : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
