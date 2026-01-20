-- Fix: Restrict project_profiles access to only assigned projects for colaboradores
-- This prevents colaboradores from viewing profiles of projects they're not assigned to

DROP POLICY IF EXISTS "Colaboradores can view project profiles" ON public.project_profiles;

CREATE POLICY "Colaboradores can view assigned project profiles"
ON public.project_profiles
FOR SELECT
USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'colaborador'::public.app_role)
    AND public.has_project_access(auth.uid(), project_id)
  )
);