
-- Fix the has_presupuesto_access function to be more permissive
-- It should return true if:
-- 1. The user has an explicit entry in user_presupuestos, OR
-- 2. The presupuesto exists (since currently all users have access to all budgets via RLS)

CREATE OR REPLACE FUNCTION public.has_presupuesto_access(_user_id uuid, _presupuesto_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    -- Check explicit access via user_presupuestos
    SELECT 1
    FROM public.user_presupuestos
    WHERE user_id = _user_id
      AND presupuesto_id = _presupuesto_id
  )
  OR EXISTS (
    -- Or check if the presupuesto exists (all authenticated users currently have access)
    SELECT 1
    FROM public.presupuestos
    WHERE id = _presupuesto_id
  )
$function$;
