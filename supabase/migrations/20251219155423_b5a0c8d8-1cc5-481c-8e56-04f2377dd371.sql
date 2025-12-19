-- Create table for budget spaces (Espacios de Presupuesto)
CREATE TABLE public.budget_spaces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  space_type TEXT NOT NULL DEFAULT 'Habitación',
  level TEXT NOT NULL DEFAULT 'Nivel 1',
  m2_built NUMERIC(10,2) DEFAULT 0,
  m2_livable NUMERIC(10,2) DEFAULT 0,
  observations TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.budget_spaces ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Admins can manage budget spaces"
ON public.budget_spaces
FOR ALL
USING (has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Users can view budget spaces for their presupuestos"
ON public.budget_spaces
FOR SELECT
USING (
  has_role(auth.uid(), 'administrador'::app_role) 
  OR has_presupuesto_access(auth.uid(), budget_id)
);

-- Create trigger for updated_at
CREATE TRIGGER update_budget_spaces_updated_at
BEFORE UPDATE ON public.budget_spaces
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better performance
CREATE INDEX idx_budget_spaces_budget_id ON public.budget_spaces(budget_id);
CREATE INDEX idx_budget_spaces_name ON public.budget_spaces(name);
CREATE INDEX idx_budget_spaces_level ON public.budget_spaces(level);
CREATE INDEX idx_budget_spaces_space_type ON public.budget_spaces(space_type);