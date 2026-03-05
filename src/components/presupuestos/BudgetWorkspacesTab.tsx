import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Box, Pencil, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { toast } from 'sonner';

interface BudgetWorkspacesTabProps {
  budgetId: string;
  isAdmin: boolean;
}

interface Workspace {
  id: string;
  name: string;
  length: number;
  width: number;
  height: number | null;
}

export function BudgetWorkspacesTab({ budgetId, isAdmin }: BudgetWorkspacesTabProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', length: '', width: '', height: '' });

  const { data: floorPlan } = useQuery({
    queryKey: ['floor-plan-for-workspaces', budgetId],
    queryFn: async () => {
      const { data } = await supabase
        .from('budget_floor_plans')
        .select('id')
        .eq('budget_id', budgetId)
        .maybeSingle();
      return data;
    },
  });

  const { data: rooms = [], refetch } = useQuery({
    queryKey: ['workspace-rooms', floorPlan?.id],
    enabled: !!floorPlan?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('budget_floor_plan_rooms')
        .select('id, name, length, width, height')
        .eq('floor_plan_id', floorPlan!.id)
        .order('name', { ascending: true });
      return (data || []) as Workspace[];
    },
  });

  const resetForm = () => {
    setForm({ name: '', length: '', width: '', height: '' });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !floorPlan?.id) return;
    const payload = {
      name: form.name.trim(),
      length: parseFloat(form.length) || 0,
      width: parseFloat(form.width) || 0,
      height: parseFloat(form.height) || 0,
      floor_plan_id: floorPlan.id,
    };

    if (editingId) {
      const { error } = await supabase.from('budget_floor_plan_rooms').update(payload).eq('id', editingId);
      if (error) { toast.error('Error al actualizar'); return; }
      toast.success('Espacio actualizado');
    } else {
      const { error } = await supabase.from('budget_floor_plan_rooms').insert(payload);
      if (error) { toast.error('Error al crear'); return; }
      toast.success('Espacio creado');
    }
    resetForm();
    refetch();
  };

  const handleEdit = (r: Workspace) => {
    setForm({ name: r.name, length: String(r.length), width: String(r.width), height: String(r.height || '') });
    setEditingId(r.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('budget_floor_plan_rooms').delete().eq('id', id);
    if (error) { toast.error('Error al eliminar'); return; }
    toast.success('Espacio eliminado');
    refetch();
  };

  const sorted = [...rooms].sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Espacios de trabajo</h3>
        {isAdmin && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="h-3 w-3" /> Añadir
          </Button>
        )}
      </div>

      {showForm && (
        <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Label className="text-[10px]">Nombre</Label>
              <Input className="h-7 text-xs" placeholder="Ej: Cocina" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-[10px]">Largo X (m)</Label>
              <Input className="h-7 text-xs" type="number" step="0.01" placeholder="4" value={form.length} onChange={e => setForm(f => ({ ...f, length: e.target.value }))} />
            </div>
            <div>
              <Label className="text-[10px]">Ancho Y (m)</Label>
              <Input className="h-7 text-xs" type="number" step="0.01" placeholder="3" value={form.width} onChange={e => setForm(f => ({ ...f, width: e.target.value }))} />
            </div>
            <div>
              <Label className="text-[10px]">Alto Z (m)</Label>
              <Input className="h-7 text-xs" type="number" step="0.01" placeholder="3" value={form.height} onChange={e => setForm(f => ({ ...f, height: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-1 justify-end">
            <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={resetForm}>Cancelar</Button>
            <Button size="sm" className="h-6 text-[10px]" onClick={handleSave} disabled={!form.name.trim()}>
              {editingId ? 'Actualizar' : 'Crear'}
            </Button>
          </div>
        </div>
      )}

      {sorted.length === 0 && !showForm && (
        <p className="text-xs text-muted-foreground text-center py-4">No hay espacios de trabajo definidos</p>
      )}

      <div className="space-y-1.5">
        {sorted.map(r => {
          const area = r.length * r.width;
          return (
            <div key={r.id} className="flex items-center gap-2 p-2.5 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
              <Box className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{r.name}</span>
                <div className="flex flex-wrap gap-1.5 mt-0.5">
                  <Badge variant="outline" className="text-[10px] h-4 px-1">X {r.length}m</Badge>
                  <Badge variant="outline" className="text-[10px] h-4 px-1">Y {r.width}m</Badge>
                  {r.height != null && r.height > 0 && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1">Z {r.height}m</Badge>
                  )}
                  <Badge variant="secondary" className="text-[10px] h-4 px-1">📐 {area.toFixed(2)} m²</Badge>
                </div>
              </div>
              {isAdmin && (
                <div className="flex gap-0.5 shrink-0">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEdit(r)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(r.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
