-- Remove overly permissive "Block anonymous access" policies that allow ANY authenticated user to access sensitive data
-- These policies use only auth.uid() IS NOT NULL which bypasses the more restrictive role-based policies

DROP POLICY IF EXISTS "Block anonymous access to profiles" ON public.profiles;
DROP POLICY IF EXISTS "Block anonymous access to company_settings" ON public.company_settings;
DROP POLICY IF EXISTS "Block anonymous access to crm_contacts" ON public.crm_contacts;