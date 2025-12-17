-- Add portada_url column to presupuestos table for budget cover images
ALTER TABLE public.presupuestos 
ADD COLUMN IF NOT EXISTS portada_url text;

-- Create storage bucket for company logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policy for company logos bucket - public read
CREATE POLICY "Public can view company logos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'company-logos');

-- RLS policy for company logos bucket - admin only upload
CREATE POLICY "Admins can upload company logos"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'company-logos' AND has_role(auth.uid(), 'administrador'::app_role));

-- RLS policy for company logos bucket - admin only update
CREATE POLICY "Admins can update company logos"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'company-logos' AND has_role(auth.uid(), 'administrador'::app_role));

-- RLS policy for company logos bucket - admin only delete
CREATE POLICY "Admins can delete company logos"
ON storage.objects
FOR DELETE
USING (bucket_id = 'company-logos' AND has_role(auth.uid(), 'administrador'::app_role));

-- Create storage bucket for budget covers (portadas)
INSERT INTO storage.buckets (id, name, public)
VALUES ('budget-covers', 'budget-covers', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policy for budget covers bucket - public read  
CREATE POLICY "Public can view budget covers"
ON storage.objects
FOR SELECT
USING (bucket_id = 'budget-covers');

-- RLS policy for budget covers bucket - admin only upload
CREATE POLICY "Admins can upload budget covers"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'budget-covers' AND has_role(auth.uid(), 'administrador'::app_role));

-- RLS policy for budget covers bucket - admin only update
CREATE POLICY "Admins can update budget covers"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'budget-covers' AND has_role(auth.uid(), 'administrador'::app_role));

-- RLS policy for budget covers bucket - admin only delete  
CREATE POLICY "Admins can delete budget covers"
ON storage.objects
FOR DELETE
USING (bucket_id = 'budget-covers' AND has_role(auth.uid(), 'administrador'::app_role));