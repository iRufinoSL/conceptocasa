-- Add depends_on_phase_id field for sequence dependencies (separate from parent_id hierarchy)
ALTER TABLE public.budget_phases 
ADD COLUMN IF NOT EXISTS depends_on_phase_id uuid REFERENCES public.budget_phases(id) ON DELETE SET NULL;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_budget_phases_depends_on ON public.budget_phases(depends_on_phase_id);

-- Add comment explaining the difference between parent_id and depends_on_phase_id
COMMENT ON COLUMN public.budget_phases.depends_on_phase_id IS 'Sequence dependency: this phase starts after the referenced phase ends. Different from parent_id which represents hierarchy (subphases).';