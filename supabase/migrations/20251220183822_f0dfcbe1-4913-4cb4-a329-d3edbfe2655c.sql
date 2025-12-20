-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage presupuesto access" ON public.user_presupuestos;

-- Create separate INSERT policies for admins on user_roles
CREATE POLICY "Admins can insert roles"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'administrador'::app_role));

-- Create separate UPDATE policy for admins on user_roles
CREATE POLICY "Admins can update roles"
ON public.user_roles FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'administrador'::app_role));

-- Create separate DELETE policy for admins on user_roles
CREATE POLICY "Admins can delete roles"
ON public.user_roles FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'administrador'::app_role));

-- Create separate INSERT policies for admins on user_presupuestos
CREATE POLICY "Admins can insert presupuesto access"
ON public.user_presupuestos FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'administrador'::app_role));

-- Create separate UPDATE policy for admins on user_presupuestos
CREATE POLICY "Admins can update presupuesto access"
ON public.user_presupuestos FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'administrador'::app_role));

-- Create separate DELETE policy for admins on user_presupuestos
CREATE POLICY "Admins can delete presupuesto access"
ON public.user_presupuestos FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'administrador'::app_role));