
-- Add model budget support to presupuestos
ALTER TABLE public.presupuestos 
  ADD COLUMN IF NOT EXISTS is_model boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS model_budget_id uuid REFERENCES public.presupuestos(id) ON DELETE SET NULL;

-- Index for quick lookup of the global model
CREATE INDEX IF NOT EXISTS idx_presupuestos_is_model ON public.presupuestos(is_model) WHERE is_model = true;

-- Index for finding which model a budget is linked to  
CREATE INDEX IF NOT EXISTS idx_presupuestos_model_budget_id ON public.presupuestos(model_budget_id) WHERE model_budget_id IS NOT NULL;

-- Add 'modelo' as a valid status (the column is text, no enum constraint, so this is just for documentation)
COMMENT ON COLUMN public.presupuestos.is_model IS 'True if this budget is the global Model Budget';
COMMENT ON COLUMN public.presupuestos.model_budget_id IS 'FK to the global Model Budget this working budget syncs to';
