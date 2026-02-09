
-- Floor plan main table
CREATE TABLE public.budget_floor_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Planta principal',
  width NUMERIC NOT NULL DEFAULT 12,
  length NUMERIC NOT NULL DEFAULT 9,
  default_height NUMERIC NOT NULL DEFAULT 2.7,
  external_wall_thickness NUMERIC NOT NULL DEFAULT 0.3,
  internal_wall_thickness NUMERIC NOT NULL DEFAULT 0.15,
  roof_overhang NUMERIC DEFAULT 0.6,
  roof_slope_percent NUMERIC DEFAULT 20,
  roof_type TEXT DEFAULT 'dos_aguas',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Rooms in the floor plan
CREATE TABLE public.budget_floor_plan_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_plan_id UUID NOT NULL REFERENCES public.budget_floor_plans(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pos_x NUMERIC NOT NULL DEFAULT 0,
  pos_y NUMERIC NOT NULL DEFAULT 0,
  width NUMERIC NOT NULL DEFAULT 4,
  length NUMERIC NOT NULL DEFAULT 3,
  height NUMERIC,
  order_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Walls for each room (4 walls per room)
CREATE TABLE public.budget_floor_plan_walls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.budget_floor_plan_rooms(id) ON DELETE CASCADE,
  wall_index INT NOT NULL CHECK (wall_index BETWEEN 1 AND 4),
  wall_type TEXT NOT NULL DEFAULT 'interna',
  thickness NUMERIC,
  height NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Openings (doors/windows) in walls
CREATE TABLE public.budget_floor_plan_openings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wall_id UUID NOT NULL REFERENCES public.budget_floor_plan_walls(id) ON DELETE CASCADE,
  opening_type TEXT NOT NULL DEFAULT 'puerta',
  name TEXT,
  width NUMERIC NOT NULL DEFAULT 0.925,
  height NUMERIC NOT NULL DEFAULT 2.15,
  position_x NUMERIC DEFAULT 0.5,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.budget_floor_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_floor_plan_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_floor_plan_walls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_floor_plan_openings ENABLE ROW LEVEL SECURITY;

-- RLS policies - access via budget
CREATE POLICY "Users with budget access can view floor plans"
ON public.budget_floor_plans FOR SELECT
USING (public.has_presupuesto_access(auth.uid(), budget_id));

CREATE POLICY "Users with budget access can insert floor plans"
ON public.budget_floor_plans FOR INSERT
WITH CHECK (public.has_presupuesto_access(auth.uid(), budget_id));

CREATE POLICY "Users with budget access can update floor plans"
ON public.budget_floor_plans FOR UPDATE
USING (public.has_presupuesto_access(auth.uid(), budget_id));

CREATE POLICY "Users with budget access can delete floor plans"
ON public.budget_floor_plans FOR DELETE
USING (public.has_presupuesto_access(auth.uid(), budget_id));

-- Rooms policies via floor plan -> budget
CREATE POLICY "Users with budget access can manage rooms"
ON public.budget_floor_plan_rooms FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.budget_floor_plans fp
  WHERE fp.id = floor_plan_id
  AND public.has_presupuesto_access(auth.uid(), fp.budget_id)
));

-- Walls policies via room -> floor plan -> budget
CREATE POLICY "Users with budget access can manage walls"
ON public.budget_floor_plan_walls FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.budget_floor_plan_rooms r
  JOIN public.budget_floor_plans fp ON fp.id = r.floor_plan_id
  WHERE r.id = room_id
  AND public.has_presupuesto_access(auth.uid(), fp.budget_id)
));

-- Openings policies via wall -> room -> floor plan -> budget
CREATE POLICY "Users with budget access can manage openings"
ON public.budget_floor_plan_openings FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.budget_floor_plan_walls w
  JOIN public.budget_floor_plan_rooms r ON r.id = w.room_id
  JOIN public.budget_floor_plans fp ON fp.id = r.floor_plan_id
  WHERE w.id = wall_id
  AND public.has_presupuesto_access(auth.uid(), fp.budget_id)
));

-- Triggers for updated_at
CREATE TRIGGER update_floor_plans_updated_at
BEFORE UPDATE ON public.budget_floor_plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_floor_plan_rooms_updated_at
BEFORE UPDATE ON public.budget_floor_plan_rooms
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
