-- ============================================
-- Security Hardening: Restrict SECURITY DEFINER function execution
-- Revoke PUBLIC access and grant only to authenticated users
-- ============================================

-- has_role function
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

-- has_presupuesto_role function
REVOKE EXECUTE ON FUNCTION public.has_presupuesto_role(uuid, uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_presupuesto_role(uuid, uuid, app_role) TO authenticated;

-- has_presupuesto_access function
REVOKE EXECUTE ON FUNCTION public.has_presupuesto_access(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_presupuesto_access(uuid, uuid) TO authenticated;

-- can_access_storage_file function
REVOKE EXECUTE ON FUNCTION public.can_access_storage_file(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_storage_file(text) TO authenticated;

-- can_access_activity_file function
REVOKE EXECUTE ON FUNCTION public.can_access_activity_file(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_activity_file(text) TO authenticated;

-- Note: admin_exists() keeps anon/authenticated grants as required for /setup page