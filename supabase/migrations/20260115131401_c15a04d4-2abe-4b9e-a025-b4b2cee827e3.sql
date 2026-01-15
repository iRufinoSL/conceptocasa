-- Tabla para perfiles urbanísticos vinculados a presupuestos
CREATE TABLE public.urban_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  cadastral_reference VARCHAR(20) NOT NULL,
  -- Datos del Catastro
  municipality VARCHAR(100),
  province VARCHAR(100),
  autonomous_community VARCHAR(100),
  locality VARCHAR(100),
  address TEXT,
  surface_area NUMERIC,
  land_use VARCHAR(100),
  land_class VARCHAR(100),
  cadastral_value NUMERIC,
  construction_year INTEGER,
  -- Datos urbanísticos del PGOU/Normas Subsidiarias
  urban_classification VARCHAR(100),
  urban_qualification VARCHAR(100),
  buildability_index NUMERIC,
  max_height NUMERIC,
  max_floors INTEGER,
  min_plot_area NUMERIC,
  front_setback NUMERIC,
  side_setback NUMERIC,
  rear_setback NUMERIC,
  max_occupation_percent NUMERIC,
  -- Datos del CTE
  climatic_zone VARCHAR(20),
  wind_zone VARCHAR(20),
  seismic_zone VARCHAR(20),
  snow_zone VARCHAR(20),
  -- Metadatos
  analysis_status VARCHAR(50) DEFAULT 'pending',
  analysis_notes TEXT,
  last_analyzed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id)
);

-- Tabla para regulaciones/normativas consultadas
CREATE TABLE public.urban_regulations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  regulation_type VARCHAR(50) NOT NULL,
  issuing_authority VARCHAR(100),
  publication_date DATE,
  effective_date DATE,
  document_url TEXT,
  document_path TEXT,
  scope_municipality VARCHAR(100),
  scope_province VARCHAR(100),
  scope_autonomous_community VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabla de relación entre perfiles y regulaciones consultadas
CREATE TABLE public.urban_profile_regulations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.urban_profiles(id) ON DELETE CASCADE,
  regulation_id UUID NOT NULL REFERENCES public.urban_regulations(id) ON DELETE CASCADE,
  extracted_data JSONB,
  extraction_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(profile_id, regulation_id)
);

-- Habilitar RLS
ALTER TABLE public.urban_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urban_regulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urban_profile_regulations ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para urban_profiles (acceso según acceso al presupuesto)
CREATE POLICY "Users can view urban profiles" 
ON public.urban_profiles FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can create urban profiles" 
ON public.urban_profiles FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update urban profiles" 
ON public.urban_profiles FOR UPDATE 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete urban profiles" 
ON public.urban_profiles FOR DELETE 
USING (auth.uid() IS NOT NULL);

-- Políticas RLS para urban_regulations (públicas para lectura)
CREATE POLICY "Anyone can view urban regulations" 
ON public.urban_regulations FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can manage regulations" 
ON public.urban_regulations FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Políticas RLS para urban_profile_regulations
CREATE POLICY "Users can view profile regulations" 
ON public.urban_profile_regulations FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can manage profile regulations" 
ON public.urban_profile_regulations FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Índices para mejor rendimiento
CREATE INDEX idx_urban_profiles_budget ON public.urban_profiles(budget_id);
CREATE INDEX idx_urban_profiles_cadastral ON public.urban_profiles(cadastral_reference);
CREATE INDEX idx_urban_regulations_type ON public.urban_regulations(regulation_type);
CREATE INDEX idx_urban_regulations_scope ON public.urban_regulations(scope_municipality, scope_province);

-- Trigger para actualizar updated_at
CREATE TRIGGER update_urban_profiles_updated_at
BEFORE UPDATE ON public.urban_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_urban_regulations_updated_at
BEFORE UPDATE ON public.urban_regulations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Comentarios descriptivos
COMMENT ON TABLE public.urban_profiles IS 'Perfiles urbanísticos de parcelas vinculados a presupuestos';
COMMENT ON TABLE public.urban_regulations IS 'Normativas urbanísticas consultadas (PGOU, CTE, leyes autonómicas)';
COMMENT ON TABLE public.urban_profile_regulations IS 'Relación entre perfiles y normativas con datos extraídos';