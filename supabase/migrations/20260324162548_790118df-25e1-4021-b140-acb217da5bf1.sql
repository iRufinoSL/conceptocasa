
DROP POLICY IF EXISTS "Authenticated users can insert templates" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "Authenticated users can update templates" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "Authenticated users can delete templates" ON public.whatsapp_templates;

CREATE POLICY "Admins can insert whatsapp templates"
ON public.whatsapp_templates FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'administrador'::public.app_role));

CREATE POLICY "Admins can update whatsapp templates"
ON public.whatsapp_templates FOR UPDATE
USING (public.has_role(auth.uid(), 'administrador'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'administrador'::public.app_role));

CREATE POLICY "Admins can delete whatsapp templates"
ON public.whatsapp_templates FOR DELETE
USING (public.has_role(auth.uid(), 'administrador'::public.app_role));
