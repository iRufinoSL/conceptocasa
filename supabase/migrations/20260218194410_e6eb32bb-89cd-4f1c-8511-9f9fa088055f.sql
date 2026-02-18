
-- Table to store module snapshots (floor plans, activities, resources)
CREATE TABLE public.module_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  module TEXT NOT NULL CHECK (module IN ('plano', 'actividades', 'recursos')),
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('auto', 'manual', 'daily_first', 'daily_mid', 'daily_last')),
  snapshot_data JSONB NOT NULL DEFAULT '{}',
  label TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Index for fast lookups by budget + module
CREATE INDEX idx_module_snapshots_budget_module ON public.module_snapshots(budget_id, module, created_at DESC);
CREATE INDEX idx_module_snapshots_type ON public.module_snapshots(snapshot_type, created_at DESC);

-- Enable RLS
ALTER TABLE public.module_snapshots ENABLE ROW LEVEL SECURITY;

-- Policies: users with budget access can view/create snapshots
CREATE POLICY "Users with budget access can view snapshots"
  ON public.module_snapshots FOR SELECT
  USING (public.has_presupuesto_access(auth.uid(), budget_id));

CREATE POLICY "Users with budget access can create snapshots"
  ON public.module_snapshots FOR INSERT
  WITH CHECK (public.has_presupuesto_access(auth.uid(), budget_id));

CREATE POLICY "Users with budget access can delete snapshots"
  ON public.module_snapshots FOR DELETE
  USING (public.has_presupuesto_access(auth.uid(), budget_id));

-- Enable realtime for snapshot notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.module_snapshots;
