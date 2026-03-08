
-- Fix 1: document_template_zones - restrict to template owner or admin/colaborador
DROP POLICY IF EXISTS "Users can view zones" ON public.document_template_zones;
DROP POLICY IF EXISTS "Users can insert zones" ON public.document_template_zones;
DROP POLICY IF EXISTS "Users can update zones" ON public.document_template_zones;
DROP POLICY IF EXISTS "Users can delete zones" ON public.document_template_zones;

CREATE POLICY "Zone SELECT by template owner or admin"
  ON public.document_template_zones FOR SELECT
  USING (
    public.has_role(auth.uid(), 'administrador'::public.app_role)
    OR public.has_role(auth.uid(), 'colaborador'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.document_templates dt
      WHERE dt.id = document_template_zones.template_id
        AND dt.created_by = auth.uid()
    )
  );

CREATE POLICY "Zone INSERT by template owner or admin"
  ON public.document_template_zones FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'administrador'::public.app_role)
    OR public.has_role(auth.uid(), 'colaborador'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.document_templates dt
      WHERE dt.id = document_template_zones.template_id
        AND dt.created_by = auth.uid()
    )
  );

CREATE POLICY "Zone UPDATE by template owner or admin"
  ON public.document_template_zones FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'administrador'::public.app_role)
    OR public.has_role(auth.uid(), 'colaborador'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.document_templates dt
      WHERE dt.id = document_template_zones.template_id
        AND dt.created_by = auth.uid()
    )
  );

CREATE POLICY "Zone DELETE by template owner or admin"
  ON public.document_template_zones FOR DELETE
  USING (
    public.has_role(auth.uid(), 'administrador'::public.app_role)
    OR public.has_role(auth.uid(), 'colaborador'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.document_templates dt
      WHERE dt.id = document_template_zones.template_id
        AND dt.created_by = auth.uid()
    )
  );

-- Fix 2: document_template_outputs - restrict to creator or admin/colaborador
DROP POLICY IF EXISTS "Users can view outputs" ON public.document_template_outputs;
DROP POLICY IF EXISTS "Authenticated users can create outputs" ON public.document_template_outputs;
DROP POLICY IF EXISTS "Users can delete own outputs" ON public.document_template_outputs;

CREATE POLICY "Output SELECT by creator or admin"
  ON public.document_template_outputs FOR SELECT
  USING (
    public.has_role(auth.uid(), 'administrador'::public.app_role)
    OR public.has_role(auth.uid(), 'colaborador'::public.app_role)
    OR created_by = auth.uid()
  );

CREATE POLICY "Output INSERT authenticated"
  ON public.document_template_outputs FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
  );

CREATE POLICY "Output DELETE by creator or admin"
  ON public.document_template_outputs FOR DELETE
  USING (
    public.has_role(auth.uid(), 'administrador'::public.app_role)
    OR created_by = auth.uid()
  );
