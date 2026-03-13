import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowUpDown, List, Layers, Search, X, Check, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { searchMatch } from '@/lib/search-utils';

interface AccountingAccount {
  id: string;
  name: string;
  account_type: string;
}

interface EntryLine {
  id: string;
  code: string;
  entry_id: string;
  account_id: string;
  line_date: string;
  description: string | null;
  debit_amount: number;
  credit_amount: number;
  account?: AccountingAccount;
  entry?: {
    code: string;
    description: string;
  };
}

type SortField = 'code' | 'line_date';
type SortDirection = 'asc' | 'desc';

interface Props {
  onNavigateToEntry?: (entryCode: string) => void;
  onNavigateToAccount?: (accountId: string) => void;
  budgetId?: string;
  ledgerId?: string;
}

export function AccountingEntryLinesTab({ onNavigateToEntry, onNavigateToAccount, budgetId: fixedBudgetId, ledgerId }: Props) {
  const [lines, setLines] = useState<EntryLine[]>([]);
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('code');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [viewMode, setViewMode] = useState<'list' | 'grouped'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ line_date: string; account_id: string; description: string }>({ line_date: '', account_id: '', description: '' });

  useEffect(() => {
    fetchData();
  }, [ledgerId]);

  const fetchData = async () => {
    try {
      let linesQuery = supabase
        .from('accounting_entry_lines')
        .select(`
          *,
          account:accounting_accounts(id, name, account_type),
          entry:accounting_entries(code, description, budget_id, ledger_id)
        `);
      
      const { data: rawLinesData, error: linesError } = await linesQuery.order('code', { ascending: false });

      if (linesError) throw linesError;
      
      // Filter by budget if fixedBudgetId is set
      let filteredData = fixedBudgetId 
        ? (rawLinesData || []).filter((line: any) => line.entry?.budget_id === fixedBudgetId)
        : (rawLinesData || []);
      
      // Filter by ledger
      if (ledgerId && ledgerId !== '__total__') {
        filteredData = filteredData.filter((line: any) => line.entry?.ledger_id === ledgerId);
      }
      
      setLines(filteredData);

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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: true }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'dd/MM/yyyy', { locale: es });
  };

  // Filter lines by search query
  const filteredLines = useMemo(() => {
    if (!searchQuery.trim()) return lines;
    return lines.filter(line => {
      const matchesSearch = 
        searchMatch(line.code, searchQuery) ||
        searchMatch(line.description, searchQuery) ||
        searchMatch(line.account?.name, searchQuery) ||
        searchMatch(line.account?.account_type, searchQuery) ||
        searchMatch(line.entry?.code, searchQuery) ||
        searchMatch(line.entry?.description, searchQuery) ||
        searchMatch(line.debit_amount?.toString(), searchQuery) ||
        searchMatch(line.credit_amount?.toString(), searchQuery) ||
        searchMatch(formatDate(line.line_date), searchQuery);
      return matchesSearch;
    });
  }, [lines, searchQuery]);

  const sortedLines = useMemo(() => {
    return [...filteredLines].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'code') {
        comparison = a.code.localeCompare(b.code);
      } else if (sortField === 'line_date') {
        comparison = new Date(a.line_date).getTime() - new Date(b.line_date).getTime();
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredLines, sortField, sortDirection]);

  const linesGroupedByAccount = useMemo(() => {
    const grouped = new Map<string, { account: AccountingAccount; lines: EntryLine[]; totalDebit: number; totalCredit: number }>();
    
    filteredLines.forEach(line => {
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
  }, [filteredLines]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const totalDebit = filteredLines.reduce((sum, line) => sum + (Number(line.debit_amount) || 0), 0);
  const totalCredit = filteredLines.reduce((sum, line) => sum + (Number(line.credit_amount) || 0), 0);

  const handleEntryClick = (entryCode: string) => {
    if (onNavigateToEntry) {
      onNavigateToEntry(entryCode);
    }
  };

  const handleAccountClick = (accountId: string) => {
    if (onNavigateToAccount) {
      onNavigateToAccount(accountId);
    }
  };

  const startEditing = (line: EntryLine) => {
    setEditingId(line.id);
    setEditValues({
      line_date: line.line_date,
      account_id: line.account_id,
      description: line.description || '',
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const saveEditing = async () => {
    if (!editingId) return;
    try {
      const { error } = await supabase
        .from('accounting_entry_lines')
        .update({
          line_date: editValues.line_date,
          account_id: editValues.account_id,
          description: editValues.description || null,
        })
        .eq('id', editingId);
      if (error) throw error;
      toast.success('Apunte actualizado');
      setEditingId(null);
      fetchData();
    } catch (error) {
      console.error('Error updating line:', error);
      toast.error('Error al actualizar el apunte');
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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-semibold">Listado de Apuntes</h2>
          <p className="text-sm text-muted-foreground">
            {searchQuery ? `${filteredLines.length} de ${lines.length}` : lines.length} apuntes • Debe: {formatCurrency(totalDebit)} • Haber: {formatCurrency(totalCredit)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
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
                  sortedLines.map((line) => {
                    const isEditing = editingId === line.id;
                    return (
                    <TableRow key={line.id} className={isEditing ? 'bg-muted/30' : ''}>
                      <TableCell className="font-mono text-muted-foreground">{line.code}</TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input
                            type="date"
                            value={editValues.line_date}
                            onChange={(e) => setEditValues(prev => ({ ...prev, line_date: e.target.value }))}
                            className="h-8 w-[130px]"
                          />
                        ) : (
                          <span
                            className="cursor-pointer hover:text-primary transition-colors"
                            onClick={() => startEditing(line)}
                          >
                            {formatDate(line.line_date)}
                          </span>
                        )}
                      </TableCell>
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
                        {isEditing ? (
                          <Select
                            value={editValues.account_id}
                            onValueChange={(v) => setEditValues(prev => ({ ...prev, account_id: v }))}
                          >
                            <SelectTrigger className="h-8 w-[200px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {accounts.map(acc => (
                                <SelectItem key={acc.id} value={acc.id}>
                                  {acc.name} ({acc.account_type})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div 
                            className="cursor-pointer hover:text-primary transition-colors"
                            onClick={() => startEditing(line)}
                          >
                            <div className="font-medium">{line.account?.name}</div>
                            <div className="text-xs text-muted-foreground">{line.account?.account_type}</div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input
                            value={editValues.description}
                            onChange={(e) => setEditValues(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="Descripción..."
                            className="h-8"
                          />
                        ) : (
                          <span
                            className="text-muted-foreground cursor-pointer hover:text-primary transition-colors"
                            onClick={() => startEditing(line)}
                          >
                            {line.description || line.entry?.description || '-'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(line.debit_amount) > 0 ? formatCurrency(Number(line.debit_amount)) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <div className="flex items-center justify-end gap-1">
                          <span>{Number(line.credit_amount) > 0 ? formatCurrency(Number(line.credit_amount)) : '-'}</span>
                          {isEditing ? (
                            <div className="flex gap-1 ml-2">
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={saveEditing}>
                                <Check className="h-3 w-3 text-green-600" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cancelEditing}>
                                <X className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          ) : (
                            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => startEditing(line)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })
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
                      {group.lines.map((line) => {
                        const isEditing = editingId === line.id;
                        return (
                        <TableRow key={line.id} className={isEditing ? 'bg-muted/30' : ''}>
                          <TableCell className="font-mono text-muted-foreground">{line.code}</TableCell>
                          <TableCell>
                            {isEditing ? (
                              <Input
                                type="date"
                                value={editValues.line_date}
                                onChange={(e) => setEditValues(prev => ({ ...prev, line_date: e.target.value }))}
                                className="h-8 w-[130px]"
                              />
                            ) : (
                              <span className="cursor-pointer hover:text-primary transition-colors" onClick={() => startEditing(line)}>
                                {formatDate(line.line_date)}
                              </span>
                            )}
                          </TableCell>
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
                            {isEditing ? (
                              <Input
                                value={editValues.description}
                                onChange={(e) => setEditValues(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="Descripción..."
                                className="h-8"
                              />
                            ) : (
                              <span className="text-muted-foreground cursor-pointer hover:text-primary transition-colors" onClick={() => startEditing(line)}>
                                {line.description || line.entry?.description || '-'}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {Number(line.debit_amount) > 0 ? formatCurrency(Number(line.debit_amount)) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            <div className="flex items-center justify-end gap-1">
                              <span>{Number(line.credit_amount) > 0 ? formatCurrency(Number(line.credit_amount)) : '-'}</span>
                              {isEditing && (
                                <div className="flex gap-1 ml-2">
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={saveEditing}>
                                    <Check className="h-3 w-3 text-green-600" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cancelEditing}>
                                    <X className="h-3 w-3 text-destructive" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        );
                      })}
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
