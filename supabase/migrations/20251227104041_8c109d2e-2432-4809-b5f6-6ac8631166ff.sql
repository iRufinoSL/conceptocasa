-- Make the resource-files bucket private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'resource-files';

-- Drop the overly permissive public policy
DROP POLICY IF EXISTS "Anyone can view resource files" ON storage.objects;

-- Create new policy requiring authentication for viewing
CREATE POLICY "Authenticated users can view resource files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'resource-files');