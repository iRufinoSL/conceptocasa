-- Fix generate_entry_code to add role-based access control
CREATE OR REPLACE FUNCTION public.generate_entry_code(entry_year integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  year_suffix text;
  max_code integer;
  new_code text;
BEGIN
  -- Check if caller is admin or colaborador
  IF NOT (public.has_role(auth.uid(), 'administrador'::public.app_role) OR 
          public.has_role(auth.uid(), 'colaborador'::public.app_role)) THEN
    RAISE EXCEPTION 'No autorizado: función solo para administradores y colaboradores';
  END IF;
  
  -- Get last 2 digits of year
  year_suffix := LPAD((entry_year % 100)::text, 2, '0');
  
  -- Find the maximum code number for this year
  SELECT COALESCE(MAX(NULLIF(SPLIT_PART(code, '/', 1), '')::integer), 0)
  INTO max_code
  FROM public.accounting_entries
  WHERE code LIKE '%/' || year_suffix;
  
  -- Generate new code
  new_code := LPAD((max_code + 1)::text, 4, '0') || '/' || year_suffix;
  
  RETURN new_code;
END;
$$;