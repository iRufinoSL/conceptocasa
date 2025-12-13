-- Add phase_id to budget_activities
ALTER TABLE public.budget_activities 
ADD COLUMN phase_id UUID REFERENCES public.budget_phases(id) ON DELETE SET NULL;

-- Create index on phase_id
CREATE INDEX idx_budget_activities_phase_id ON public.budget_activities(phase_id);