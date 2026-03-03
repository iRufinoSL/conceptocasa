
-- Brain nodes table for TheBrain-style navigation
CREATE TABLE public.brain_nodes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  parent_id UUID REFERENCES public.brain_nodes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT, -- lucide icon name
  node_type TEXT NOT NULL DEFAULT 'note' CHECK (node_type IN ('module', 'data', 'note')),
  target_url TEXT, -- route to navigate to for module/data nodes
  target_params JSONB, -- extra params like budgetId, tab name
  color TEXT, -- hex or tailwind color token
  order_index INTEGER NOT NULL DEFAULT 0,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast tree traversal
CREATE INDEX idx_brain_nodes_parent ON public.brain_nodes(parent_id);
CREATE INDEX idx_brain_nodes_user ON public.brain_nodes(user_id);

-- Enable RLS
ALTER TABLE public.brain_nodes ENABLE ROW LEVEL SECURITY;

-- Users can only access their own nodes
CREATE POLICY "Users can view their own brain nodes"
  ON public.brain_nodes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own brain nodes"
  ON public.brain_nodes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own brain nodes"
  ON public.brain_nodes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own brain nodes"
  ON public.brain_nodes FOR DELETE
  USING (auth.uid() = user_id);

-- Admins can see all nodes
CREATE POLICY "Admins can view all brain nodes"
  ON public.brain_nodes FOR SELECT
  USING (public.has_role(auth.uid(), 'administrador'::public.app_role));

-- Timestamp trigger
CREATE TRIGGER update_brain_nodes_updated_at
  BEFORE UPDATE ON public.brain_nodes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Cross-links table for non-hierarchical relationships
CREATE TABLE public.brain_node_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_node_id UUID NOT NULL REFERENCES public.brain_nodes(id) ON DELETE CASCADE,
  to_node_id UUID NOT NULL REFERENCES public.brain_nodes(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL DEFAULT 'related',
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(from_node_id, to_node_id)
);

ALTER TABLE public.brain_node_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own brain node links"
  ON public.brain_node_links FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own brain node links"
  ON public.brain_node_links FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own brain node links"
  ON public.brain_node_links FOR DELETE
  USING (auth.uid() = user_id);
