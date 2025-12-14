-- Create budget_measurements table
CREATE TABLE public.budget_measurements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  manual_units NUMERIC,
  measurement_unit TEXT DEFAULT 'ud',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create self-referential many-to-many relationship table for measurements
CREATE TABLE public.budget_measurement_relations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  measurement_id UUID NOT NULL REFERENCES public.budget_measurements(id) ON DELETE CASCADE,
  related_measurement_id UUID NOT NULL REFERENCES public.budget_measurements(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT no_self_relation CHECK (measurement_id != related_measurement_id),
  CONSTRAINT unique_measurement_relation UNIQUE (measurement_id, related_measurement_id)
);

-- Add measurement_id to budget_activities (one activity can only belong to one measurement)
ALTER TABLE public.budget_activities 
ADD COLUMN measurement_id UUID REFERENCES public.budget_measurements(id) ON DELETE SET NULL;

-- Enable RLS on budget_measurements
ALTER TABLE public.budget_measurements ENABLE ROW LEVEL SECURITY;

-- RLS policies for budget_measurements
CREATE POLICY "Admins can manage budget measurements" 
ON public.budget_measurements 
FOR ALL 
USING (has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Users can view budget measurements for their presupuestos" 
ON public.budget_measurements 
FOR SELECT 
USING (has_role(auth.uid(), 'administrador'::app_role) OR has_presupuesto_access(auth.uid(), budget_id));

-- Enable RLS on budget_measurement_relations
ALTER TABLE public.budget_measurement_relations ENABLE ROW LEVEL SECURITY;

-- RLS policies for budget_measurement_relations
CREATE POLICY "Admins can manage measurement relations" 
ON public.budget_measurement_relations 
FOR ALL 
USING (has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Users can view measurement relations for their presupuestos" 
ON public.budget_measurement_relations 
FOR SELECT 
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR 
  EXISTS (
    SELECT 1 FROM public.budget_measurements bm 
    WHERE bm.id = budget_measurement_relations.measurement_id 
    AND has_presupuesto_access(auth.uid(), bm.budget_id)
  )
);

-- Create trigger for updated_at on budget_measurements
CREATE TRIGGER update_budget_measurements_updated_at
BEFORE UPDATE ON public.budget_measurements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();