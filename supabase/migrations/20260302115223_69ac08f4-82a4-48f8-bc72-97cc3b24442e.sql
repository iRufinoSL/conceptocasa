
-- Table to track backup history (both automatic and manual)
CREATE TABLE public.backup_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  backup_type TEXT NOT NULL CHECK (backup_type IN ('automatic', 'manual')),
  module TEXT NOT NULL DEFAULT 'all',
  file_path TEXT,
  file_size_bytes BIGINT,
  total_records INTEGER DEFAULT 0,
  total_tables INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('running', 'completed', 'failed')),
  error_message TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.backup_history ENABLE ROW LEVEL SECURITY;

-- Only admins and colaboradores can view backup history
CREATE POLICY "Admins can manage backup history"
  ON public.backup_history
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrador'::public.app_role));

CREATE POLICY "Colaboradores can view backup history"
  ON public.backup_history
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'colaborador'::public.app_role));

-- Authenticated users can insert their own backup records
CREATE POLICY "Users can record own backups"
  ON public.backup_history
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Storage bucket for automatic backups
INSERT INTO storage.buckets (id, name, public) VALUES ('backups', 'backups', false);

-- Only admins can access backup files
CREATE POLICY "Admins can manage backup files"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'backups' AND public.has_role(auth.uid(), 'administrador'::public.app_role))
  WITH CHECK (bucket_id = 'backups' AND public.has_role(auth.uid(), 'administrador'::public.app_role));

-- Service role needs access for auto-backups
CREATE POLICY "Service role backup access"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'backups')
  WITH CHECK (bucket_id = 'backups');
