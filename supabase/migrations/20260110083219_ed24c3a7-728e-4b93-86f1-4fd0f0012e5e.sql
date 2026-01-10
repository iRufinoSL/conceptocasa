-- Allow logged-in users to read/download email attachments
-- Needed for generating signed URLs and downloading from the private 'email-attachments' bucket

CREATE POLICY "Authenticated users can read email attachments"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'email-attachments'
  AND auth.uid() IS NOT NULL
);
