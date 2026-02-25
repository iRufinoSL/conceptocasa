
-- Add interior block dimension columns to budget_floor_plans
ALTER TABLE public.budget_floor_plans
  ADD COLUMN IF NOT EXISTS int_block_length_mm numeric NOT NULL DEFAULT 625,
  ADD COLUMN IF NOT EXISTS int_block_height_mm numeric NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS int_block_width_mm numeric NOT NULL DEFAULT 100;
