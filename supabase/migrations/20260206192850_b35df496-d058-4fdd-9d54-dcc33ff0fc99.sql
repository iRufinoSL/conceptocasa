-- Add source and classification metadata to budget_measurements
-- This allows tracking where measurements came from (ChiefArchitect, Excel, manual)
-- and their original classification grouping

ALTER TABLE public.budget_measurements
ADD COLUMN IF NOT EXISTS source text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS source_classification text DEFAULT NULL;

-- Add index for efficient filtering by source
CREATE INDEX IF NOT EXISTS idx_budget_measurements_source ON public.budget_measurements(source);
CREATE INDEX IF NOT EXISTS idx_budget_measurements_source_classification ON public.budget_measurements(source_classification);