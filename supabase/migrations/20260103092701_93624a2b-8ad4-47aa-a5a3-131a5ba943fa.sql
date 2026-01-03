-- Fix overly permissive RLS policies on crm_communications table
-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can view communications" ON public.crm_communications;
DROP POLICY IF EXISTS "Authenticated users can create communications" ON public.crm_communications;
DROP POLICY IF EXISTS "Authenticated users can update communications" ON public.crm_communications;

-- Create role-based policies using the existing has_role function
-- Admins can manage all communications
CREATE POLICY "Admins can manage all communications" 
ON public.crm_communications 
FOR ALL 
USING (has_role(auth.uid(), 'administrador'::app_role));

-- Colaboradores can view their own communications
CREATE POLICY "Colaboradores can view own communications" 
ON public.crm_communications 
FOR SELECT 
USING (
  has_role(auth.uid(), 'colaborador'::app_role) AND 
  created_by = auth.uid()
);

-- Colaboradores can create communications (setting themselves as creator)
CREATE POLICY "Colaboradores can create communications" 
ON public.crm_communications 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'colaborador'::app_role) AND 
  created_by = auth.uid()
);

-- Colaboradores can update their own communications
CREATE POLICY "Colaboradores can update own communications" 
ON public.crm_communications 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'colaborador'::app_role) AND 
  created_by = auth.uid()
);