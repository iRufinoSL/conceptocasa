-- Add time fields to budget_activity_resources for task scheduling
ALTER TABLE public.budget_activity_resources
ADD COLUMN IF NOT EXISTS start_time text,
ADD COLUMN IF NOT EXISTS end_time text;