-- Add contact_id to project_documents to track document contact (e.g., from email sender)
ALTER TABLE public.project_documents 
ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL;

-- Add budget_id to project_documents to allow linking to budgets directly
ALTER TABLE public.project_documents 
ADD COLUMN IF NOT EXISTS budget_id UUID REFERENCES public.presupuestos(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_project_documents_contact_id ON public.project_documents(contact_id);
CREATE INDEX IF NOT EXISTS idx_project_documents_budget_id ON public.project_documents(budget_id);

-- Add email_id to project_documents to track which email the document was created from
ALTER TABLE public.project_documents 
ADD COLUMN IF NOT EXISTS email_id UUID REFERENCES public.email_messages(id) ON DELETE SET NULL;