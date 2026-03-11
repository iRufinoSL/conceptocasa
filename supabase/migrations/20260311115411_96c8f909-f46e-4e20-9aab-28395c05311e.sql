
-- Add activity_type and parent_activity_id to budget_activities
ALTER TABLE public.budget_activities 
  ADD COLUMN IF NOT EXISTS activity_type text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS parent_activity_id uuid REFERENCES public.budget_activities(id) ON DELETE CASCADE;

-- Index for fast lookup of children
CREATE INDEX IF NOT EXISTS idx_budget_activities_parent_activity_id 
  ON public.budget_activities(parent_activity_id) 
  WHERE parent_activity_id IS NOT NULL;

-- Index for filtering by type
CREATE INDEX IF NOT EXISTS idx_budget_activities_activity_type 
  ON public.budget_activities(activity_type) 
  WHERE activity_type != 'normal';
