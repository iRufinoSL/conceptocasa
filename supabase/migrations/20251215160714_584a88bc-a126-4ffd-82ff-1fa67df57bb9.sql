-- Add uses_measurement boolean field to budget_activities (default true = YES)
ALTER TABLE public.budget_activities 
ADD COLUMN uses_measurement boolean NOT NULL DEFAULT true;

-- Add comment for clarity
COMMENT ON COLUMN public.budget_activities.uses_measurement IS 'If false (NO), related units from measurements should be treated as 0';