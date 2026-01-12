-- Create whatsapp_messages table for tracking WhatsApp communications
CREATE TABLE public.whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  budget_id UUID REFERENCES public.presupuestos(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'pending', 'replied')),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create whatsapp_attachments table for files associated with messages
CREATE TABLE public.whatsapp_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.whatsapp_messages(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  is_from_contact BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_attachments ENABLE ROW LEVEL SECURITY;

-- RLS policies for whatsapp_messages
CREATE POLICY "Authenticated users can view whatsapp messages" 
ON public.whatsapp_messages FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create whatsapp messages" 
ON public.whatsapp_messages FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update whatsapp messages" 
ON public.whatsapp_messages FOR UPDATE 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete whatsapp messages" 
ON public.whatsapp_messages FOR DELETE 
USING (auth.uid() IS NOT NULL);

-- RLS policies for whatsapp_attachments
CREATE POLICY "Authenticated users can view whatsapp attachments" 
ON public.whatsapp_attachments FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create whatsapp attachments" 
ON public.whatsapp_attachments FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete whatsapp attachments" 
ON public.whatsapp_attachments FOR DELETE 
USING (auth.uid() IS NOT NULL);

-- Create storage bucket for whatsapp attachments
INSERT INTO storage.buckets (id, name, public) 
VALUES ('whatsapp-attachments', 'whatsapp-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated users can upload whatsapp attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'whatsapp-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view whatsapp attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'whatsapp-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete whatsapp attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'whatsapp-attachments' AND auth.uid() IS NOT NULL);

-- Indexes for better query performance
CREATE INDEX idx_whatsapp_messages_contact_id ON public.whatsapp_messages(contact_id);
CREATE INDEX idx_whatsapp_messages_budget_id ON public.whatsapp_messages(budget_id);
CREATE INDEX idx_whatsapp_messages_created_at ON public.whatsapp_messages(created_at DESC);
CREATE INDEX idx_whatsapp_attachments_message_id ON public.whatsapp_attachments(message_id);

-- Update trigger for updated_at
CREATE TRIGGER update_whatsapp_messages_updated_at
BEFORE UPDATE ON public.whatsapp_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();