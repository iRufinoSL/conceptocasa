-- Drop the conflicting policy that was already created
DROP POLICY IF EXISTS "Authenticated users can create urban profiles" ON public.urban_profiles;

-- Recreate with proper name (same policy but explicit drop first)
CREATE POLICY "Authenticated users can create urban profiles"
ON public.urban_profiles FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================
-- 2. FIX urban_regulations table (continues from previous)
-- ============================================

-- Drop existing overly permissive policy
DROP POLICY IF EXISTS "Anyone can view regulations" ON public.urban_regulations;
DROP POLICY IF EXISTS "Authenticated users can manage regulations" ON public.urban_regulations;

-- Keep public read (regulations are public documents)
CREATE POLICY "Anyone can view regulations"
ON public.urban_regulations FOR SELECT
USING (true);

-- Restrict modifications to admins and colaboradores
CREATE POLICY "Admins and colaboradores can insert regulations"
ON public.urban_regulations FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR
  public.has_role(auth.uid(), 'colaborador'::public.app_role)
);

CREATE POLICY "Admins and colaboradores can update regulations"
ON public.urban_regulations FOR UPDATE
USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR
  public.has_role(auth.uid(), 'colaborador'::public.app_role)
);

CREATE POLICY "Admins and colaboradores can delete regulations"
ON public.urban_regulations FOR DELETE
USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR
  public.has_role(auth.uid(), 'colaborador'::public.app_role)
);

-- ============================================
-- 3. FIX urban_profile_regulations table
-- ============================================

-- Drop existing overly permissive policy
DROP POLICY IF EXISTS "Anyone can view profile regulations" ON public.urban_profile_regulations;
DROP POLICY IF EXISTS "Authenticated users can manage profile regulations" ON public.urban_profile_regulations;

-- Create budget-access-based SELECT policy
CREATE POLICY "Users can view profile regulations for accessible budgets"
ON public.urban_profile_regulations FOR SELECT
USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR
  public.has_role(auth.uid(), 'colaborador'::public.app_role) OR
  EXISTS (
    SELECT 1 FROM public.urban_profiles up
    WHERE up.id = urban_profile_regulations.profile_id
    AND public.has_presupuesto_access(auth.uid(), up.budget_id)
  )
);

-- Restrict modifications to admins and colaboradores
CREATE POLICY "Admins and colaboradores can insert profile regulations"
ON public.urban_profile_regulations FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR
  public.has_role(auth.uid(), 'colaborador'::public.app_role)
);

CREATE POLICY "Admins and colaboradores can update profile regulations"
ON public.urban_profile_regulations FOR UPDATE
USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR
  public.has_role(auth.uid(), 'colaborador'::public.app_role)
);

CREATE POLICY "Admins and colaboradores can delete profile regulations"
ON public.urban_profile_regulations FOR DELETE
USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR
  public.has_role(auth.uid(), 'colaborador'::public.app_role)
);