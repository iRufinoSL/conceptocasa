
ALTER TABLE public.budget_activities
ADD COLUMN is_executed boolean NOT NULL DEFAULT true;
