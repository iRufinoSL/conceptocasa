-- Make company-logos and budget-covers buckets private
UPDATE storage.buckets 
SET public = false 
WHERE id IN ('company-logos', 'budget-covers');

-- Update RLS policy for company logos - authenticated users can view
DROP POLICY IF EXISTS "Public can view company logos" ON storage.objects;
CREATE POLICY "Authenticated users can view company logos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'company-logos' AND auth.role() = 'authenticated');

-- Update RLS policy for budget covers - authenticated users can view  
DROP POLICY IF EXISTS "Public can view budget covers" ON storage.objects;
CREATE POLICY "Authenticated users can view budget covers"
ON storage.objects
FOR SELECT
USING (bucket_id = 'budget-covers' AND auth.role() = 'authenticated');