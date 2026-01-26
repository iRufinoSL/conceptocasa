-- Añadir tarifa horaria por defecto a perfiles de trabajadores
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10,2) DEFAULT 0;

-- Añadir horas trabajadas y tarifa a la tabla de trabajadores por parte
ALTER TABLE public.work_report_workers 
ADD COLUMN IF NOT EXISTS hours_worked NUMERIC(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS hourly_rate_override NUMERIC(10,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL;

-- Crear tabla para resumen mensual de horas (caché para reportes)
CREATE TABLE public.worker_monthly_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  budget_id UUID NOT NULL REFERENCES presupuestos(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL, -- formato: '2026-01'
  total_hours NUMERIC(8,2) DEFAULT 0,
  total_cost NUMERIC(12,2) DEFAULT 0,
  work_days INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, budget_id, year_month)
);

-- RLS para worker_monthly_summary
ALTER TABLE worker_monthly_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View monthly summary for accessible budgets"
  ON worker_monthly_summary FOR SELECT
  USING (
    budget_id IN (
      SELECT presupuesto_id FROM user_presupuestos WHERE user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrador'
    )
  );

CREATE POLICY "Insert monthly summary for accessible budgets"
  ON worker_monthly_summary FOR INSERT
  WITH CHECK (
    budget_id IN (
      SELECT presupuesto_id FROM user_presupuestos WHERE user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrador'
    )
  );

CREATE POLICY "Update monthly summary"
  ON worker_monthly_summary FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrador')
  );

CREATE POLICY "Delete monthly summary"
  ON worker_monthly_summary FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrador')
  );

-- Trigger para actualizar updated_at
CREATE TRIGGER update_worker_monthly_summary_updated_at
  BEFORE UPDATE ON public.worker_monthly_summary
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();