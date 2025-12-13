-- Add related_units field to budget_activity_resources for "Uds relacionadas"
ALTER TABLE public.budget_activity_resources
ADD COLUMN IF NOT EXISTS related_units numeric DEFAULT NULL;