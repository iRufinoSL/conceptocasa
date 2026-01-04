-- Table to store Gmail OAuth tokens per user
CREATE TABLE public.gmail_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  email VARCHAR(255) NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  history_id VARCHAR(50),
  last_sync_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, email)
);

-- Table to track synced emails to avoid duplicates
CREATE TABLE public.gmail_synced_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES public.gmail_connections(id) ON DELETE CASCADE,
  gmail_message_id VARCHAR(100) NOT NULL,
  gmail_thread_id VARCHAR(100),
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  communication_id UUID REFERENCES public.crm_communications(id) ON DELETE SET NULL,
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  subject TEXT,
  from_email VARCHAR(255),
  to_emails TEXT[],
  received_at TIMESTAMP WITH TIME ZONE,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(connection_id, gmail_message_id)
);

-- Table for Gmail sync rules and automation
CREATE TABLE public.gmail_sync_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES public.gmail_connections(id) ON DELETE CASCADE,
  rule_type VARCHAR(50) NOT NULL CHECK (rule_type IN ('log_communication', 'create_task', 'send_notification')),
  is_enabled BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gmail_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmail_synced_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmail_sync_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for gmail_connections
CREATE POLICY "Users can view their own Gmail connections"
ON public.gmail_connections FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Gmail connections"
ON public.gmail_connections FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Gmail connections"
ON public.gmail_connections FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Gmail connections"
ON public.gmail_connections FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policies for gmail_synced_messages
CREATE POLICY "Users can view their synced messages"
ON public.gmail_synced_messages FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.gmail_connections gc
  WHERE gc.id = gmail_synced_messages.connection_id
  AND gc.user_id = auth.uid()
));

CREATE POLICY "Users can insert synced messages"
ON public.gmail_synced_messages FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.gmail_connections gc
  WHERE gc.id = gmail_synced_messages.connection_id
  AND gc.user_id = auth.uid()
));

-- RLS Policies for gmail_sync_rules
CREATE POLICY "Users can view their sync rules"
ON public.gmail_sync_rules FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.gmail_connections gc
  WHERE gc.id = gmail_sync_rules.connection_id
  AND gc.user_id = auth.uid()
));

CREATE POLICY "Users can manage their sync rules"
ON public.gmail_sync_rules FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.gmail_connections gc
  WHERE gc.id = gmail_sync_rules.connection_id
  AND gc.user_id = auth.uid()
));

-- Trigger for updated_at
CREATE TRIGGER update_gmail_connections_updated_at
BEFORE UPDATE ON public.gmail_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_gmail_sync_rules_updated_at
BEFORE UPDATE ON public.gmail_sync_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();