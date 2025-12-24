-- Fix budget-predesigns storage policies to require authentication and proper access control

-- Drop existing overly permissive policies for budget-predesigns
DROP POLICY IF EXISTS "Users can view budget predesign files" ON storage.objects;
DROP POLICY IF EXISTS "Budget-aware predesign file access" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload budget predesign files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update budget predesign files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete budget predesign files" ON storage.objects;

-- Create proper authenticated policies for budget-predesigns bucket

-- SELECT policy: Only authenticated users with budget access can view files
CREATE POLICY "Authenticated users can view budget predesigns"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'budget-predesigns' AND (
    public.has_role(auth.uid(), 'administrador'::public.app_role) OR
    public.has_role(auth.uid(), 'colaborador'::public.app_role) OR
    EXISTS (
      SELECT 1 FROM public.budget_predesigns bp
      WHERE bp.file_path = name
      AND public.has_presupuesto_access(auth.uid(), bp.budget_id)
    )
  )
);

-- INSERT policy: Only authenticated users can upload to budget-predesigns
CREATE POLICY "Authenticated users can upload budget predesigns"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'budget-predesigns' AND (
    public.has_role(auth.uid(), 'administrador'::public.app_role) OR
    public.has_role(auth.uid(), 'colaborador'::public.app_role)
  )
);

-- UPDATE policy: Only authenticated users can update budget predesigns
CREATE POLICY "Authenticated users can update budget predesigns"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'budget-predesigns' AND (
    public.has_role(auth.uid(), 'administrador'::public.app_role) OR
    public.has_role(auth.uid(), 'colaborador'::public.app_role)
  )
);

-- DELETE policy: Only authenticated users can delete budget predesigns
CREATE POLICY "Authenticated users can delete budget predesigns"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'budget-predesigns' AND (
    public.has_role(auth.uid(), 'administrador'::public.app_role) OR
    public.has_role(auth.uid(), 'colaborador'::public.app_role)
  )
);