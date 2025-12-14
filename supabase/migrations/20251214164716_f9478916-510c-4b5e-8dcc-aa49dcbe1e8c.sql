-- Modify handle_new_user trigger to auto-assign admin role to first user
-- This solves the chicken-and-egg problem where no admin can create the first admin

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  validated_full_name text;
  admin_count integer;
BEGIN
  -- Validate and sanitize full_name from metadata
  -- Limit to 255 characters and handle NULL/empty cases
  validated_full_name := NULLIF(TRIM(COALESCE(
    LEFT(NEW.raw_user_meta_data ->> 'full_name', 255),
    ''
  )), '');
  
  -- Insert profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, validated_full_name);
  
  -- Check if any admin exists
  SELECT COUNT(*) INTO admin_count 
  FROM public.user_roles 
  WHERE role = 'administrador'::app_role;
  
  -- Auto-assign admin role if this is the first user with no existing admins
  IF admin_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'administrador'::app_role);
  END IF;
  
  RETURN NEW;
END;
$$;