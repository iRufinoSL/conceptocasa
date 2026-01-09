-- Add project_id to email_messages for linking emails to projects
ALTER TABLE public.email_messages 
ADD COLUMN project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX idx_email_messages_project_id ON public.email_messages(project_id);

-- Add due_date to tickets table for reminder/appointment functionality
ALTER TABLE public.tickets
ADD COLUMN due_date TIMESTAMPTZ;

-- Add reminder_at to tickets for creating alarms/reminders
ALTER TABLE public.tickets
ADD COLUMN reminder_at TIMESTAMPTZ;

-- Create a table for managing reminders/appointments from emails
CREATE TABLE public.reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  reminder_at TIMESTAMPTZ NOT NULL,
  reminder_type TEXT NOT NULL DEFAULT 'reminder' CHECK (reminder_type IN ('reminder', 'appointment', 'deadline')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'dismissed')),
  email_id UUID REFERENCES public.email_messages(id) ON DELETE SET NULL,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  budget_id UUID REFERENCES public.presupuestos(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- RLS policies for reminders
CREATE POLICY "Admins can do everything on reminders"
ON public.reminders FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'administrador'::public.app_role));

CREATE POLICY "Users can view reminders assigned to them"
ON public.reminders FOR SELECT
TO authenticated
USING (assigned_to = auth.uid() OR created_by = auth.uid());

CREATE POLICY "Users can create reminders"
ON public.reminders FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'administrador'::public.app_role));

CREATE POLICY "Users can update their own reminders"
ON public.reminders FOR UPDATE
TO authenticated
USING (created_by = auth.uid() OR assigned_to = auth.uid() OR public.has_role(auth.uid(), 'administrador'::public.app_role));

-- Create index for reminder queries
CREATE INDEX idx_reminders_reminder_at ON public.reminders(reminder_at) WHERE status = 'pending';
CREATE INDEX idx_reminders_assigned_to ON public.reminders(assigned_to);
CREATE INDEX idx_reminders_project_id ON public.reminders(project_id);

-- Add trigger for updated_at
CREATE TRIGGER update_reminders_updated_at
BEFORE UPDATE ON public.reminders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();