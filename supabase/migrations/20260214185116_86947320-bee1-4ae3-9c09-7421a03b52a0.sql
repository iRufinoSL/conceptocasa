
-- Junction table: link tolosa_items to budget_activity_resources
CREATE TABLE public.tolosa_item_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tolosa_item_id UUID NOT NULL REFERENCES public.tolosa_items(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES public.budget_activity_resources(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tolosa_item_id, resource_id)
);

CREATE INDEX idx_tolosa_item_resources_item ON public.tolosa_item_resources(tolosa_item_id);
CREATE INDEX idx_tolosa_item_resources_resource ON public.tolosa_item_resources(resource_id);

ALTER TABLE public.tolosa_item_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tolosa item resources if they have budget access"
ON public.tolosa_item_resources FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tolosa_items ti
    WHERE ti.id = tolosa_item_id
    AND public.has_presupuesto_access(auth.uid(), ti.budget_id)
  )
);

CREATE POLICY "Users can insert tolosa item resources if they have budget access"
ON public.tolosa_item_resources FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tolosa_items ti
    WHERE ti.id = tolosa_item_id
    AND public.has_presupuesto_access(auth.uid(), ti.budget_id)
  )
);

CREATE POLICY "Users can delete tolosa item resources if they have budget access"
ON public.tolosa_item_resources FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.tolosa_items ti
    WHERE ti.id = tolosa_item_id
    AND public.has_presupuesto_access(auth.uid(), ti.budget_id)
  )
);
