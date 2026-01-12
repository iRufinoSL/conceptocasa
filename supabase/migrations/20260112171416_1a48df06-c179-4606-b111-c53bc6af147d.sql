-- Add WhatsApp phone number to company settings
ALTER TABLE public.company_settings 
ADD COLUMN whatsapp_phone TEXT DEFAULT NULL;

-- Create WhatsApp message templates table
CREATE TABLE public.whatsapp_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id)
);

-- Enable RLS
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies for whatsapp_templates (all authenticated users can read, admins can modify)
CREATE POLICY "Authenticated users can view active templates" 
ON public.whatsapp_templates 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert templates" 
ON public.whatsapp_templates 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update templates" 
ON public.whatsapp_templates 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete templates" 
ON public.whatsapp_templates 
FOR DELETE 
USING (auth.uid() IS NOT NULL);

-- Trigger for updated_at
CREATE TRIGGER update_whatsapp_templates_updated_at
BEFORE UPDATE ON public.whatsapp_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some default templates
INSERT INTO public.whatsapp_templates (name, category, content) VALUES
('Saludo inicial', 'General', 'Hola, soy de {{empresa}}. Me pongo en contacto contigo respecto al presupuesto {{presupuesto}}.'),
('Seguimiento presupuesto', 'Presupuestos', 'Hola {{contacto}}, quería hacer seguimiento del presupuesto {{presupuesto}} que te enviamos. ¿Has tenido ocasión de revisarlo?'),
('Confirmación cita', 'Citas', 'Hola {{contacto}}, te confirmo nuestra cita para el día {{fecha}}. ¿Te viene bien?'),
('Recordatorio', 'Recordatorios', 'Hola {{contacto}}, te recordamos que tenemos pendiente {{asunto}}. ¿Cuándo podríamos hablar?'),
('Agradecimiento', 'General', 'Hola {{contacto}}, muchas gracias por tu tiempo. Quedamos a tu disposición para cualquier consulta.');