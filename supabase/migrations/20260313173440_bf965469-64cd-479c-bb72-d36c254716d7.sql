
ALTER TABLE public.budget_object_templates
ADD COLUMN resource_id uuid REFERENCES public.external_resources(id) ON DELETE SET NULL;

CREATE INDEX idx_budget_object_templates_resource_id ON public.budget_object_templates(resource_id);
