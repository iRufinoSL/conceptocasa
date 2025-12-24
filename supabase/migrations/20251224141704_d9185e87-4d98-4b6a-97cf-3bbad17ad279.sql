-- Add opciones field to budget_spaces table
ALTER TABLE public.budget_spaces 
ADD COLUMN opciones TEXT[] NOT NULL DEFAULT ARRAY['A', 'B', 'C'];