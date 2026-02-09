
-- Table for voice notes/alerts/messages
CREATE TABLE public.voice_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  reminder_at TIMESTAMPTZ,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  contact_name TEXT,
  budget_id UUID REFERENCES public.presupuestos(id) ON DELETE SET NULL,
  budget_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'dismissed')),
  sms_sent BOOLEAN NOT NULL DEFAULT false,
  sms_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.voice_notes ENABLE ROW LEVEL SECURITY;

-- Users can view their own voice notes
CREATE POLICY "Users can view own voice notes"
ON public.voice_notes FOR SELECT
USING (auth.uid() = created_by);

-- Users can create their own voice notes
CREATE POLICY "Users can create own voice notes"
ON public.voice_notes FOR INSERT
WITH CHECK (auth.uid() = created_by);

-- Users can update their own voice notes
CREATE POLICY "Users can update own voice notes"
ON public.voice_notes FOR UPDATE
USING (auth.uid() = created_by);

-- Users can delete their own voice notes
CREATE POLICY "Users can delete own voice notes"
ON public.voice_notes FOR DELETE
USING (auth.uid() = created_by);

-- Service role policy for the reminder checker edge function
CREATE POLICY "Service role full access to voice notes"
ON public.voice_notes FOR ALL
USING (true)
WITH CHECK (true);

-- Index for efficient reminder queries
CREATE INDEX idx_voice_notes_reminder ON public.voice_notes (reminder_at) WHERE reminder_at IS NOT NULL AND sms_sent = false AND status = 'active';

-- Index for user queries
CREATE INDEX idx_voice_notes_user ON public.voice_notes (created_by, created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_voice_notes_updated_at
BEFORE UPDATE ON public.voice_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for voice notes
ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_notes;
