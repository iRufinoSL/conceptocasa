-- Add time_percent field to budget_phases for calculating start date based on budget duration
ALTER TABLE public.budget_phases 
ADD COLUMN IF NOT EXISTS time_percent numeric DEFAULT 0 CHECK (time_percent >= 0 AND time_percent <= 100);