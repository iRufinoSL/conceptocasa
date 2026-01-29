-- Add purchase unit fields to budget_activity_resources
ALTER TABLE public.budget_activity_resources
ADD COLUMN IF NOT EXISTS purchase_unit text,
ADD COLUMN IF NOT EXISTS purchase_unit_quantity numeric,
ADD COLUMN IF NOT EXISTS purchase_unit_cost numeric,
ADD COLUMN IF NOT EXISTS conversion_factor numeric DEFAULT 1;

-- Add comment explaining the conversion
COMMENT ON COLUMN public.budget_activity_resources.purchase_unit IS 'Unit used for purchasing (e.g., m3 for concrete)';
COMMENT ON COLUMN public.budget_activity_resources.purchase_unit_quantity IS 'Quantity in purchase units';
COMMENT ON COLUMN public.budget_activity_resources.purchase_unit_cost IS 'Cost per purchase unit';
COMMENT ON COLUMN public.budget_activity_resources.conversion_factor IS 'Factor to convert from calculation units to purchase units';