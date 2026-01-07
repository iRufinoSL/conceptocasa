-- 1. Add correlative project number
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS project_number SERIAL;

-- 2. Create project_profiles table for housing form data
CREATE TABLE IF NOT EXISTS public.project_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  -- Contact data
  contact_name TEXT NOT NULL,
  contact_surname TEXT,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  -- Housing structure
  num_plantas TEXT,
  m2_por_planta TEXT,
  forma_geometrica TEXT,
  tipo_tejado TEXT,
  -- Distribution
  num_habitaciones_total TEXT,
  num_habitaciones_con_bano TEXT,
  num_banos_total TEXT,
  num_habitaciones_con_vestidor TEXT,
  tipo_salon TEXT,
  tipo_cocina TEXT,
  lavanderia TEXT,
  despensa TEXT,
  -- Exterior spaces
  porche_cubierto TEXT,
  patio_descubierto TEXT,
  garaje TEXT,
  tiene_terreno TEXT,
  -- Location and budget
  poblacion TEXT,
  provincia TEXT,
  presupuesto_global TEXT,
  -- Style
  estilo_constructivo TEXT[],
  -- Additional message
  mensaje_adicional TEXT,
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on project_profiles
ALTER TABLE public.project_profiles ENABLE ROW LEVEL SECURITY;

-- RLS policies for project_profiles
CREATE POLICY "Admins can manage all project profiles"
ON public.project_profiles
FOR ALL
USING (public.has_role(auth.uid(), 'administrador'::public.app_role));

CREATE POLICY "Colaboradores can view project profiles"
ON public.project_profiles
FOR SELECT
USING (public.has_role(auth.uid(), 'colaborador'::public.app_role));

-- 3. Add source field to track where the project came from
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- 4. Update project status values to use new classification
-- We'll keep using the existing status field but with new values: prospecto, activo, archivado
-- Note: existing 'active' will map to 'activo', 'archived' boolean handles archiving

-- 5. Add unread_profile_notifications flag for dashboard alerts
CREATE TABLE IF NOT EXISTS public.system_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  related_id UUID,
  related_type TEXT,
  action_url TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  read_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS on system_alerts
ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies for system_alerts - admins can manage all
CREATE POLICY "Admins can manage system alerts"
ON public.system_alerts
FOR ALL
USING (public.has_role(auth.uid(), 'administrador'::public.app_role));

-- Create trigger to update updated_at on project_profiles
CREATE TRIGGER update_project_profiles_updated_at
BEFORE UPDATE ON public.project_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();