-- Update can_access_storage_file with input validation
-- This function is SECURITY DEFINER and is used in RLS policies for storage access

CREATE OR REPLACE FUNCTION public.can_access_storage_file(file_path text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Input validation: reject NULL, empty, or excessively long paths
  IF file_path IS NULL OR file_path = '' OR LENGTH(file_path) > 500 THEN
    RETURN FALSE;
  END IF;

  -- Admin always has access
  IF has_role(auth.uid(), 'administrador'::app_role) THEN
    RETURN TRUE;
  END IF;
  
  -- Colaborador has access
  IF has_role(auth.uid(), 'colaborador'::app_role) THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user uploaded the document
  IF EXISTS (
    SELECT 1 FROM public.project_documents
    WHERE project_documents.file_path = can_access_storage_file.file_path
    AND uploaded_by = auth.uid()
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user created the project containing this document
  IF EXISTS (
    SELECT 1 FROM public.project_documents pd
    JOIN public.projects p ON p.id = pd.project_id
    WHERE pd.file_path = can_access_storage_file.file_path
    AND p.created_by = auth.uid()
  ) THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$function$;

-- Update handle_new_user with input validation for full_name
-- This function is SECURITY DEFINER and creates profiles when new users sign up

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  validated_full_name text;
BEGIN
  -- Validate and sanitize full_name from metadata
  -- Limit to 255 characters and handle NULL/empty cases
  validated_full_name := NULLIF(TRIM(COALESCE(
    LEFT(NEW.raw_user_meta_data ->> 'full_name', 255),
    ''
  )), '');
  
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, validated_full_name);
  RETURN NEW;
END;
$function$;

-- Add comments documenting security-critical nature of these functions
COMMENT ON FUNCTION public.can_access_storage_file(text) IS 
  'SECURITY CRITICAL: This SECURITY DEFINER function controls storage access via RLS policies. 
   Any bugs here bypass table-level security. Changes require security review.';

COMMENT ON FUNCTION public.handle_new_user() IS 
  'SECURITY CRITICAL: This SECURITY DEFINER trigger function creates user profiles. 
   Input from auth.users.raw_user_meta_data is validated before insertion.';

COMMENT ON FUNCTION public.has_role(uuid, app_role) IS 
  'SECURITY CRITICAL: This SECURITY DEFINER function is used in all RLS policies for role-based access control.
   Any bugs here bypass table-level security. Changes require security review.';

COMMENT ON FUNCTION public.has_presupuesto_access(uuid, uuid) IS 
  'SECURITY CRITICAL: This SECURITY DEFINER function controls budget access via RLS policies.
   Changes require security review.';

COMMENT ON FUNCTION public.has_presupuesto_role(uuid, uuid, app_role) IS 
  'SECURITY CRITICAL: This SECURITY DEFINER function controls budget role access via RLS policies.
   Changes require security review.';