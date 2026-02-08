
-- =============================================
-- FIX 1: urban_regulations — restrict SELECT to authenticated users only
-- =============================================

-- Drop the two duplicate permissive public-read policies
DROP POLICY IF EXISTS "Anyone can view regulations" ON public.urban_regulations;
DROP POLICY IF EXISTS "Anyone can view urban regulations" ON public.urban_regulations;

-- Replace with authenticated-only read access
CREATE POLICY "Authenticated users can view regulations"
  ON public.urban_regulations
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- =============================================
-- FIX 2: urban_profiles — tighten INSERT/UPDATE/DELETE to budget-scoped access
-- =============================================

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can create urban profiles" ON public.urban_profiles;
DROP POLICY IF EXISTS "Authenticated users can update urban profiles" ON public.urban_profiles;
DROP POLICY IF EXISTS "Authenticated users can delete urban profiles" ON public.urban_profiles;

-- INSERT: only admins/colaboradores, or users with access to the target budget
CREATE POLICY "Budget-scoped insert urban profiles"
  ON public.urban_profiles
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      has_role(auth.uid(), 'administrador'::app_role)
      OR has_role(auth.uid(), 'colaborador'::app_role)
      OR has_presupuesto_access(auth.uid(), budget_id)
    )
  );

-- UPDATE: same budget-scoped check
CREATE POLICY "Budget-scoped update urban profiles"
  ON public.urban_profiles
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND (
      has_role(auth.uid(), 'administrador'::app_role)
      OR has_role(auth.uid(), 'colaborador'::app_role)
      OR has_presupuesto_access(auth.uid(), budget_id)
    )
  );

-- DELETE: only admins or users with budget access
CREATE POLICY "Budget-scoped delete urban profiles"
  ON public.urban_profiles
  FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND (
      has_role(auth.uid(), 'administrador'::app_role)
      OR has_presupuesto_access(auth.uid(), budget_id)
    )
  );
