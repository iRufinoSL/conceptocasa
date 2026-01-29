-- Add actual (real) date fields to budget_phases
ALTER TABLE public.budget_phases
ADD COLUMN IF NOT EXISTS actual_start_date DATE,
ADD COLUMN IF NOT EXISTS actual_end_date DATE;

-- Add actual (real) date fields to budget_activities  
ALTER TABLE public.budget_activities
ADD COLUMN IF NOT EXISTS actual_start_date DATE,
ADD COLUMN IF NOT EXISTS actual_end_date DATE;

-- Add comments for clarity
COMMENT ON COLUMN public.budget_phases.actual_start_date IS 'Fecha de inicio real de la fase';
COMMENT ON COLUMN public.budget_phases.actual_end_date IS 'Fecha de finalización real de la fase';
COMMENT ON COLUMN public.budget_activities.actual_start_date IS 'Fecha de inicio real de la actividad';
COMMENT ON COLUMN public.budget_activities.actual_end_date IS 'Fecha de finalización real de la actividad';