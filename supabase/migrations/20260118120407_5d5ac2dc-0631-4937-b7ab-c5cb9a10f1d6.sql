-- Create table for website analytics events
CREATE TABLE public.website_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'page_view', 'form_start', 'form_submit', 'button_click', etc.
  page_path TEXT,
  page_title TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  user_agent TEXT,
  screen_width INTEGER,
  screen_height INTEGER,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient queries
CREATE INDEX idx_website_events_session ON public.website_events(session_id);
CREATE INDEX idx_website_events_created ON public.website_events(created_at DESC);
CREATE INDEX idx_website_events_type ON public.website_events(event_type);
CREATE INDEX idx_website_events_contact ON public.website_events(contact_id);

-- Enable RLS
ALTER TABLE public.website_events ENABLE ROW LEVEL SECURITY;

-- Policy for inserting events (public - anyone can track)
CREATE POLICY "Anyone can insert website events"
ON public.website_events
FOR INSERT
WITH CHECK (true);

-- Policy for reading events (only admin/colaborador)
CREATE POLICY "Admin and colaborador can view website events"
ON public.website_events
FOR SELECT
USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR
  public.has_role(auth.uid(), 'colaborador'::public.app_role)
);

-- Add column to crm_contacts to link first visit source
ALTER TABLE public.crm_contacts 
ADD COLUMN IF NOT EXISTS first_utm_source TEXT,
ADD COLUMN IF NOT EXISTS first_utm_medium TEXT,
ADD COLUMN IF NOT EXISTS first_utm_campaign TEXT,
ADD COLUMN IF NOT EXISTS first_session_id TEXT;