-- Add missing write policies for colaboradores on crm_contact_relations
-- Safe to re-run: drop policies first if they already exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'crm_contact_relations'
      AND policyname = 'Colaboradores can insert contact relations for own contacts'
  ) THEN
    EXECUTE 'DROP POLICY "Colaboradores can insert contact relations for own contacts" ON public.crm_contact_relations';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'crm_contact_relations'
      AND policyname = 'Colaboradores can delete contact relations for own contacts'
  ) THEN
    EXECUTE 'DROP POLICY "Colaboradores can delete contact relations for own contacts" ON public.crm_contact_relations';
  END IF;
END$$;

-- Allow colaboradores to create relations involving at least one contact they created
CREATE POLICY "Colaboradores can insert contact relations for own contacts"
ON public.crm_contact_relations
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'colaborador'::public.app_role)
  AND (
    EXISTS (
      SELECT 1
      FROM public.crm_contacts c
      WHERE c.id = crm_contact_relations.contact_id_a
        AND c.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.crm_contacts c
      WHERE c.id = crm_contact_relations.contact_id_b
        AND c.created_by = auth.uid()
    )
  )
);

-- Allow colaboradores to delete relations involving at least one contact they created
CREATE POLICY "Colaboradores can delete contact relations for own contacts"
ON public.crm_contact_relations
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'colaborador'::public.app_role)
  AND (
    EXISTS (
      SELECT 1
      FROM public.crm_contacts c
      WHERE c.id = crm_contact_relations.contact_id_a
        AND c.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.crm_contacts c
      WHERE c.id = crm_contact_relations.contact_id_b
        AND c.created_by = auth.uid()
    )
  )
);