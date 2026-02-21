ALTER TABLE public.budget_floor_plans
  ADD COLUMN IF NOT EXISTS scale_mode text NOT NULL DEFAULT 'metros',
  ADD COLUMN IF NOT EXISTS block_length_mm numeric NOT NULL DEFAULT 625,
  ADD COLUMN IF NOT EXISTS block_height_mm numeric NOT NULL DEFAULT 250,
  ADD COLUMN IF NOT EXISTS block_width_mm numeric NOT NULL DEFAULT 300;