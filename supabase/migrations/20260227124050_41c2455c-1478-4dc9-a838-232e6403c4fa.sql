-- Add eave excluded sides to floor plans
ALTER TABLE public.budget_floor_plans
ADD COLUMN eave_excluded_sides text[] DEFAULT '{}'::text[];