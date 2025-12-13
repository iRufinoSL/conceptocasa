-- Fix PUBLIC_USER_DATA: Block anonymous access to profiles
CREATE POLICY "Block anonymous access to profiles"
ON public.profiles
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Fix EXPOSED_SENSITIVE_DATA: Block anonymous access to crm_contacts
CREATE POLICY "Block anonymous access to crm_contacts"
ON public.crm_contacts
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Fix EXPOSED_SENSITIVE_DATA: Block anonymous access to company_settings
CREATE POLICY "Block anonymous access to company_settings"
ON public.company_settings
FOR SELECT
USING (auth.uid() IS NOT NULL);