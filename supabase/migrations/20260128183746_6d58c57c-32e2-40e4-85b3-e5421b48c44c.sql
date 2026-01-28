-- Add description fields for each budget option
ALTER TABLE public.presupuestos 
ADD COLUMN IF NOT EXISTS option_a_description TEXT,
ADD COLUMN IF NOT EXISTS option_b_description TEXT,
ADD COLUMN IF NOT EXISTS option_c_description TEXT;