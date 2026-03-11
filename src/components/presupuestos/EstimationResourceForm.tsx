import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/format-utils';
import { toast } from 'sonner';

interface EstimationResourceFormProps {
  tolosItemId: string;
  budgetId: string;
  isAdmin: boolean;
}

export function EstimationResourceForm({ tolosItemId, budgetId, isAdmin }: EstimationResourceFormProps) {
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [units, setUnits] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [vatPercent, setVatPercent] = useState('21');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchResource = useCallback(async () => {
    setLoading(true);
    try {
      // Get linked resources from tolosa_item_resources
      const { data: links } = await supabase
        .from('tolosa_item_resources')
        .select('resource_id')
        .eq('tolosa_item_id', tolosItemId);

      if (!links?.length) {
        // No links found - try to find via budget_activities estimation linked to this item's code
        setLoading(false);
        return;
      }

      const resourceIds = links.map(l => l.resource_id);

      // Strategy 1: Check if any linked ID is a budget_activity (estimation type)
      const { data: activities } = await supabase
        .from('budget_activities')
        .select('id')
        .in('id', resourceIds)
        .eq('activity_type', 'estimacion');

      if (activities?.length) {
        const { data: resources } = await supabase
          .from('budget_activity_resources')
          .select('id, manual_units, external_unit_cost, purchase_vat_percent')
          .eq('activity_id', activities[0].id)
          .limit(1);

        if (resources?.length) {
          const r = resources[0];
          setResourceId(r.id);
          setUnits(String(r.manual_units ?? ''));
          setUnitPrice(String(r.external_unit_cost ?? ''));
          setVatPercent(String(r.purchase_vat_percent ?? '21'));
          setLoading(false);
          return;
        }
      }

      // Strategy 2: Check if resource_id is directly a budget_activity_resources ID
      const { data: directResources } = await supabase
        .from('budget_activity_resources')
        .select('id, manual_units, external_unit_cost, purchase_vat_percent')
        .in('id', resourceIds)
        .limit(1);

      if (directResources?.length) {
        const r = directResources[0];
        setResourceId(r.id);
        setUnits(String(r.manual_units ?? ''));
        setUnitPrice(String(r.external_unit_cost ?? ''));
        setVatPercent(String(r.purchase_vat_percent ?? '21'));
        setLoading(false);
        return;
      }

      // Strategy 3: Check if resource_id links to an activity that has resources
      const { data: anyActivities } = await supabase
        .from('budget_activities')
        .select('id')
        .in('id', resourceIds);

      if (anyActivities?.length) {
        const { data: actResources } = await supabase
          .from('budget_activity_resources')
          .select('id, manual_units, external_unit_cost, purchase_vat_percent')
          .in('activity_id', anyActivities.map(a => a.id))
          .limit(1);

        if (actResources?.length) {
          const r = actResources[0];
          setResourceId(r.id);
          setUnits(String(r.manual_units ?? ''));
          setUnitPrice(String(r.external_unit_cost ?? ''));
          setVatPercent(String(r.purchase_vat_percent ?? '21'));
        }
      }
    } catch (err) {
      console.error('EstimationResourceForm fetchResource error:', err);
    }
    setLoading(false);
  }, [tolosItemId]);

  useEffect(() => { fetchResource(); }, [fetchResource]);

  const saveField = async (field: string, value: number | null) => {
    if (!resourceId) return;
    setSaving(true);
    const { error } = await supabase
      .from('budget_activity_resources')
      .update({ [field]: value })
      .eq('id', resourceId);
    if (error) toast.error('Error al guardar');
    setSaving(false);
  };

  if (loading) return <div className="text-xs text-muted-foreground py-2">Cargando estimación...</div>;
  if (!resourceId) return <div className="text-xs text-amber-600 py-2 italic">Sin recurso de estimación vinculado</div>;

  const unitsNum = parseFloat(units) || 0;
  const priceNum = parseFloat(unitPrice) || 0;
  const vatNum = parseFloat(vatPercent) || 0;
  const subtotal = unitsNum * priceNum;
  const vatAmount = subtotal * vatNum / 100;
  const total = subtotal + vatAmount;

  return (
    <div className="border rounded-lg p-3 bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 space-y-3">
      <div className="flex items-center gap-2">
        <Badge className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/60 dark:text-amber-300 dark:border-amber-700 text-xs">
          Estimación
        </Badge>
        {saving && <span className="text-[10px] text-muted-foreground animate-pulse">Guardando...</span>}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Unidades</Label>
          <Input
            type="number"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            onBlur={() => saveField('manual_units', parseFloat(units) || null)}
            min="0"
            step="0.01"
            className="h-8 text-sm"
            disabled={!isAdmin}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Precio / Ud</Label>
          <Input
            type="number"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            onBlur={() => saveField('external_unit_cost', parseFloat(unitPrice) || null)}
            min="0"
            step="0.01"
            placeholder="0.00"
            className="h-8 text-sm"
            disabled={!isAdmin}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">% IVA</Label>
          <Select
            value={vatPercent}
            onValueChange={(v) => {
              setVatPercent(v);
              saveField('purchase_vat_percent', parseFloat(v));
            }}
            disabled={!isAdmin}
          >
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">0%</SelectItem>
              <SelectItem value="4">4%</SelectItem>
              <SelectItem value="10">10%</SelectItem>
              <SelectItem value="21">21%</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 pt-2 border-t border-amber-200 dark:border-amber-800">
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">Subtotal</p>
          <p className="text-sm font-semibold">{formatCurrency(subtotal)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">IVA ({vatNum}%)</p>
          <p className="text-sm font-medium text-muted-foreground">{formatCurrency(vatAmount)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">Total con IVA</p>
          <p className="text-sm font-bold text-primary">{formatCurrency(total)}</p>
        </div>
      </div>
    </div>
  );
}
