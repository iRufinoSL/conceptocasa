
-- Add group columns to budget_floor_plan_rooms for space grouping
ALTER TABLE public.budget_floor_plan_rooms
  ADD COLUMN group_id UUID DEFAULT NULL,
  ADD COLUMN group_name TEXT DEFAULT NULL;

-- Index for fast group lookups
CREATE INDEX idx_floor_plan_rooms_group_id ON public.budget_floor_plan_rooms (group_id) WHERE group_id IS NOT NULL;
