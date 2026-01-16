-- Fix: Restrict urban_profiles access to authenticated users with proper authorization
-- Previously allowed any user (including unauthenticated) to view all cadastral data

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can view urban profiles" ON public.urban_profiles;

-- Create new restrictive policy requiring authentication and budget access
CREATE POLICY "Users can view urban profiles for accessible budgets"
ON public.urban_profiles FOR SELECT
USING (
  auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'administrador'::public.app_role) OR
    public.has_role(auth.uid(), 'colaborador'::public.app_role) OR
    public.has_presupuesto_access(auth.uid(), budget_id)
  )
);