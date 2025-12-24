-- Add opciones field to budget_activities table
-- Options can be A, B, C (array), by default all are selected (A, B, C)
ALTER TABLE public.budget_activities 
ADD COLUMN opciones TEXT[] NOT NULL DEFAULT ARRAY['A', 'B', 'C']::TEXT[];