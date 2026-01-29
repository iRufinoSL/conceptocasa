
-- =====================================================
-- SISTEMA DE PERMISOS GRANULARES - ROLES Y ACCESOS
-- =====================================================

-- 1. Tabla de accesos a aplicaciones/módulos por usuario
-- Define qué módulos/páginas puede ver cada usuario
CREATE TABLE IF NOT EXISTS public.user_app_access (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    app_name text NOT NULL, -- 'dashboard', 'presupuestos', 'crm', 'agenda', 'documentos', 'recursos', 'usuarios', 'configuracion', 'administracion'
    can_access boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, app_name)
);

-- 2. Tabla de accesos a tabs/secciones dentro de cada aplicación
-- Define qué pestañas puede ver dentro de cada módulo
CREATE TABLE IF NOT EXISTS public.user_tab_access (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    app_name text NOT NULL,
    tab_name text NOT NULL, -- ej: 'actividades', 'recursos', 'documentos', 'comunicaciones', etc.
    can_view boolean NOT NULL DEFAULT false,
    can_edit boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, app_name, tab_name)
);

-- 3. Tabla de accesos a campos específicos
-- Define qué campos puede ver/editar en cada sección
CREATE TABLE IF NOT EXISTS public.user_field_access (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    table_name text NOT NULL, -- 'presupuestos', 'budget_activities', 'budget_activity_resources', etc.
    field_name text NOT NULL, -- nombre del campo
    can_view boolean NOT NULL DEFAULT false,
    can_edit boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, table_name, field_name)
);

-- 4. Tabla para usuarios modelo/demo
-- Permite marcar usuarios como "modelo" para testing
CREATE TABLE IF NOT EXISTS public.model_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    description text, -- ej: "Usuario modelo Cliente para testing"
    role_type text NOT NULL, -- 'administrador', 'colaborador', 'cliente'
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_user_app_access_user_id ON public.user_app_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tab_access_user_id ON public.user_tab_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_field_access_user_id ON public.user_field_access(user_id);
CREATE INDEX IF NOT EXISTS idx_model_users_role_type ON public.model_users(role_type);

-- 6. Habilitar RLS en todas las tablas
ALTER TABLE public.user_app_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_tab_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_field_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_users ENABLE ROW LEVEL SECURITY;

-- 7. Función SECURITY DEFINER para verificar si es admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'administrador'
  )
$$;

-- 8. Función para verificar acceso a una aplicación
CREATE OR REPLACE FUNCTION public.has_app_access(_user_id uuid, _app_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Admins tienen acceso a todo
  SELECT CASE 
    WHEN public.is_admin(_user_id) THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.user_app_access
      WHERE user_id = _user_id
        AND app_name = _app_name
        AND can_access = true
    )
  END
$$;

-- 9. Función para verificar acceso a un tab
CREATE OR REPLACE FUNCTION public.has_tab_access(_user_id uuid, _app_name text, _tab_name text, _access_type text DEFAULT 'view')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    WHEN public.is_admin(_user_id) THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.user_tab_access
      WHERE user_id = _user_id
        AND app_name = _app_name
        AND tab_name = _tab_name
        AND (
          (_access_type = 'view' AND can_view = true) OR
          (_access_type = 'edit' AND can_edit = true)
        )
    )
  END
$$;

-- 10. Función para verificar acceso a un campo
CREATE OR REPLACE FUNCTION public.has_field_access(_user_id uuid, _table_name text, _field_name text, _access_type text DEFAULT 'view')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    WHEN public.is_admin(_user_id) THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.user_field_access
      WHERE user_id = _user_id
        AND table_name = _table_name
        AND field_name = _field_name
        AND (
          (_access_type = 'view' AND can_view = true) OR
          (_access_type = 'edit' AND can_edit = true)
        )
    )
  END
$$;

-- 11. Políticas RLS para user_app_access
CREATE POLICY "Admins can manage app access"
ON public.user_app_access
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users can view own app access"
ON public.user_app_access
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 12. Políticas RLS para user_tab_access
CREATE POLICY "Admins can manage tab access"
ON public.user_tab_access
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users can view own tab access"
ON public.user_tab_access
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 13. Políticas RLS para user_field_access
CREATE POLICY "Admins can manage field access"
ON public.user_field_access
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users can view own field access"
ON public.user_field_access
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 14. Políticas RLS para model_users
CREATE POLICY "Admins can manage model users"
ON public.model_users
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "All authenticated can view model users"
ON public.model_users
FOR SELECT
TO authenticated
USING (true);

-- 15. Triggers para updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_user_app_access_updated_at ON public.user_app_access;
CREATE TRIGGER update_user_app_access_updated_at
    BEFORE UPDATE ON public.user_app_access
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_tab_access_updated_at ON public.user_tab_access;
CREATE TRIGGER update_user_tab_access_updated_at
    BEFORE UPDATE ON public.user_tab_access
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_field_access_updated_at ON public.user_field_access;
CREATE TRIGGER update_user_field_access_updated_at
    BEFORE UPDATE ON public.user_field_access
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_model_users_updated_at ON public.model_users;
CREATE TRIGGER update_model_users_updated_at
    BEFORE UPDATE ON public.model_users
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
