-- Tabla principal de partes de trabajo
CREATE TABLE public.work_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES presupuestos(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trabajadores asignados al parte
CREATE TABLE public.work_report_workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_report_id UUID NOT NULL REFERENCES work_reports(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(work_report_id, profile_id)
);

-- Entradas/trabajos individuales
CREATE TABLE public.work_report_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_report_id UUID NOT NULL REFERENCES work_reports(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  activity_id UUID REFERENCES budget_activities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Imagenes por entrada
CREATE TABLE public.work_report_entry_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES work_report_entries(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para updated_at en work_reports
CREATE TRIGGER update_work_reports_updated_at
  BEFORE UPDATE ON public.work_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE work_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_report_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_report_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_report_entry_images ENABLE ROW LEVEL SECURITY;

-- Políticas para work_reports (usando user_presupuestos)
CREATE POLICY "Users can view work reports for accessible budgets"
  ON work_reports FOR SELECT
  USING (
    budget_id IN (
      SELECT presupuesto_id FROM user_presupuestos WHERE user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrador'
    )
  );

CREATE POLICY "Users can insert work reports for accessible budgets"
  ON work_reports FOR INSERT
  WITH CHECK (
    budget_id IN (
      SELECT presupuesto_id FROM user_presupuestos WHERE user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrador'
    )
  );

CREATE POLICY "Users can update their own work reports"
  ON work_reports FOR UPDATE
  USING (
    created_by = auth.uid() OR EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrador'
    )
  );

CREATE POLICY "Users can delete their own work reports"
  ON work_reports FOR DELETE
  USING (
    created_by = auth.uid() OR EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrador'
    )
  );

-- Políticas para work_report_workers
CREATE POLICY "View workers through work reports"
  ON work_report_workers FOR SELECT
  USING (work_report_id IN (SELECT id FROM work_reports));

CREATE POLICY "Insert workers for own work reports"
  ON work_report_workers FOR INSERT
  WITH CHECK (
    work_report_id IN (SELECT id FROM work_reports WHERE created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrador')
  );

CREATE POLICY "Delete workers for own work reports"
  ON work_report_workers FOR DELETE
  USING (
    work_report_id IN (SELECT id FROM work_reports WHERE created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrador')
  );

-- Políticas para work_report_entries
CREATE POLICY "View entries through work reports"
  ON work_report_entries FOR SELECT
  USING (work_report_id IN (SELECT id FROM work_reports));

CREATE POLICY "Insert entries for own work reports"
  ON work_report_entries FOR INSERT
  WITH CHECK (
    work_report_id IN (SELECT id FROM work_reports WHERE created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrador')
  );

CREATE POLICY "Update entries for own work reports"
  ON work_report_entries FOR UPDATE
  USING (
    work_report_id IN (SELECT id FROM work_reports WHERE created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrador')
  );

CREATE POLICY "Delete entries for own work reports"
  ON work_report_entries FOR DELETE
  USING (
    work_report_id IN (SELECT id FROM work_reports WHERE created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrador')
  );

-- Políticas para work_report_entry_images
CREATE POLICY "View images through entries"
  ON work_report_entry_images FOR SELECT
  USING (entry_id IN (SELECT id FROM work_report_entries));

CREATE POLICY "Insert images for accessible entries"
  ON work_report_entry_images FOR INSERT
  WITH CHECK (
    entry_id IN (
      SELECT e.id FROM work_report_entries e
      JOIN work_reports r ON e.work_report_id = r.id
      WHERE r.created_by = auth.uid()
    ) OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrador')
  );

CREATE POLICY "Delete images for accessible entries"
  ON work_report_entry_images FOR DELETE
  USING (
    entry_id IN (
      SELECT e.id FROM work_report_entries e
      JOIN work_reports r ON e.work_report_id = r.id
      WHERE r.created_by = auth.uid()
    ) OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrador')
  );