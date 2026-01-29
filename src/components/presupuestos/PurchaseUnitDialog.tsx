import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { UNIT_MEASURES } from '@/types/resource';
import { formatCurrency } from '@/lib/format-utils';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Calculator, Package } from 'lucide-react';

interface Resource {
  id: string;
  name: string;
  unit: string | null;
  external_unit_cost: number | null;
  manual_units: number | null;
  related_units: number | null;
  purchase_unit?: string | null;
  purchase_unit_quantity?: number | null;
  purchase_unit_cost?: number | null;
  conversion_factor?: number | null;
  supplier_name?: string | null;
}

interface PurchaseUnitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource: Resource | null;
  onSaved: () => void;
}

export function PurchaseUnitDialog({ open, onOpenChange, resource, onSaved }: PurchaseUnitDialogProps) {
  const [purchaseUnit, setPurchaseUnit] = useState('');
  const [conversionFactor, setConversionFactor] = useState('1');
  const [purchaseUnitCost, setPurchaseUnitCost] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (resource) {
      setPurchaseUnit(resource.purchase_unit || resource.unit || 'ud');
      setConversionFactor(resource.conversion_factor?.toString() || '1');
      setPurchaseUnitCost(resource.purchase_unit_cost?.toString() || '');
    }
  }, [resource]);

  if (!resource) return null;

  const calculatedUnits = resource.manual_units ?? resource.related_units ?? 0;
  const factor = parseFloat(conversionFactor) || 1;
  const purchaseQuantity = calculatedUnits * factor;
  const unitCost = parseFloat(purchaseUnitCost) || 0;
  const totalPurchaseCost = purchaseQuantity * unitCost;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('budget_activity_resources')
        .update({
          purchase_unit: purchaseUnit || null,
          purchase_unit_quantity: purchaseQuantity,
          purchase_unit_cost: unitCost || null,
          conversion_factor: factor,
        })
        .eq('id', resource.id);

      if (error) throw error;

      toast.success('Unidades de compra actualizadas');
      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving purchase units:', error);
      toast.error('Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Unidades de Compra
          </DialogTitle>
          <DialogDescription>
            Convierte las unidades calculadas a unidades de compra para el proveedor
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Resource Info */}
          <div className="p-3 bg-muted/50 rounded-lg space-y-1">
            <p className="font-medium">{resource.name}</p>
            {resource.supplier_name && (
              <p className="text-sm text-muted-foreground">Proveedor: {resource.supplier_name}</p>
            )}
          </div>

          {/* Calculation units display */}
          <div className="p-3 border rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">Unidades calculadas (presupuesto)</p>
            <div className="flex items-center gap-2">
              <span className="text-xl font-semibold">
                {calculatedUnits.toLocaleString('es-ES', { maximumFractionDigits: 2 })}
              </span>
              <Badge variant="outline">{resource.unit || 'ud'}</Badge>
              <span className="text-sm text-muted-foreground">
                × {formatCurrency(resource.external_unit_cost || 0)}
              </span>
            </div>
          </div>

          {/* Conversion Section */}
          <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-end">
            <div className="space-y-2">
              <Label>Factor de conversión</Label>
              <Input
                type="number"
                step="0.001"
                value={conversionFactor}
                onChange={(e) => setConversionFactor(e.target.value)}
                placeholder="1"
              />
              <p className="text-xs text-muted-foreground">
                Ej: Para m2 a m3 con 15cm altura: 0.15
              </p>
            </div>

            <ArrowRight className="h-4 w-4 text-muted-foreground mb-8" />

            <div className="space-y-2">
              <Label>Unidad de compra</Label>
              <Select value={purchaseUnit} onValueChange={setPurchaseUnit}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_MEASURES.map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Purchase unit cost */}
          <div className="space-y-2">
            <Label>Coste por unidad de compra ({purchaseUnit || 'ud'})</Label>
            <Input
              type="number"
              step="0.01"
              value={purchaseUnitCost}
              onChange={(e) => setPurchaseUnitCost(e.target.value)}
              placeholder="0.00"
            />
          </div>

          {/* Result Preview */}
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Calculator className="h-4 w-4 text-primary" />
              <p className="font-medium text-primary">Resumen de compra</p>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Cantidad a comprar</p>
                <p className="text-lg font-semibold">
                  {purchaseQuantity.toLocaleString('es-ES', { maximumFractionDigits: 3 })} {purchaseUnit || 'ud'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Coste total compra</p>
                <p className="text-lg font-semibold">{formatCurrency(totalPurchaseCost)}</p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PurchaseUnitDialog;
