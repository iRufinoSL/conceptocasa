
-- Junction table linking tolosa_items to budget_measurements
CREATE TABLE public.tolosa_item_measurements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tolosa_item_id UUID NOT NULL REFERENCES public.tolosa_items(id) ON DELETE CASCADE,
  measurement_id UUID NOT NULL REFERENCES public.budget_measurements(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tolosa_item_id, measurement_id)
);

-- Enable RLS
ALTER TABLE public.tolosa_item_measurements ENABLE ROW LEVEL SECURITY;

-- RLS policies: access based on budget access through tolosa_items
CREATE POLICY "Users can view linked measurements"
ON public.tolosa_item_measurements FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tolosa_items ti
    WHERE ti.id = tolosa_item_id
    AND public.has_presupuesto_access(auth.uid(), ti.budget_id)
  )
);

CREATE POLICY "Admins and colaboradores can insert measurement links"
ON public.tolosa_item_measurements FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tolosa_items ti
    WHERE ti.id = tolosa_item_id
    AND public.has_presupuesto_access(auth.uid(), ti.budget_id)
  )
);

CREATE POLICY "Admins and colaboradores can delete measurement links"
ON public.tolosa_item_measurements FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.tolosa_items ti
    WHERE ti.id = tolosa_item_id
    AND public.has_presupuesto_access(auth.uid(), ti.budget_id)
  )
);

-- Index for fast lookups
CREATE INDEX idx_tolosa_item_measurements_item ON public.tolosa_item_measurements(tolosa_item_id);
CREATE INDEX idx_tolosa_item_measurements_measurement ON public.tolosa_item_measurements(measurement_id);
