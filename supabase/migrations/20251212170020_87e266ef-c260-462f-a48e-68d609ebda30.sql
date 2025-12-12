-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('administrador', 'colaborador', 'cliente');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create presupuestos table
CREATE TABLE public.presupuestos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  codigo_correlativo INTEGER NOT NULL UNIQUE,
  version TEXT NOT NULL,
  poblacion TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Create user_presupuestos junction table (many-to-many with role per relationship)
CREATE TABLE public.user_presupuestos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  presupuesto_id UUID REFERENCES public.presupuestos(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, presupuesto_id)
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presupuestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_presupuestos ENABLE ROW LEVEL SECURITY;

-- Security definer function to check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Security definer function to check user role for a specific presupuesto
CREATE OR REPLACE FUNCTION public.has_presupuesto_role(_user_id UUID, _presupuesto_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_presupuestos
    WHERE user_id = _user_id
      AND presupuesto_id = _presupuesto_id
      AND role = _role
  )
$$;

-- Function to check if user has access to presupuesto
CREATE OR REPLACE FUNCTION public.has_presupuesto_access(_user_id UUID, _presupuesto_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_presupuestos
    WHERE user_id = _user_id
      AND presupuesto_id = _presupuesto_id
  )
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'administrador'));

-- RLS Policies for presupuestos
CREATE POLICY "Users can view presupuestos they have access to"
ON public.presupuestos FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador') OR
  public.has_presupuesto_access(auth.uid(), id)
);

CREATE POLICY "Admins can insert presupuestos"
ON public.presupuestos FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'administrador'));

CREATE POLICY "Admins can update presupuestos"
ON public.presupuestos FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'administrador'));

CREATE POLICY "Admins can delete presupuestos"
ON public.presupuestos FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'administrador'));

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'administrador'));

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'administrador'));

-- RLS Policies for user_presupuestos
CREATE POLICY "Users can view their own presupuesto access"
ON public.user_presupuestos FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all presupuesto access"
ON public.user_presupuestos FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'administrador'));

CREATE POLICY "Admins can manage presupuesto access"
ON public.user_presupuestos FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'administrador'));

-- Trigger function to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name');
  RETURN NEW;
END;
$$;

-- Trigger to auto-create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_presupuestos_updated_at
  BEFORE UPDATE ON public.presupuestos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();