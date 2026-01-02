-- Tabla para almacenar historial de comunicaciones
CREATE TABLE public.crm_communications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  communication_type TEXT NOT NULL DEFAULT 'email', -- 'email', 'whatsapp', 'call', 'meeting'
  direction TEXT NOT NULL DEFAULT 'outbound', -- 'inbound', 'outbound'
  subject TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'failed', 'opened'
  sent_at TIMESTAMP WITH TIME ZONE,
  opened_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabla para plantillas de email
CREATE TABLE public.email_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general', -- 'general', 'presupuesto', 'proyecto', 'factura', 'recordatorio'
  variables JSONB DEFAULT '[]', -- Variables disponibles en la plantilla
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabla para campañas de email
CREATE TABLE public.email_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'scheduled', 'sending', 'completed', 'cancelled'
  scheduled_at TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  opened_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  target_filters JSONB DEFAULT '{}', -- Filtros para seleccionar destinatarios
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabla para destinatarios de campaña
CREATE TABLE public.email_campaign_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'failed', 'opened'
  sent_at TIMESTAMP WITH TIME ZONE,
  opened_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, contact_id)
);

-- Enable RLS
ALTER TABLE public.crm_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;

-- Policies for crm_communications
CREATE POLICY "Authenticated users can view communications" 
ON public.crm_communications FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create communications" 
ON public.crm_communications FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update communications" 
ON public.crm_communications FOR UPDATE 
USING (auth.uid() IS NOT NULL);

-- Policies for email_templates
CREATE POLICY "Authenticated users can view templates" 
ON public.email_templates FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage templates" 
ON public.email_templates FOR ALL 
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrador'));

-- Policies for email_campaigns
CREATE POLICY "Authenticated users can view campaigns" 
ON public.email_campaigns FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage campaigns" 
ON public.email_campaigns FOR ALL 
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrador'));

-- Policies for email_campaign_recipients
CREATE POLICY "Authenticated users can view campaign recipients" 
ON public.email_campaign_recipients FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage campaign recipients" 
ON public.email_campaign_recipients FOR ALL 
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrador'));

-- Trigger for updated_at
CREATE TRIGGER update_crm_communications_updated_at
BEFORE UPDATE ON public.crm_communications
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at
BEFORE UPDATE ON public.email_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_email_campaigns_updated_at
BEFORE UPDATE ON public.email_campaigns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default templates
INSERT INTO public.email_templates (name, subject, content, category, variables) VALUES
('Confirmación de presupuesto', 'Tu presupuesto {{presupuesto_nombre}} está listo', '<h1>Hola {{nombre}},</h1><p>Tu presupuesto <strong>{{presupuesto_nombre}}</strong> ya está disponible para revisión.</p><p>Puedes acceder a los detalles en cualquier momento.</p><p>Saludos,<br/>{{empresa_nombre}}</p>', 'presupuesto', '["nombre", "presupuesto_nombre", "empresa_nombre"]'),
('Recordatorio de reunión', 'Recordatorio: Reunión programada para {{fecha}}', '<h1>Hola {{nombre}},</h1><p>Te recordamos que tienes una reunión programada:</p><p><strong>Fecha:</strong> {{fecha}}<br/><strong>Hora:</strong> {{hora}}<br/><strong>Asunto:</strong> {{asunto}}</p><p>¡Te esperamos!</p><p>Saludos,<br/>{{empresa_nombre}}</p>', 'recordatorio', '["nombre", "fecha", "hora", "asunto", "empresa_nombre"]'),
('Bienvenida', '¡Bienvenido a {{empresa_nombre}}!', '<h1>¡Hola {{nombre}}!</h1><p>Gracias por confiar en nosotros. Estamos encantados de tenerte como cliente.</p><p>Si tienes cualquier pregunta, no dudes en contactarnos.</p><p>Saludos cordiales,<br/>{{empresa_nombre}}</p>', 'general', '["nombre", "empresa_nombre"]');