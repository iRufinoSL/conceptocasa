-- Add RLS policies for colaboradores to manage their own CRM contacts

-- Allow colaboradores to create their own contacts
CREATE POLICY "Colaboradores can create contacts"
ON public.crm_contacts
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'colaborador'::app_role)
  AND created_by = auth.uid()
);

-- Allow colaboradores to update their own contacts
CREATE POLICY "Colaboradores can update own contacts"
ON public.crm_contacts
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'colaborador'::app_role)
  AND created_by = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'colaborador'::app_role)
  AND created_by = auth.uid()
);

-- Allow colaboradores to delete their own contacts
CREATE POLICY "Colaboradores can delete own contacts"
ON public.crm_contacts
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'colaborador'::app_role)
  AND created_by = auth.uid()
);