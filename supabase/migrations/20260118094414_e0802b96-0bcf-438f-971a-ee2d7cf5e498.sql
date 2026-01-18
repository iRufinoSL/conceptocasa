-- Fix email_messages_content_exposure: Simplify and restrict colaborador access
-- Remove complex indirect access via budget/project relationships
-- Colaboradores should only access emails they directly created

-- Drop the current complex policy
DROP POLICY IF EXISTS "Colaboradores can view their own emails" ON public.email_messages;

-- Create a simpler, more secure policy - colaboradores can ONLY view emails they created
CREATE POLICY "Colaboradores can view emails they created"
ON public.email_messages
FOR SELECT
USING (
  has_role(auth.uid(), 'colaborador'::app_role)
  AND created_by = auth.uid()
);

-- Add a comment documenting the security decision
COMMENT ON TABLE public.email_messages IS 'Email messages table. Colaboradores restricted to emails they created only. Admins have full access. Email content (body_html, body_text) contains sensitive business communications.';