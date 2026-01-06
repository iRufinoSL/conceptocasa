-- Email Management System Tables

-- Table for storing all email messages (incoming and outgoing)
CREATE TABLE public.email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_emails TEXT[] NOT NULL,
  cc_emails TEXT[],
  bcc_emails TEXT[],
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'received')),
  error_message TEXT,
  external_id TEXT, -- Resend message ID
  metadata JSONB DEFAULT '{}',
  ticket_id UUID,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table for support tickets
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number SERIAL UNIQUE,
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  category TEXT,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add foreign key from email_messages to tickets
ALTER TABLE public.email_messages 
ADD CONSTRAINT email_messages_ticket_id_fkey 
FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE SET NULL;

-- Table for in-app notifications/alerts
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'error', 'success', 'email', 'ticket')),
  read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  action_url TEXT,
  metadata JSONB DEFAULT '{}',
  email_id UUID REFERENCES public.email_messages(id) ON DELETE SET NULL,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for email_messages
CREATE POLICY "Admins can manage all emails"
ON public.email_messages FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Colaboradores can view all emails"
ON public.email_messages FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'colaborador'::app_role));

CREATE POLICY "Colaboradores can create emails"
ON public.email_messages FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'colaborador'::app_role));

-- RLS Policies for tickets
CREATE POLICY "Admins can manage all tickets"
ON public.tickets FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Colaboradores can view all tickets"
ON public.tickets FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'colaborador'::app_role));

CREATE POLICY "Colaboradores can create and update tickets"
ON public.tickets FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'colaborador'::app_role));

CREATE POLICY "Colaboradores can update tickets"
ON public.tickets FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'colaborador'::app_role));

-- RLS Policies for notifications
CREATE POLICY "Users can view their own notifications"
ON public.notifications FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
ON public.notifications FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "System can create notifications"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (true);

-- Triggers for updated_at
CREATE TRIGGER update_email_messages_updated_at
BEFORE UPDATE ON public.email_messages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tickets_updated_at
BEFORE UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Indexes for performance
CREATE INDEX idx_email_messages_contact ON public.email_messages(contact_id);
CREATE INDEX idx_email_messages_ticket ON public.email_messages(ticket_id);
CREATE INDEX idx_email_messages_status ON public.email_messages(status);
CREATE INDEX idx_email_messages_direction ON public.email_messages(direction);
CREATE INDEX idx_tickets_status ON public.tickets(status);
CREATE INDEX idx_tickets_contact ON public.tickets(contact_id);
CREATE INDEX idx_tickets_assigned ON public.tickets(assigned_to);
CREATE INDEX idx_notifications_user_read ON public.notifications(user_id, read);