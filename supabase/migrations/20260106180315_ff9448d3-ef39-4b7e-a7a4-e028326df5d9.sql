-- Add email_signature column to company_settings table
ALTER TABLE public.company_settings 
ADD COLUMN IF NOT EXISTS email_signature TEXT;