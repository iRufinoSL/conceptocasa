import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Plus, Trash2, Save, Check, ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

interface Invoice {
  id: string;
  invoice_number: number;
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
}

interface InvoiceLine {
  id: string;
  invoice_id: string;
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
  invoice: Invoice;
  onClose: () => void;
}

export function InvoiceLinesEditor({ invoice, onClose }: Props) {
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invoiceTotals, setInvoiceTotals] = useState({
    subtotal: invoice.subtotal,
    vat_amount: invoice.vat_amount,
    total: invoice.total
  });

  useEffect(() => {
    fetchData();
  }, [invoice.id, invoice.budget_id]);

  const fetchData = async () => {
    try {
      // Fetch existing lines
      const { data: linesData, error: linesError } = await supabase
        .from('invoice_lines')
        .select('*')
        .eq('invoice_id', invoice.id)
        .order('code');

      if (linesError) throw linesError;
      setLines(linesData || []);

      // Fetch activities if budget is selected
      if (invoice.budget_id) {
        const { data: activitiesData, error: activitiesError } = await supabase
          .from('budget_activities')
          .select('id, code, name')
          .eq('budget_id', invoice.budget_id)
          .order('code');

        if (activitiesError) throw activitiesError;
        setActivities(activitiesData || []);
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
    const newLine: InvoiceLine = {
      id: `new-${Date.now()}`,
      invoice_id: invoice.id,
      code: nextCode,
      description: '',
      activity_id: null,
      units: 1,
      unit_price: 0,
      subtotal: 0,
      isNew: true
    };
    setLines([...lines, newLine]);
  };

  const updateLine = (id: string, field: keyof InvoiceLine, value: any) => {
    setLines(lines.map(line => {
      if (line.id !== id) return line;
      
      const updated = { ...line, [field]: value, isModified: !line.isNew };
      
      // Recalculate subtotal when units or unit_price change
      if (field === 'units' || field === 'unit_price') {
        const units = field === 'units' ? value : updated.units;
        const unitPrice = field === 'unit_price' ? value : updated.unit_price;
        updated.subtotal = units * unitPrice;
      }
      
      return updated;
    }));

    // Recalculate invoice totals
    setTimeout(() => {
      const newSubtotal = lines.reduce((sum, line) => {
        if (line.id === id) {
          const units = field === 'units' ? value : line.units;
          const unitPrice = field === 'unit_price' ? value : line.unit_price;
          return sum + (units * unitPrice);
        }
        return sum + line.subtotal;
      }, 0);
      
      const vatAmount = newSubtotal * invoice.vat_rate / 100;
      setInvoiceTotals({
        subtotal: newSubtotal,
        vat_amount: vatAmount,
        total: newSubtotal + vatAmount
      });
    }, 0);
  };

  const deleteLine = (id: string) => {
    const lineToDelete = lines.find(l => l.id === id);
    const newLines = lines.filter(l => l.id !== id);
    setLines(newLines);

    // Recalculate totals
    const newSubtotal = newLines.reduce((sum, line) => sum + line.subtotal, 0);
    const vatAmount = newSubtotal * invoice.vat_rate / 100;
    setInvoiceTotals({
      subtotal: newSubtotal,
      vat_amount: vatAmount,
      total: newSubtotal + vatAmount
    });

    // If it's an existing line, delete from database
    if (!lineToDelete?.isNew) {
      supabase
        .from('invoice_lines')
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) {
            toast.error('Error al eliminar la línea');
            fetchData(); // Reload on error
          }
        });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Separate new and modified lines
      const newLines = lines.filter(l => l.isNew);
      const modifiedLines = lines.filter(l => l.isModified && !l.isNew);

      // Insert new lines
      if (newLines.length > 0) {
        const { error: insertError } = await supabase
          .from('invoice_lines')
          .insert(newLines.map(line => ({
            invoice_id: line.invoice_id,
            code: line.code,
            description: line.description || null,
            activity_id: line.activity_id || null,
            units: line.units,
            unit_price: line.unit_price,
            subtotal: line.subtotal
          })));

        if (insertError) throw insertError;
      }

      // Update modified lines
      for (const line of modifiedLines) {
        const { error: updateError } = await supabase
          .from('invoice_lines')
          .update({
            description: line.description || null,
            activity_id: line.activity_id || null,
            units: line.units,
            unit_price: line.unit_price,
            subtotal: line.subtotal
          })
          .eq('id', line.id);

        if (updateError) throw updateError;
      }

      toast.success('Líneas guardadas correctamente');
      onClose();
    } catch (error) {
      console.error('Error saving lines:', error);
      toast.error('Error al guardar las líneas');
    } finally {
      setSaving(false);
    }
  };

  // Recalculate totals when lines change
  useEffect(() => {
    const newSubtotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
    const vatAmount = newSubtotal * invoice.vat_rate / 100;
    setInvoiceTotals({
      subtotal: newSubtotal,
      vat_amount: vatAmount,
      total: newSubtotal + vatAmount
    });
  }, [lines, invoice.vat_rate]);

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
          <DialogTitle>
            Líneas de Factura #{invoice.invoice_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={addNewLine} className="gap-2">
              <Plus className="h-4 w-4" />
              Añadir Línea
            </Button>
          </div>

          {lines.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay líneas. Añade la primera línea de factura.
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Cód.</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="w-52">Actividad</TableHead>
                    <TableHead className="w-24 text-right">Uds.</TableHead>
                    <TableHead className="w-32 text-right">€/Ud.</TableHead>
                    <TableHead className="w-32 text-right">SubTotal</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.id} className={line.isNew || line.isModified ? 'bg-muted/30' : ''}>
                      <TableCell className="font-mono text-sm">
                        {line.code}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={line.description || ''}
                          onChange={(e) => updateLine(line.id, 'description', e.target.value)}
                          placeholder="Descripción..."
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        {activities.length > 0 ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                className="h-8 w-full justify-between text-xs font-normal"
                              >
                                <span className="truncate">
                                  {line.activity_id
                                    ? (() => {
                                        const activity = activities.find(a => a.id === line.activity_id);
                                        return activity ? `${activity.code} - ${activity.name}` : 'Seleccionar...';
                                      })()
                                    : 'Sin actividad'}
                                </span>
                                <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[300px] p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Buscar actividad..." className="h-9" />
                                <CommandList>
                                  <CommandEmpty>No se encontraron actividades.</CommandEmpty>
                                  <CommandGroup>
                                    <CommandItem
                                      value="sin-actividad"
                                      onSelect={() => updateLine(line.id, 'activity_id', null)}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          !line.activity_id ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      Sin actividad
                                    </CommandItem>
                                    {activities.map((activity) => (
                                      <CommandItem
                                        key={activity.id}
                                        value={`${activity.code} ${activity.name}`}
                                        onSelect={() => updateLine(line.id, 'activity_id', activity.id)}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            line.activity_id === activity.id ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                        <span className="truncate">{activity.code} - {activity.name}</span>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            {invoice.budget_id ? 'Sin actividades' : 'Sin presupuesto'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={line.units}
                          onChange={(e) => updateLine(line.id, 'units', parseFloat(e.target.value) || 0)}
                          className="h-8 text-right"
                          step="0.01"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={line.unit_price}
                          onChange={(e) => updateLine(line.id, 'unit_price', parseFloat(e.target.value) || 0)}
                          className="h-8 text-right"
                          step="0.01"
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(line.subtotal)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteLine(line.id)}
                          className="h-8 w-8"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-64 space-y-2 p-4 bg-muted/50 rounded-lg">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-medium">{formatCurrency(invoiceTotals.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">IVA ({invoice.vat_rate}%):</span>
                <span className="font-medium">{formatCurrency(invoiceTotals.vat_amount)}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-semibold">Total:</span>
                <span className="font-semibold">{formatCurrency(invoiceTotals.total)}</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Guardando...' : 'Guardar Líneas'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
