-- Create table for tab visibility settings per role
CREATE TABLE public.tab_visibility_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL UNIQUE,
  visible_tabs TEXT[] NOT NULL DEFAULT ARRAY['anteproyecto', 'cuanto-cuesta', 'actividades', 'zonas', 'fases', 'timeline', 'mediciones', 'espacios', 'contactos', 'config'],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tab_visibility_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can manage tab visibility settings
CREATE POLICY "Admins can manage tab visibility settings"
ON public.tab_visibility_settings
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'administrador'::app_role))
WITH CHECK (has_role(auth.uid(), 'administrador'::app_role));

-- All authenticated users can read settings (to know which tabs to show)
CREATE POLICY "Authenticated users can read tab visibility settings"
ON public.tab_visibility_settings
FOR SELECT
TO authenticated
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_tab_visibility_settings_updated_at
BEFORE UPDATE ON public.tab_visibility_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default settings for each role
INSERT INTO public.tab_visibility_settings (role, visible_tabs) VALUES
  ('administrador', ARRAY['anteproyecto', 'cuanto-cuesta', 'actividades', 'zonas', 'fases', 'timeline', 'mediciones', 'espacios', 'resumen', 'contactos', 'config', 'recursos']),
  ('colaborador', ARRAY['anteproyecto', 'cuanto-cuesta', 'actividades', 'zonas', 'fases', 'timeline', 'mediciones', 'espacios', 'contactos', 'config']),
  ('cliente', ARRAY['anteproyecto', 'cuanto-cuesta', 'actividades', 'fases', 'timeline', 'contactos']);