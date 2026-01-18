-- Fix overly permissive RLS SELECT policies on assignment tables
-- These tables expose budget/project IDs to any authenticated user

-- 1. email_budget_assignments - restrict SELECT to users with budget access
DROP POLICY IF EXISTS "Users can view email budget assignments" ON public.email_budget_assignments;
CREATE POLICY "Users can view email budget assignments with access" 
ON public.email_budget_assignments 
FOR SELECT 
USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR 
  public.has_role(auth.uid(), 'colaborador'::public.app_role) OR
  public.has_presupuesto_access(auth.uid(), budget_id)
);

-- 2. email_project_assignments - create function first to check project access
CREATE OR REPLACE FUNCTION public.has_project_access(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    public.has_role(_user_id, 'administrador'::public.app_role) OR
    public.has_role(_user_id, 'colaborador'::public.app_role) OR
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = _project_id AND p.created_by = _user_id
    )
$$;

DROP POLICY IF EXISTS "Users can view email project assignments" ON public.email_project_assignments;
CREATE POLICY "Users can view email project assignments with access" 
ON public.email_project_assignments 
FOR SELECT 
USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR 
  public.has_role(auth.uid(), 'colaborador'::public.app_role) OR
  public.has_project_access(auth.uid(), project_id)
);

-- 3. whatsapp_budget_assignments - restrict SELECT to users with budget access
DROP POLICY IF EXISTS "Users can view whatsapp budget assignments" ON public.whatsapp_budget_assignments;
CREATE POLICY "Users can view whatsapp budget assignments with access" 
ON public.whatsapp_budget_assignments 
FOR SELECT 
USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR 
  public.has_role(auth.uid(), 'colaborador'::public.app_role) OR
  public.has_presupuesto_access(auth.uid(), budget_id)
);

-- 4. whatsapp_project_assignments - restrict SELECT to users with project access
DROP POLICY IF EXISTS "Users can view whatsapp project assignments" ON public.whatsapp_project_assignments;
CREATE POLICY "Users can view whatsapp project assignments with access" 
ON public.whatsapp_project_assignments 
FOR SELECT 
USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR 
  public.has_role(auth.uid(), 'colaborador'::public.app_role) OR
  public.has_project_access(auth.uid(), project_id)
);

-- 5. urban_profile_regulations - create function to check urban profile access
CREATE OR REPLACE FUNCTION public.has_urban_profile_access(_user_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    public.has_role(_user_id, 'administrador'::public.app_role) OR
    public.has_role(_user_id, 'colaborador'::public.app_role) OR
    EXISTS (
      SELECT 1 FROM public.urban_profiles up
      WHERE up.id = _profile_id
      AND public.has_presupuesto_access(_user_id, up.budget_id)
    )
$$;

DROP POLICY IF EXISTS "Users can view urban profile regulations" ON public.urban_profile_regulations;
CREATE POLICY "Users can view urban profile regulations with access" 
ON public.urban_profile_regulations 
FOR SELECT 
USING (
  public.has_urban_profile_access(auth.uid(), profile_id)
);