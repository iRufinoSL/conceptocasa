-- Fix: Make budget-predesigns bucket private to prevent unauthorized access
UPDATE storage.buckets
SET public = false
WHERE id = 'budget-predesigns';

-- Drop the existing overly permissive SELECT policy
DROP POLICY IF EXISTS "Users can view budget predesign files" ON storage.objects;

-- Create a proper access-controlled SELECT policy
CREATE POLICY "Authenticated users can view budget predesign files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'budget-predesigns' AND
  (
    -- Admins can access all files
    has_role(auth.uid(), 'administrador'::app_role) OR
    -- Colaboradores can access all files
    has_role(auth.uid(), 'colaborador'::app_role) OR
    -- Users with budget access can view files from their budgets
    EXISTS (
      SELECT 1 FROM public.budget_predesigns bp
      WHERE storage.filename(name) = bp.file_name
      AND has_presupuesto_access(auth.uid(), bp.budget_id)
    )
  )
);