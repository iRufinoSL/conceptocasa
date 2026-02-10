
ALTER TABLE public.budget_floor_plan_rooms
ADD COLUMN has_floor boolean NOT NULL DEFAULT true,
ADD COLUMN has_roof boolean NOT NULL DEFAULT true;
