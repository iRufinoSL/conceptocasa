import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Trash2, Save, Check, ChevronsUpDown, Search, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatNumber } from '@/lib/format-utils';
import { cn } from '@/lib/utils';
import { searchMatch } from '@/lib/search-utils';

const parseEuropeanNumber = (value: string): number => {
  if (!value || value.trim() === '') return 0;
  const normalized = value.replace(/\./g, '').replace(',', '.');
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
};

interface PurchaseOrder {
  id: string;
  order_number: number;
  order_id: string;
  budget_id: string | null;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
}

interface Activity {
  id: string;
  code: string;
  name: string;
  phaseCode: string | null;
  activityId: string;
}

interface OrderLine {
  id: string;
  purchase_order_id: string;
  code: number;
  description: string | null;
  activity_id: string | null;
  units: number;
  unit_price: number;
  subtotal: number;
  isNew?: boolean;
  isModified?: boolean;
}

interface Props {
  order: PurchaseOrder;
  onClose: () => void;
}

function ActivitySelector({ activities, selectedActivityId, onSelect }: {
  activities: Activity[];
  selectedActivityId: string | null;
  onSelect: (activityId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredActivities = useMemo(() => {
    if (!searchTerm.trim()) return activities;
    return activities.filter(a => searchMatch(a.activityId, searchTerm) || searchMatch(a.code, searchTerm) || searchMatch(a.name, searchTerm));
  }, [activities, searchTerm]);

  const selectedActivity = activities.find(a => a.id === selectedActivityId);

  return (
    <TooltipProvider>
      <Popover open={open} onOpenChange={(isOpen) => { setOpen(isOpen); if (!isOpen) setSearchTerm(''); }}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" className="h-8 w-full justify-between text-xs font-normal">
                <span className="truncate">{selectedActivity ? selectedActivity.activityId : 'Sin actividad'}</span>
                <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          {selectedActivity && (
            <TooltipContent side="top" className="max-w-md"><p className="text-sm">{selectedActivity.activityId}</p></TooltipContent>
          )}
        </Tooltip>
        <PopoverContent className="w-[500px] p-0" align="start">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar actividad..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 h-9" autoFocus />
            </div>
          </div>
          <ScrollArea className="h-[300px]">
            <div className="p-1">
              <button onClick={() => { onSelect(null); setOpen(false); }} className={cn("flex items-center w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer", !selectedActivityId && "bg-accent")}>
                <Check className={cn("mr-2 h-4 w-4 shrink-0", !selectedActivityId ? "opacity-100" : "opacity-0")} />
                <span className="italic text-muted-foreground">Sin actividad</span>
              </button>
              {filteredActivities.map((activity) => (
                <button key={activity.id} onClick={() => { onSelect(activity.id); setOpen(false); }} className={cn("flex items-center w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer text-left", selectedActivityId === activity.id && "bg-accent")}>
                  <Check className={cn("mr-2 h-4 w-4 shrink-0", selectedActivityId === activity.id ? "opacity-100" : "opacity-0")} />
                  <span>{activity.activityId}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}

export function PurchaseOrderLinesEditor({ order, onClose }: Props) {
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orderTotals, setOrderTotals] = useState({ subtotal: order.subtotal, vat_amount: order.vat_amount, total: order.total });
  const [editingLine, setEditingLine] = useState<OrderLine | null>(null);
  const [lineFormData, setLineFormData] = useState({ description: '', activity_id: null as string | null, units: '', unit_price: '' });

  useEffect(() => { fetchData(); }, [order.id, order.budget_id]);

  const fetchData = async () => {
    try {
      const { data: linesData, error: linesError } = await supabase
        .from('purchase_order_lines')
        .select('*')
        .eq('purchase_order_id', order.id)
        .order('code');
      if (linesError) throw linesError;
      setLines(linesData || []);

      if (order.budget_id) {
        const { data: activitiesData } = await supabase
          .from('budget_activities')
          .select('id, code, name, budget_phases(code)')
          .eq('budget_id', order.budget_id)
          .order('code');

        const formatted: Activity[] = (activitiesData || []).map((a: any) => {
          const phaseCode = a.budget_phases?.code || '';
          const activityId = phaseCode ? `${phaseCode}  ${a.code}.-${a.name}` : `${a.code}.-${a.name}`;
          return { id: a.id, code: a.code, name: a.name, phaseCode, activityId };
        }).sort((a, b) => a.activityId.localeCompare(b.activityId, 'es', { sensitivity: 'base' }));
        setActivities(formatted);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  const addNewLine = () => {
    const nextCode = lines.length > 0 ? Math.max(...lines.map(l => l.code)) + 1 : 1;
    const newLine: OrderLine = { id: `new-${Date.now()}`, purchase_order_id: order.id, code: nextCode, description: '', activity_id: null, units: 1, unit_price: 0, subtotal: 0, isNew: true };
    setEditingLine(newLine);
    setLineFormData({ description: '', activity_id: null, units: '1', unit_price: '0' });
  };

  const openEditLine = (line: OrderLine) => {
    setEditingLine(line);
    setLineFormData({
      description: line.description || '',
      activity_id: line.activity_id,
      units: formatNumber(line.units, 2).replace(/\./g, ''),
      unit_price: formatNumber(line.unit_price, 2).replace(/\./g, '')
    });
  };

  const saveLineFromForm = () => {
    if (!editingLine) return;
    const units = parseEuropeanNumber(lineFormData.units);
    const unitPrice = parseEuropeanNumber(lineFormData.unit_price);
    const subtotal = units * unitPrice;
    const isExisting = lines.some(l => l.id === editingLine.id);

    if (isExisting) {
      setLines(lines.map(line => line.id !== editingLine.id ? line : { ...line, description: lineFormData.description, activity_id: lineFormData.activity_id, units, unit_price: unitPrice, subtotal, isModified: !line.isNew }));
    } else {
      setLines([...lines, { ...editingLine, description: lineFormData.description, activity_id: lineFormData.activity_id, units, unit_price: unitPrice, subtotal, isNew: true }]);
    }
    setEditingLine(null);
    toast.success('Línea guardada');
  };

  const deleteLine = (id: string) => {
    const lineToDelete = lines.find(l => l.id === id);
    setLines(lines.filter(l => l.id !== id));
    if (!lineToDelete?.isNew) {
      supabase.from('purchase_order_lines').delete().eq('id', id).then(({ error }) => {
        if (error) { toast.error('Error al eliminar la línea'); fetchData(); }
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const newLines = lines.filter(l => l.isNew);
      const modifiedLines = lines.filter(l => l.isModified && !l.isNew);

      if (newLines.length > 0) {
        const { error } = await supabase.from('purchase_order_lines').insert(
          newLines.map(line => ({ purchase_order_id: line.purchase_order_id, code: line.code, description: line.description || null, activity_id: line.activity_id || null, units: line.units, unit_price: line.unit_price, subtotal: line.subtotal }))
        );
        if (error) throw error;
      }

      for (const line of modifiedLines) {
        const { error } = await supabase.from('purchase_order_lines').update({ description: line.description || null, activity_id: line.activity_id || null, units: line.units, unit_price: line.unit_price, subtotal: line.subtotal }).eq('id', line.id);
        if (error) throw error;
      }

      const { error: orderError } = await supabase.from('purchase_orders').update({ subtotal: orderTotals.subtotal, vat_amount: orderTotals.vat_amount, total: orderTotals.total }).eq('id', order.id);
      if (orderError) throw orderError;

      toast.success('Líneas guardadas correctamente');
      onClose();
    } catch (error) {
      console.error('Error saving lines:', error);
      toast.error('Error al guardar las líneas');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const newSubtotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
    const effectiveVatRate = order.vat_rate === -1 ? 0 : order.vat_rate;
    const vatAmount = newSubtotal * effectiveVatRate / 100;
    setOrderTotals({ subtotal: newSubtotal, vat_amount: vatAmount, total: newSubtotal + vatAmount });
  }, [lines, order.vat_rate]);

  if (loading) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-4xl">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Líneas de Orden de Pedido {order.order_id}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <Button variant="outline" size="sm" onClick={addNewLine} className="gap-2">
              <Plus className="h-4 w-4" /> Añadir Línea
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Cód.</TableHead>
                <TableHead>Descripción</TableHead>
                {activities.length > 0 && <TableHead className="w-[200px]">Actividad</TableHead>}
                <TableHead className="w-[80px] text-right">Uds.</TableHead>
                <TableHead className="w-[100px] text-right">€/Ud.</TableHead>
                <TableHead className="w-[100px] text-right">Subtotal</TableHead>
                <TableHead className="w-[70px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.id} className={cn(line.isNew && "bg-green-50 dark:bg-green-950/20", line.isModified && "bg-amber-50 dark:bg-amber-950/20")}>
                  <TableCell className="font-mono text-xs">{line.code}</TableCell>
                  <TableCell className="text-sm">{line.description || '-'}</TableCell>
                  {activities.length > 0 && (
                    <TableCell className="text-xs">{activities.find(a => a.id === line.activity_id)?.activityId || '-'}</TableCell>
                  )}
                  <TableCell className="text-right text-sm">{formatNumber(line.units, 2)}</TableCell>
                  <TableCell className="text-right text-sm">{formatCurrency(line.unit_price)}</TableCell>
                  <TableCell className="text-right font-medium text-sm">{formatCurrency(line.subtotal)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditLine(line)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteLine(line.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {lines.length === 0 && (
                <TableRow>
                  <TableCell colSpan={activities.length > 0 ? 7 : 6} className="text-center text-muted-foreground py-8">
                    No hay líneas. Añade la primera.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-64 space-y-1 bg-muted/50 rounded-lg p-4">
              <div className="flex justify-between text-sm">
                <span>Subtotal:</span>
                <span>{formatCurrency(orderTotals.subtotal)}</span>
              </div>
              {order.vat_rate === -1 ? (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>IVA no incluido</span><span>-</span>
                </div>
              ) : (
                <div className="flex justify-between text-sm">
                  <span>IVA ({order.vat_rate}%):</span>
                  <span>{formatCurrency(orderTotals.vat_amount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t pt-2">
                <span>Total:</span>
                <span className="text-primary">{formatCurrency(orderTotals.total)}</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Guardando...' : 'Guardar Líneas'}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Line Edit Dialog */}
      {editingLine && (
        <Dialog open onOpenChange={() => setEditingLine(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Línea {editingLine.code}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Descripción</Label>
                <Input value={lineFormData.description} onChange={(e) => setLineFormData({ ...lineFormData, description: e.target.value })} placeholder="Descripción del concepto..." />
              </div>
              {activities.length > 0 && (
                <div className="space-y-2">
                  <Label>Actividad</Label>
                  <ActivitySelector activities={activities} selectedActivityId={lineFormData.activity_id} onSelect={(id) => setLineFormData({ ...lineFormData, activity_id: id })} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Unidades</Label>
                  <Input value={lineFormData.units} onChange={(e) => setLineFormData({ ...lineFormData, units: e.target.value })} placeholder="1" />
                </div>
                <div className="space-y-2">
                  <Label>€/Unidad</Label>
                  <Input value={lineFormData.unit_price} onChange={(e) => setLineFormData({ ...lineFormData, unit_price: e.target.value })} placeholder="0,00" />
                </div>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                Subtotal: <span className="font-semibold text-foreground">{formatCurrency(parseEuropeanNumber(lineFormData.units) * parseEuropeanNumber(lineFormData.unit_price))}</span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingLine(null)}>Cancelar</Button>
              <Button onClick={saveLineFromForm}>Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
