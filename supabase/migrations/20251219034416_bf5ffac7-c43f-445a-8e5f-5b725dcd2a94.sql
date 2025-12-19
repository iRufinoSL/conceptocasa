-- Change budget-predesigns bucket from public to private
-- This provides defense-in-depth since the app already uses signed URLs
UPDATE storage.buckets 
SET public = false 
WHERE id = 'budget-predesigns';