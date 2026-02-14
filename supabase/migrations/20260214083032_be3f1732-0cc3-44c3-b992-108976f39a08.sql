
-- Table for TO.LO.SA.system 2.0 hierarchical QUÉ items
CREATE TABLE public.tolosa_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.tolosa_items(id) ON DELETE CASCADE,
  code TEXT NOT NULL, -- e.g. '001', '001001', '001001002'
  name TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_tolosa_items_budget ON public.tolosa_items(budget_id);
CREATE INDEX idx_tolosa_items_parent ON public.tolosa_items(parent_id);
CREATE INDEX idx_tolosa_items_code ON public.tolosa_items(budget_id, code);

-- RLS
ALTER TABLE public.tolosa_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access tolosa_items"
  ON public.tolosa_items FOR ALL
  USING (public.has_role(auth.uid(), 'administrador'::public.app_role));

CREATE POLICY "Colaborador full access tolosa_items"
  ON public.tolosa_items FOR ALL
  USING (public.has_role(auth.uid(), 'colaborador'::public.app_role));

CREATE POLICY "Users with budget access can view tolosa_items"
  ON public.tolosa_items FOR SELECT
  USING (public.has_presupuesto_access(auth.uid(), budget_id));

CREATE POLICY "Users with budget access can manage tolosa_items"
  ON public.tolosa_items FOR ALL
  USING (public.has_presupuesto_access(auth.uid(), budget_id));

-- Trigger for updated_at
CREATE TRIGGER update_tolosa_items_updated_at
  BEFORE UPDATE ON public.tolosa_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
