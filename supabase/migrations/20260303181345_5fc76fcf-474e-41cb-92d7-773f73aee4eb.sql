
ALTER TABLE public.budget_activities
ADD COLUMN depends_on_activity_id UUID REFERENCES public.budget_activities(id) ON DELETE SET NULL;

CREATE INDEX idx_budget_activities_depends ON public.budget_activities(depends_on_activity_id);
