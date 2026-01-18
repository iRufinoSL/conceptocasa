-- Drop all existing policies on whatsapp_budget_assignments
DROP POLICY IF EXISTS "Users can view whatsapp budget assignments for accessible budgets" ON public.whatsapp_budget_assignments;
DROP POLICY IF EXISTS "Users can view whatsapp budget assignments for accessible budge" ON public.whatsapp_budget_assignments;
DROP POLICY IF EXISTS "Users can insert whatsapp budget assignments for accessible budgets" ON public.whatsapp_budget_assignments;
DROP POLICY IF EXISTS "Users can insert whatsapp budget assignments for accessible budge" ON public.whatsapp_budget_assignments;
DROP POLICY IF EXISTS "Users can delete whatsapp budget assignments for accessible budgets" ON public.whatsapp_budget_assignments;
DROP POLICY IF EXISTS "Users can delete whatsapp budget assignments for accessible budge" ON public.whatsapp_budget_assignments;
DROP POLICY IF EXISTS "Allow authenticated users to view whatsapp budget assignments" ON public.whatsapp_budget_assignments;
DROP POLICY IF EXISTS "Allow authenticated users to insert whatsapp budget assignments" ON public.whatsapp_budget_assignments;
DROP POLICY IF EXISTS "Allow authenticated users to delete whatsapp budget assignments" ON public.whatsapp_budget_assignments;

-- Recreate proper policies for whatsapp_budget_assignments
CREATE POLICY "whatsapp_budget_access_view"
ON public.whatsapp_budget_assignments FOR SELECT
USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR 
  public.has_role(auth.uid(), 'colaborador'::public.app_role) OR
  public.has_presupuesto_access(auth.uid(), budget_id)
);

CREATE POLICY "whatsapp_budget_access_insert"
ON public.whatsapp_budget_assignments FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR 
  public.has_role(auth.uid(), 'colaborador'::public.app_role) OR
  public.has_presupuesto_access(auth.uid(), budget_id)
);

CREATE POLICY "whatsapp_budget_access_delete"
ON public.whatsapp_budget_assignments FOR DELETE
USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR 
  public.has_role(auth.uid(), 'colaborador'::public.app_role) OR
  public.has_presupuesto_access(auth.uid(), budget_id)
);

-- Drop all existing policies on whatsapp_project_assignments  
DROP POLICY IF EXISTS "Admin and colaborador can view whatsapp project assignments" ON public.whatsapp_project_assignments;
DROP POLICY IF EXISTS "Admin and colaborador can insert whatsapp project assignments" ON public.whatsapp_project_assignments;
DROP POLICY IF EXISTS "Admin and colaborador can delete whatsapp project assignments" ON public.whatsapp_project_assignments;
DROP POLICY IF EXISTS "Allow authenticated users to view whatsapp project assignments" ON public.whatsapp_project_assignments;
DROP POLICY IF EXISTS "Allow authenticated users to insert whatsapp project assignments" ON public.whatsapp_project_assignments;
DROP POLICY IF EXISTS "Allow authenticated users to delete whatsapp project assignments" ON public.whatsapp_project_assignments;

-- Recreate proper policies for whatsapp_project_assignments (admin/colaborador only)
CREATE POLICY "whatsapp_project_access_view"
ON public.whatsapp_project_assignments FOR SELECT
USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR 
  public.has_role(auth.uid(), 'colaborador'::public.app_role)
);

CREATE POLICY "whatsapp_project_access_insert"
ON public.whatsapp_project_assignments FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR 
  public.has_role(auth.uid(), 'colaborador'::public.app_role)
);

CREATE POLICY "whatsapp_project_access_delete"
ON public.whatsapp_project_assignments FOR DELETE
USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR 
  public.has_role(auth.uid(), 'colaborador'::public.app_role)
);