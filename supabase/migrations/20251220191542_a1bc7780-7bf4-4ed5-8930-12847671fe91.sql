-- Fix storage policy for budget-predesigns to match by file_path instead of file_name
-- The file is stored with a UUID path, not the original filename

DROP POLICY IF EXISTS "Authenticated users can view budget predesign files" ON storage.objects;

CREATE POLICY "Authenticated users can view budget predesign files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'budget-predesigns' 
  AND (
    -- Admins and collaborators can view all
    has_role(auth.uid(), 'administrador'::app_role) 
    OR has_role(auth.uid(), 'colaborador'::app_role)
    -- Clients can view files from budgets they have access to
    OR EXISTS (
      SELECT 1 FROM budget_predesigns bp
      WHERE bp.file_path = objects.name
      AND has_presupuesto_access(auth.uid(), bp.budget_id)
    )
  )
);