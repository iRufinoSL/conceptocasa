-- Create a function to check activity file access based on budget access
CREATE OR REPLACE FUNCTION public.can_access_activity_file(file_path text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Input validation: reject NULL, empty, or excessively long paths
  IF file_path IS NULL OR file_path = '' OR LENGTH(file_path) > 500 THEN
    RETURN FALSE;
  END IF;

  -- Admin always has access
  IF has_role(auth.uid(), 'administrador'::app_role) THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user uploaded the file
  IF EXISTS (
    SELECT 1 FROM public.budget_activity_files
    WHERE budget_activity_files.file_path = can_access_activity_file.file_path
    AND uploaded_by = auth.uid()
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user has access to the budget containing this file
  IF EXISTS (
    SELECT 1 
    FROM public.budget_activity_files baf
    JOIN public.budget_activities ba ON ba.id = baf.activity_id
    WHERE baf.file_path = can_access_activity_file.file_path
    AND has_presupuesto_access(auth.uid(), ba.budget_id)
  ) THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;

-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "Users can view activity files" ON storage.objects;

-- Create a new budget-aware storage policy for viewing activity files
CREATE POLICY "Budget-aware activity file access"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'activity-files' 
  AND public.can_access_activity_file(name)
);

-- Update upload policy to be more restrictive (admin or budget access)
DROP POLICY IF EXISTS "Users can upload activity files" ON storage.objects;

CREATE POLICY "Users can upload activity files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'activity-files' AND (
    has_role(auth.uid(), 'administrador'::app_role)
  )
);

-- Update delete policy to be more restrictive
DROP POLICY IF EXISTS "Users can delete activity files" ON storage.objects;

CREATE POLICY "Users can delete activity files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'activity-files' AND (
    has_role(auth.uid(), 'administrador'::app_role)
  )
);