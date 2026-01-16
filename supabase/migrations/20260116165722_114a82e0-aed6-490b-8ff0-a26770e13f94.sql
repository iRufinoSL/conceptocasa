-- Fix overly permissive RLS policies on WhatsApp assignment tables
-- Issue: Any authenticated user could link WhatsApp messages to budgets/projects they don't have access to

-- ============================================
-- Fix whatsapp_budget_assignments policies
-- ============================================

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Allow authenticated users to insert whatsapp budget assignments" ON public.whatsapp_budget_assignments;
DROP POLICY IF EXISTS "Allow authenticated users to view whatsapp budget assignments" ON public.whatsapp_budget_assignments;
DROP POLICY IF EXISTS "Allow authenticated users to delete whatsapp budget assignments" ON public.whatsapp_budget_assignments;

-- Create restricted INSERT policy - only allow for accessible budgets
CREATE POLICY "Users can insert whatsapp budget assignments for accessible budgets"
ON public.whatsapp_budget_assignments FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR 
  public.has_presupuesto_access(auth.uid(), budget_id)
);

-- Create restricted SELECT policy - only view assignments for accessible budgets
CREATE POLICY "Users can view whatsapp budget assignments for accessible budgets"
ON public.whatsapp_budget_assignments FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR 
  public.has_presupuesto_access(auth.uid(), budget_id)
);

-- Create restricted DELETE policy - only delete assignments for accessible budgets
CREATE POLICY "Users can delete whatsapp budget assignments for accessible budgets"
ON public.whatsapp_budget_assignments FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR 
  public.has_presupuesto_access(auth.uid(), budget_id)
);

-- ============================================
-- Fix whatsapp_project_assignments policies
-- ============================================

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Allow authenticated users to insert whatsapp project assignments" ON public.whatsapp_project_assignments;
DROP POLICY IF EXISTS "Allow authenticated users to view whatsapp project assignments" ON public.whatsapp_project_assignments;
DROP POLICY IF EXISTS "Allow authenticated users to delete whatsapp project assignments" ON public.whatsapp_project_assignments;

-- Create restricted INSERT policy - only allow for accessible projects
CREATE POLICY "Users can insert whatsapp project assignments for accessible projects"
ON public.whatsapp_project_assignments FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR 
  public.has_role(auth.uid(), 'colaborador'::public.app_role) OR
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = project_id AND created_by = auth.uid()
  )
);

-- Create restricted SELECT policy - only view assignments for accessible projects
CREATE POLICY "Users can view whatsapp project assignments for accessible projects"
ON public.whatsapp_project_assignments FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR 
  public.has_role(auth.uid(), 'colaborador'::public.app_role) OR
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = project_id AND created_by = auth.uid()
  )
);

-- Create restricted DELETE policy - only delete assignments for accessible projects
CREATE POLICY "Users can delete whatsapp project assignments for accessible projects"
ON public.whatsapp_project_assignments FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR 
  public.has_role(auth.uid(), 'colaborador'::public.app_role) OR
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = project_id AND created_by = auth.uid()
  )
);