-- Add parent_layer_id for hierarchical layer structure
ALTER TABLE public.budget_volume_layers
ADD COLUMN parent_layer_id UUID REFERENCES public.budget_volume_layers(id) ON DELETE CASCADE DEFAULT NULL;

-- Index for efficient child lookups
CREATE INDEX idx_volume_layers_parent ON public.budget_volume_layers(parent_layer_id) WHERE parent_layer_id IS NOT NULL;