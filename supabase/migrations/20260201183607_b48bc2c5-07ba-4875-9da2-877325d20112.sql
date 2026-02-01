-- Add estimated_budget field to presupuestos table
ALTER TABLE public.presupuestos 
ADD COLUMN IF NOT EXISTS estimated_budget numeric DEFAULT NULL;

-- Add estimated budget fields to budget_phases table
ALTER TABLE public.budget_phases 
ADD COLUMN IF NOT EXISTS estimated_budget_percent numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS estimated_budget_amount numeric DEFAULT NULL;

COMMENT ON COLUMN public.presupuestos.estimated_budget IS 'Presupuesto estimado total del proyecto';
COMMENT ON COLUMN public.budget_phases.estimated_budget_percent IS 'Porcentaje del presupuesto estimado asignado a esta fase';
COMMENT ON COLUMN public.budget_phases.estimated_budget_amount IS 'Importe del presupuesto estimado para esta fase (calculado o manual)';