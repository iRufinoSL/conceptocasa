-- Create table to link budgets with contacts as clients or providers
CREATE TABLE public.budget_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  contact_role TEXT NOT NULL CHECK (contact_role IN ('cliente', 'proveedor')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(budget_id, contact_id, contact_role)
);

-- Enable RLS
ALTER TABLE public.budget_contacts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can manage budget contacts"
ON public.budget_contacts
FOR ALL
USING (has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Users can view budget contacts for their presupuestos"
ON public.budget_contacts
FOR SELECT
USING (
  has_role(auth.uid(), 'administrador'::app_role) 
  OR has_presupuesto_access(auth.uid(), budget_id)
);

-- Add index for performance
CREATE INDEX idx_budget_contacts_budget_id ON public.budget_contacts(budget_id);
CREATE INDEX idx_budget_contacts_contact_id ON public.budget_contacts(contact_id);