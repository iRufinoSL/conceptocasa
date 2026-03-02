-- Make pos_x and pos_y nullable (NULL = room not placed on grid)
-- Previously posX < 0 meant "not placed"; now NULL means that
ALTER TABLE public.budget_floor_plan_rooms 
  ALTER COLUMN pos_x DROP NOT NULL,
  ALTER COLUMN pos_x DROP DEFAULT;

ALTER TABLE public.budget_floor_plan_rooms 
  ALTER COLUMN pos_y DROP NOT NULL,
  ALTER COLUMN pos_y DROP DEFAULT;

-- Convert legacy "not placed" markers (negative values) to NULL
UPDATE public.budget_floor_plan_rooms 
SET pos_x = NULL, pos_y = NULL 
WHERE pos_x < 0 OR pos_y < 0;