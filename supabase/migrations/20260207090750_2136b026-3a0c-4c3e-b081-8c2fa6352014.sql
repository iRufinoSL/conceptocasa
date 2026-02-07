
-- Add floor, size_text, and count_raw columns to budget_measurements
-- These store the original XML data from ChiefArchitect imports

ALTER TABLE public.budget_measurements
ADD COLUMN floor text DEFAULT null,
ADD COLUMN size_text text DEFAULT null,
ADD COLUMN count_raw numeric DEFAULT null;

COMMENT ON COLUMN public.budget_measurements.floor IS 'Floor/plant from ChiefArchitect XML';
COMMENT ON COLUMN public.budget_measurements.size_text IS 'Original Size text from ChiefArchitect XML';
COMMENT ON COLUMN public.budget_measurements.count_raw IS 'Raw Count value from ChiefArchitect XML before conversion';
