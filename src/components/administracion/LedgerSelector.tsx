import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, BookMarked, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';

export interface Ledger {
  id: string;
  name: string;
  code: string;
  operations_start_date: string | null;
}

const TOTAL_LEDGER_ID = '__total__';

interface Props {
  selectedLedgerId: string;
  onLedgerChange: (ledgerId: string) => void;
}

export function LedgerSelector({ selectedLedgerId, onLedgerChange }: Props) {
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLedger, setEditingLedger] = useState<Ledger | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ledgerToDelete, setLedgerToDelete] = useState<Ledger | null>(null);
  const [form, setForm] = useState({ name: '', code: '', operations_start_date: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchLedgers();
  }, []);

  const fetchLedgers = async () => {
    try {
      const { data, error } = await supabase
        .from('accounting_ledgers')
        .select('*')
        .order('name');
      if (error) throw error;
      setLedgers(data || []);

      // Auto-select first ledger if none selected
      if (!selectedLedgerId && data && data.length > 0) {
        onLedgerChange(data[0].id);
      }
    } catch (error) {
      console.error('Error fetching ledgers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNew = () => {
    setEditingLedger(null);
    setForm({ name: '', code: '', operations_start_date: '' });
    setDialogOpen(true);
  };

  const handleEdit = (ledger: Ledger) => {
    setEditingLedger(ledger);
    setForm({
      name: ledger.name,
      code: ledger.code,
      operations_start_date: ledger.operations_start_date || ''
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.code.trim()) {
      toast.error('Nombre y código son obligatorios');
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        code: form.code.trim(),
        operations_start_date: form.operations_start_date || null
      };

      if (editingLedger) {
        const { error } = await supabase
          .from('accounting_ledgers')
          .update(data)
          .eq('id', editingLedger.id);
        if (error) throw error;
        toast.success('Contabilidad actualizada');
      } else {
        const { data: newLedger, error } = await supabase
          .from('accounting_ledgers')
          .insert(data)
          .select()
          .single();
        if (error) throw error;
        toast.success('Contabilidad creada');
        if (newLedger) onLedgerChange(newLedger.id);
      }
      setDialogOpen(false);
      fetchLedgers();
    } catch (error) {
      console.error('Error saving ledger:', error);
      toast.error('Error al guardar la contabilidad');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!ledgerToDelete) return;
    try {
      const { error } = await supabase
        .from('accounting_ledgers')
        .delete()
        .eq('id', ledgerToDelete.id);
      if (error) throw error;
      toast.success('Contabilidad eliminada');
      if (selectedLedgerId === ledgerToDelete.id) {
        const remaining = ledgers.filter(l => l.id !== ledgerToDelete.id);
        onLedgerChange(remaining.length > 0 ? remaining[0].id : TOTAL_LEDGER_ID);
      }
      setDeleteDialogOpen(false);
      setLedgerToDelete(null);
      fetchLedgers();
    } catch (error: any) {
      console.error('Error deleting ledger:', error);
      toast.error('No se puede eliminar: tiene movimientos asociados');
    }
  };

  const selectedLedger = ledgers.find(l => l.id === selectedLedgerId);

  return (
    <div className="flex items-center gap-2">
      <BookMarked className="h-4 w-4 text-muted-foreground" />
      <Select value={selectedLedgerId || ''} onValueChange={onLedgerChange}>
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="Seleccionar contabilidad" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TOTAL_LEDGER_ID}>
            <span className="font-semibold">📊 Contabilidad Total</span>
          </SelectItem>
          {ledgers.map(ledger => (
            <SelectItem key={ledger.id} value={ledger.id}>
              {ledger.code} - {ledger.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedLedger && (
        <Button variant="ghost" size="icon" onClick={() => handleEdit(selectedLedger)} title="Editar contabilidad">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}

      <Button variant="ghost" size="icon" onClick={handleNew} title="Nueva contabilidad">
        <Plus className="h-4 w-4" />
      </Button>

      {selectedLedger && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => { setLedgerToDelete(selectedLedger); setDeleteDialogOpen(true); }}
          title="Eliminar contabilidad"
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingLedger ? 'Editar Contabilidad' : 'Nueva Contabilidad'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nombre</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Domus Construcciones" />
            </div>
            <div>
              <Label>Código</Label>
              <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="Ej: DOMUS" />
            </div>
            <div>
              <Label>Fecha comienzo de operaciones</Label>
              <Input type="date" value={form.operations_start_date} onChange={e => setForm(f => ({ ...f, operations_start_date: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Eliminar Contabilidad"
        description={`¿Estás seguro de eliminar la contabilidad "${ledgerToDelete?.name}"? Esta acción no se puede deshacer.`}
      />
    </div>
  );
}

export { TOTAL_LEDGER_ID };
