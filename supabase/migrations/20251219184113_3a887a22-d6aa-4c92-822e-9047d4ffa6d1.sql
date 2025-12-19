-- Create budget_work_areas table
CREATE TABLE public.budget_work_areas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'Nivel 1',
  work_area TEXT NOT NULL DEFAULT 'Espacios',
  area_id TEXT GENERATED ALWAYS AS (work_area || '/' || level) STORED,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.budget_work_areas ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Admins can manage budget work areas"
ON public.budget_work_areas
FOR ALL
USING (has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Users can view budget work areas for their presupuestos"
ON public.budget_work_areas
FOR SELECT
USING (has_role(auth.uid(), 'administrador'::app_role) OR has_presupuesto_access(auth.uid(), budget_id));

-- Create junction table for work_areas and activities (many-to-many)
CREATE TABLE public.budget_work_area_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  work_area_id UUID NOT NULL REFERENCES public.budget_work_areas(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES public.budget_activities(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(work_area_id, activity_id)
);

-- Enable RLS
ALTER TABLE public.budget_work_area_activities ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Admins can manage work area activities"
ON public.budget_work_area_activities
FOR ALL
USING (has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Users can view work area activities for their presupuestos"
ON public.budget_work_area_activities
FOR SELECT
USING (has_role(auth.uid(), 'administrador'::app_role) OR 
  EXISTS (
    SELECT 1 FROM public.budget_work_areas bwa
    WHERE bwa.id = budget_work_area_activities.work_area_id
    AND has_presupuesto_access(auth.uid(), bwa.budget_id)
  )
);

-- Create junction table for work_areas and measurements (many-to-many)
CREATE TABLE public.budget_work_area_measurements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  work_area_id UUID NOT NULL REFERENCES public.budget_work_areas(id) ON DELETE CASCADE,
  measurement_id UUID NOT NULL REFERENCES public.budget_measurements(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(work_area_id, measurement_id)
);

-- Enable RLS
ALTER TABLE public.budget_work_area_measurements ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Admins can manage work area measurements"
ON public.budget_work_area_measurements
FOR ALL
USING (has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Users can view work area measurements for their presupuestos"
ON public.budget_work_area_measurements
FOR SELECT
USING (has_role(auth.uid(), 'administrador'::app_role) OR 
  EXISTS (
    SELECT 1 FROM public.budget_work_areas bwa
    WHERE bwa.id = budget_work_area_measurements.work_area_id
    AND has_presupuesto_access(auth.uid(), bwa.budget_id)
  )
);

-- Create indexes for better performance
CREATE INDEX idx_budget_work_areas_budget_id ON public.budget_work_areas(budget_id);
CREATE INDEX idx_budget_work_areas_level ON public.budget_work_areas(level);
CREATE INDEX idx_budget_work_areas_work_area ON public.budget_work_areas(work_area);
CREATE INDEX idx_budget_work_area_activities_work_area_id ON public.budget_work_area_activities(work_area_id);
CREATE INDEX idx_budget_work_area_activities_activity_id ON public.budget_work_area_activities(activity_id);
CREATE INDEX idx_budget_work_area_measurements_work_area_id ON public.budget_work_area_measurements(work_area_id);
CREATE INDEX idx_budget_work_area_measurements_measurement_id ON public.budget_work_area_measurements(measurement_id);

-- Create trigger for updated_at
CREATE TRIGGER update_budget_work_areas_updated_at
BEFORE UPDATE ON public.budget_work_areas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();