-- Fix the overly permissive has_presupuesto_access function
-- This function was returning true for ANY authenticated user if the budget exists
-- Now it correctly checks:
-- 1. User has explicit access via user_presupuestos table
-- 2. OR user is an administrator

CREATE OR REPLACE FUNCTION public.has_presupuesto_access(_user_id uuid, _presupuesto_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_presupuestos
    WHERE user_id = _user_id
      AND presupuesto_id = _presupuesto_id
  )
  OR public.has_role(_user_id, 'administrador'::public.app_role)
$function$;