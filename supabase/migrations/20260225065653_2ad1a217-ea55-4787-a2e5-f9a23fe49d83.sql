
-- Fix 1: Drop the leftover USING(true) SELECT policy on urban_profile_regulations
-- This policy bypasses the two properly scoped SELECT policies already in place
DROP POLICY IF EXISTS "Users can view profile regulations" ON public.urban_profile_regulations;

-- Fix 2: Drop redundant SELECT policy (keep only the has_urban_profile_access one which is the cleanest)
DROP POLICY IF EXISTS "Users can view profile regulations for accessible budgets" ON public.urban_profile_regulations;

-- Fix 3: Clean up useless "Deny anonymous access" PERMISSIVE false policies
-- These are PERMISSIVE with qual=false, which means they never grant access but also never deny it
-- (PERMISSIVE policies are OR-ed, so a false one is simply ignored). Removing for clarity.
DROP POLICY IF EXISTS "Deny anonymous access" ON public.accounting_accounts;
DROP POLICY IF EXISTS "Deny anonymous access" ON public.accounting_entries;
DROP POLICY IF EXISTS "Deny anonymous access" ON public.accounting_entry_lines;
DROP POLICY IF EXISTS "Deny anonymous access" ON public.invoices;
