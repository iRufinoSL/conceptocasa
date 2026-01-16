-- Fix: Restrict whatsapp_messages access to users with proper authorization
-- Previously allowed any authenticated user to view/modify all messages

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can view whatsapp messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Authenticated users can insert whatsapp messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Authenticated users can update whatsapp messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Authenticated users can delete whatsapp messages" ON public.whatsapp_messages;

-- Create restrictive SELECT policy - admins, colaboradores, or users with budget access
CREATE POLICY "Staff or budget access can view whatsapp messages"
ON public.whatsapp_messages FOR SELECT
USING (
  auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'administrador'::public.app_role) OR
    public.has_role(auth.uid(), 'colaborador'::public.app_role) OR
    (budget_id IS NOT NULL AND public.has_presupuesto_access(auth.uid(), budget_id)) OR
    created_by = auth.uid()
  )
);

-- Create restrictive INSERT policy - admins, colaboradores, or users with budget access
CREATE POLICY "Staff or budget access can insert whatsapp messages"
ON public.whatsapp_messages FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'administrador'::public.app_role) OR
    public.has_role(auth.uid(), 'colaborador'::public.app_role) OR
    (budget_id IS NOT NULL AND public.has_presupuesto_access(auth.uid(), budget_id))
  )
);

-- Create restrictive UPDATE policy - admins, colaboradores, users with budget access, or creator
CREATE POLICY "Staff or budget access can update whatsapp messages"
ON public.whatsapp_messages FOR UPDATE
USING (
  auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'administrador'::public.app_role) OR
    public.has_role(auth.uid(), 'colaborador'::public.app_role) OR
    (budget_id IS NOT NULL AND public.has_presupuesto_access(auth.uid(), budget_id)) OR
    created_by = auth.uid()
  )
);

-- Create restrictive DELETE policy - admins, colaboradores, or creator
CREATE POLICY "Staff or creator can delete whatsapp messages"
ON public.whatsapp_messages FOR DELETE
USING (
  auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'administrador'::public.app_role) OR
    public.has_role(auth.uid(), 'colaborador'::public.app_role) OR
    created_by = auth.uid()
  )
);