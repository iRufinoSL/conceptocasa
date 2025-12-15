-- Create junction table for many-to-many relationship between contacts and professional activities
CREATE TABLE public.crm_contact_professional_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  professional_activity_id UUID NOT NULL REFERENCES public.crm_professional_activities(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(contact_id, professional_activity_id)
);

-- Enable RLS
ALTER TABLE public.crm_contact_professional_activities ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage contact professional activities"
ON public.crm_contact_professional_activities
FOR ALL
USING (has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Role-based contact professional activities access"
ON public.crm_contact_professional_activities
FOR SELECT
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR 
  has_role(auth.uid(), 'colaborador'::app_role)
);

-- Migrate existing data from professional_activity_id column to junction table
INSERT INTO public.crm_contact_professional_activities (contact_id, professional_activity_id)
SELECT id, professional_activity_id 
FROM public.crm_contacts 
WHERE professional_activity_id IS NOT NULL;

-- Drop the old column (optional - keeping for now as backup, can be removed later)
-- ALTER TABLE public.crm_contacts DROP COLUMN professional_activity_id;