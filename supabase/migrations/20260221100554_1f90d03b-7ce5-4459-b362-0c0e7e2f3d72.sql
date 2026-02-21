CREATE TABLE public.budget_floor_plan_block_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wall_id UUID NOT NULL REFERENCES public.budget_floor_plan_walls(id) ON DELETE CASCADE,
  start_col INTEGER NOT NULL,
  start_row INTEGER NOT NULL,
  span_cols INTEGER NOT NULL DEFAULT 1,
  span_rows INTEGER NOT NULL DEFAULT 1,
  name TEXT,
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.budget_floor_plan_block_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage block groups" ON public.budget_floor_plan_block_groups
  FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.budget_floor_plan_block_groups;