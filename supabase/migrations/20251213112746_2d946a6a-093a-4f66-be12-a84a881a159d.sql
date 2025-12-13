-- Create company settings table
CREATE TABLE public.company_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Concepto.Casa',
  email TEXT DEFAULT 'organiza@concepto.casa',
  phone TEXT DEFAULT '+34 690 123 533',
  address TEXT DEFAULT 'Barcelona, España',
  website TEXT DEFAULT 'www.concepto.casa',
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- Only administrators can view company settings
CREATE POLICY "Administrators can view company settings"
ON public.company_settings
FOR SELECT
USING (public.has_role(auth.uid(), 'administrador'::app_role));

-- Only administrators can update company settings
CREATE POLICY "Administrators can update company settings"
ON public.company_settings
FOR UPDATE
USING (public.has_role(auth.uid(), 'administrador'::app_role));

-- Only administrators can insert company settings
CREATE POLICY "Administrators can insert company settings"
ON public.company_settings
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'administrador'::app_role));

-- Insert default settings
INSERT INTO public.company_settings (name, email, phone, address, website)
VALUES ('Concepto.Casa', 'organiza@concepto.casa', '+34 690 123 533', 'Barcelona, España', 'www.concepto.casa');

-- Create trigger for updated_at
CREATE TRIGGER update_company_settings_updated_at
BEFORE UPDATE ON public.company_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();