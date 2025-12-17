-- Add time management fields to presupuestos
ALTER TABLE public.presupuestos
ADD COLUMN IF NOT EXISTS start_date date,
ADD COLUMN IF NOT EXISTS end_date date;

-- Add time management fields to budget_phases
ALTER TABLE public.budget_phases
ADD COLUMN IF NOT EXISTS start_date date,
ADD COLUMN IF NOT EXISTS duration_days integer,
ADD COLUMN IF NOT EXISTS estimated_end_date date GENERATED ALWAYS AS (start_date + duration_days) STORED;

-- Add time management fields to budget_activities
ALTER TABLE public.budget_activities
ADD COLUMN IF NOT EXISTS start_date date,
ADD COLUMN IF NOT EXISTS duration_days integer,
ADD COLUMN IF NOT EXISTS tolerance_days integer,
ADD COLUMN IF NOT EXISTS end_date date GENERATED ALWAYS AS (start_date + COALESCE(duration_days, 0) + COALESCE(tolerance_days, 0)) STORED;