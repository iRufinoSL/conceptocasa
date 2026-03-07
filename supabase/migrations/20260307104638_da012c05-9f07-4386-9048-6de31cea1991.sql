
CREATE TABLE public.deletion_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID REFERENCES public.presupuestos(id) ON DELETE CASCADE NOT NULL,
  module TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  entity_name TEXT,
  backup_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  restored_at TIMESTAMPTZ,
  label TEXT
);

ALTER TABLE public.deletion_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users with budget access can view deletion backups"
  ON public.deletion_backups FOR SELECT TO authenticated
  USING (public.has_presupuesto_access(auth.uid(), budget_id));

CREATE POLICY "Users with budget access can insert deletion backups"
  ON public.deletion_backups FOR INSERT TO authenticated
  WITH CHECK (public.has_presupuesto_access(auth.uid(), budget_id));

CREATE POLICY "Users with budget access can update deletion backups"
  ON public.deletion_backups FOR UPDATE TO authenticated
  USING (public.has_presupuesto_access(auth.uid(), budget_id));

CREATE POLICY "Users with budget access can delete deletion backups"
  ON public.deletion_backups FOR DELETE TO authenticated
  USING (public.has_presupuesto_access(auth.uid(), budget_id));

CREATE INDEX idx_deletion_backups_budget_module ON public.deletion_backups(budget_id, module);
