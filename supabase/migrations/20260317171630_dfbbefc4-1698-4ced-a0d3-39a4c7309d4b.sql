
-- Fix 1: budget_activity_workspaces - replace permissive policies with budget-scoped access
DROP POLICY IF EXISTS "Users can read activity workspaces" ON public.budget_activity_workspaces;
DROP POLICY IF EXISTS "Users can insert activity workspaces" ON public.budget_activity_workspaces;
DROP POLICY IF EXISTS "Users can update activity workspaces" ON public.budget_activity_workspaces;
DROP POLICY IF EXISTS "Users can delete activity workspaces" ON public.budget_activity_workspaces;

CREATE POLICY "Budget-scoped read activity workspaces"
  ON public.budget_activity_workspaces FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.budget_activities ba
      WHERE ba.id = budget_activity_workspaces.activity_id
        AND public.has_presupuesto_access(auth.uid(), ba.budget_id)
    )
  );

CREATE POLICY "Budget-scoped insert activity workspaces"
  ON public.budget_activity_workspaces FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.budget_activities ba
      WHERE ba.id = budget_activity_workspaces.activity_id
        AND public.has_presupuesto_access(auth.uid(), ba.budget_id)
    )
  );

CREATE POLICY "Budget-scoped update activity workspaces"
  ON public.budget_activity_workspaces FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.budget_activities ba
      WHERE ba.id = budget_activity_workspaces.activity_id
        AND public.has_presupuesto_access(auth.uid(), ba.budget_id)
    )
  );

CREATE POLICY "Budget-scoped delete activity workspaces"
  ON public.budget_activity_workspaces FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.budget_activities ba
      WHERE ba.id = budget_activity_workspaces.activity_id
        AND public.has_presupuesto_access(auth.uid(), ba.budget_id)
    )
  );

-- Fix 2: work_report_workers - replace unfiltered SELECT with budget-scoped check
DROP POLICY IF EXISTS "Users can view work report workers" ON public.work_report_workers;

CREATE POLICY "Users can view work report workers"
  ON public.work_report_workers FOR SELECT
  TO authenticated
  USING (
    work_report_id IN (
      SELECT wr.id FROM public.work_reports wr
      WHERE public.has_presupuesto_access(auth.uid(), wr.budget_id)
    )
  );
