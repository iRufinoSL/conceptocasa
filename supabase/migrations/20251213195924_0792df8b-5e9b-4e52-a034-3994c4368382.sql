-- Fix the foreign key constraint: activity_id should reference budget_activities, not budget_concepts
ALTER TABLE public.budget_activity_resources 
DROP CONSTRAINT IF EXISTS budget_activity_resources_activity_id_fkey;

ALTER TABLE public.budget_activity_resources
ADD CONSTRAINT budget_activity_resources_activity_id_fkey 
FOREIGN KEY (activity_id) REFERENCES public.budget_activities(id) ON DELETE SET NULL;