-- Fix critical data isolation leak: ensure colaboradores only access assigned projects

-- 1) Create explicit assignment table
CREATE TABLE IF NOT EXISTS public.project_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, project_id)
);

ALTER TABLE public.project_assignments ENABLE ROW LEVEL SECURITY;

-- Policies: admins manage all; users can view their own assignments
DROP POLICY IF EXISTS "Admins can manage project assignments" ON public.project_assignments;
CREATE POLICY "Admins can manage project assignments"
ON public.project_assignments
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'administrador'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'administrador'::public.app_role));

DROP POLICY IF EXISTS "Users can view own project assignments" ON public.project_assignments;
CREATE POLICY "Users can view own project assignments"
ON public.project_assignments
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 2) Fix has_project_access(): remove blanket colaborador access; check explicit assignment
CREATE OR REPLACE FUNCTION public.has_project_access(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.has_role(_user_id, 'administrador'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = _project_id
        AND p.created_by = _user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.project_assignments pa
      WHERE pa.project_id = _project_id
        AND pa.user_id = _user_id
    )
$$;

-- 3) Tighten RLS policies that were relying on colaborador blanket access

-- projects: remove blanket colaborador access; require has_project_access
DROP POLICY IF EXISTS "Role-based project access" ON public.projects;
CREATE POLICY "Project access (admin/owner/assigned)"
ON public.projects
FOR SELECT
TO authenticated
USING (public.has_project_access(auth.uid(), id));

-- project_profiles: select only if user has project access
DROP POLICY IF EXISTS "Colaboradores can view assigned project profiles" ON public.project_profiles;
CREATE POLICY "Users can view project profiles with access"
ON public.project_profiles
FOR SELECT
TO authenticated
USING (public.has_project_access(auth.uid(), project_id));

-- email_project_assignments: remove overly-broad policies
DROP POLICY IF EXISTS "Authenticated staff can view email project assignments" ON public.email_project_assignments;
DROP POLICY IF EXISTS "Users can view email project assignments with access" ON public.email_project_assignments;
DROP POLICY IF EXISTS "Admins and colaboradores can manage email project assignments" ON public.email_project_assignments;

CREATE POLICY "Users can view email project assignments with access"
ON public.email_project_assignments
FOR SELECT
TO authenticated
USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can manage email project assignments with access"
ON public.email_project_assignments
FOR ALL
TO authenticated
USING (public.has_project_access(auth.uid(), project_id))
WITH CHECK (public.has_project_access(auth.uid(), project_id));

-- whatsapp_project_assignments: remove overly-broad public policies
DROP POLICY IF EXISTS "whatsapp_project_access_view" ON public.whatsapp_project_assignments;
DROP POLICY IF EXISTS "whatsapp_project_access_insert" ON public.whatsapp_project_assignments;
DROP POLICY IF EXISTS "whatsapp_project_access_delete" ON public.whatsapp_project_assignments;
DROP POLICY IF EXISTS "Users can view whatsapp project assignments with access" ON public.whatsapp_project_assignments;

CREATE POLICY "Users can view whatsapp project assignments with access"
ON public.whatsapp_project_assignments
FOR SELECT
TO authenticated
USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can manage whatsapp project assignments with access"
ON public.whatsapp_project_assignments
FOR ALL
TO authenticated
USING (public.has_project_access(auth.uid(), project_id))
WITH CHECK (public.has_project_access(auth.uid(), project_id));
