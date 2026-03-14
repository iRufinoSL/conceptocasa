CREATE TABLE public.budget_activity_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.budget_activities(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.budget_floor_plan_rooms(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (activity_id, workspace_id)
);

ALTER TABLE public.budget_activity_workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read activity workspaces"
  ON public.budget_activity_workspaces FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Users can insert activity workspaces"
  ON public.budget_activity_workspaces FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Users can update activity workspaces"
  ON public.budget_activity_workspaces FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Users can delete activity workspaces"
  ON public.budget_activity_workspaces FOR DELETE
  TO authenticated USING (true);