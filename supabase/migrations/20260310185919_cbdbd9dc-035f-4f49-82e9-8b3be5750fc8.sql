
-- Budget destinations: each budget can have multiple "destinos" with internal and public names
CREATE TABLE public.budget_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  internal_name TEXT NOT NULL,
  public_name TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Junction: which activities belong to which destinations
CREATE TABLE public.budget_activity_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.budget_activities(id) ON DELETE CASCADE,
  destination_id UUID NOT NULL REFERENCES public.budget_destinations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(activity_id, destination_id)
);

-- RLS
ALTER TABLE public.budget_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_activity_destinations ENABLE ROW LEVEL SECURITY;

-- Policies for budget_destinations
CREATE POLICY "Users with budget access can view destinations"
  ON public.budget_destinations FOR SELECT TO authenticated
  USING (public.has_presupuesto_access(auth.uid(), budget_id));

CREATE POLICY "Admins and colaboradores can manage destinations"
  ON public.budget_destinations FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador'::public.app_role) OR
    public.has_role(auth.uid(), 'colaborador'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'administrador'::public.app_role) OR
    public.has_role(auth.uid(), 'colaborador'::public.app_role)
  );

-- Policies for budget_activity_destinations
CREATE POLICY "Users with budget access can view activity destinations"
  ON public.budget_activity_destinations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.budget_destinations bd
      WHERE bd.id = destination_id
      AND public.has_presupuesto_access(auth.uid(), bd.budget_id)
    )
  );

CREATE POLICY "Admins and colaboradores can manage activity destinations"
  ON public.budget_activity_destinations FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador'::public.app_role) OR
    public.has_role(auth.uid(), 'colaborador'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'administrador'::public.app_role) OR
    public.has_role(auth.uid(), 'colaborador'::public.app_role)
  );

-- Trigger to auto-assign new activities to all existing destinations
CREATE OR REPLACE FUNCTION public.auto_assign_activity_destinations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.budget_activity_destinations (activity_id, destination_id)
  SELECT NEW.id, bd.id
  FROM public.budget_destinations bd
  WHERE bd.budget_id = NEW.budget_id
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_assign_activity_destinations
  AFTER INSERT ON public.budget_activities
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_activity_destinations();

-- Trigger to auto-assign new destinations to all existing activities
CREATE OR REPLACE FUNCTION public.auto_assign_destination_activities()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.budget_activity_destinations (activity_id, destination_id)
  SELECT ba.id, NEW.id
  FROM public.budget_activities ba
  WHERE ba.budget_id = NEW.budget_id
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_assign_destination_activities
  AFTER INSERT ON public.budget_destinations
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_destination_activities();
