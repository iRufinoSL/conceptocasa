-- Remove overly permissive policies that bypass role-based access
-- These policies allow ANY authenticated user to view data, bypassing role restrictions

DROP POLICY IF EXISTS "Block anonymous access to profiles" ON public.profiles;
DROP POLICY IF EXISTS "Block anonymous access to crm_contacts" ON public.crm_contacts;
DROP POLICY IF EXISTS "Authenticated users can view contacts" ON public.crm_contacts;
DROP POLICY IF EXISTS "Block anonymous access to company_settings" ON public.company_settings;
DROP POLICY IF EXISTS "Authenticated users can view opportunities" ON public.crm_opportunities;

-- The existing role-based policies from migration 20251213103426 are correct and sufficient:
-- - "Role-based contact access" on crm_contacts
-- - "Administrators can view company settings" on company_settings
-- - "Role-based opportunity access" on crm_opportunities