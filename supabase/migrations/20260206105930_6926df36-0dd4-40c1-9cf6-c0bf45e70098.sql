
-- Budget Messages: internal messaging system linked to budgets
CREATE TABLE public.budget_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id),
  -- Follow-up fields (same model as CRM gestiones)
  status TEXT NOT NULL DEFAULT 'pendiente',
  target_date DATE,
  start_time TEXT,
  end_time TEXT,
  -- Communication channel used (null = internal only)
  sent_via TEXT, -- 'email', 'whatsapp', 'sms', or null for internal
  sent_at TIMESTAMP WITH TIME ZONE
);

-- Message recipients (contacts from QUIÉN?)
CREATE TABLE public.budget_message_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.budget_messages(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, contact_id)
);

-- Message linked activities
CREATE TABLE public.budget_message_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.budget_messages(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES public.budget_activities(id) ON DELETE CASCADE,
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, activity_id)
);

-- Message linked resources (always under an activity)
CREATE TABLE public.budget_message_resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.budget_messages(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES public.budget_activity_resources(id) ON DELETE CASCADE,
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, resource_id)
);

-- Enable RLS on all tables
ALTER TABLE public.budget_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_message_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_message_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_message_resources ENABLE ROW LEVEL SECURITY;

-- RLS Policies for budget_messages
CREATE POLICY "Authenticated users can view budget messages"
  ON public.budget_messages FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create budget messages"
  ON public.budget_messages FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update budget messages"
  ON public.budget_messages FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete budget messages"
  ON public.budget_messages FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- RLS Policies for budget_message_recipients
CREATE POLICY "Authenticated users can view message recipients"
  ON public.budget_message_recipients FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage message recipients"
  ON public.budget_message_recipients FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete message recipients"
  ON public.budget_message_recipients FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- RLS Policies for budget_message_activities
CREATE POLICY "Authenticated users can view message activities"
  ON public.budget_message_activities FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage message activities"
  ON public.budget_message_activities FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update message activities"
  ON public.budget_message_activities FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete message activities"
  ON public.budget_message_activities FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- RLS Policies for budget_message_resources
CREATE POLICY "Authenticated users can view message resources"
  ON public.budget_message_resources FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage message resources"
  ON public.budget_message_resources FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update message resources"
  ON public.budget_message_resources FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete message resources"
  ON public.budget_message_resources FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Trigger for updated_at on budget_messages
CREATE TRIGGER update_budget_messages_updated_at
  BEFORE UPDATE ON public.budget_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
