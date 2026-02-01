-- Add new buying list fields to budget_activity_resources
ALTER TABLE public.budget_activity_resources
ADD COLUMN IF NOT EXISTS purchase_vat_percent numeric DEFAULT 21.00,
ADD COLUMN IF NOT EXISTS purchase_units numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS purchase_unit_measure text DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.budget_activity_resources.purchase_vat_percent IS 'VAT percentage for purchases, default 21%';
COMMENT ON COLUMN public.budget_activity_resources.purchase_units IS 'Manual purchase units, defaults to calculated units if null';
COMMENT ON COLUMN public.budget_activity_resources.purchase_unit_measure IS 'Unit measure for purchases, defaults to resource unit if null';