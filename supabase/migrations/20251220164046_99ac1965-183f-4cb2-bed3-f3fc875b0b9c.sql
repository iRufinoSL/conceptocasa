-- Table for granular activity access
CREATE TABLE public.user_activity_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  activity_id uuid NOT NULL REFERENCES public.budget_activities(id) ON DELETE CASCADE,
  access_level text NOT NULL DEFAULT 'view' CHECK (access_level IN ('view', 'edit')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, activity_id)
);

-- Table for granular resource access
CREATE TABLE public.user_resource_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  resource_id uuid NOT NULL REFERENCES public.budget_activity_resources(id) ON DELETE CASCADE,
  access_level text NOT NULL DEFAULT 'view' CHECK (access_level IN ('view', 'edit')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, resource_id)
);

-- Enable RLS
ALTER TABLE public.user_activity_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_resource_access ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_activity_access
CREATE POLICY "Admins can manage activity access"
ON public.user_activity_access
FOR ALL
USING (has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Users can view their own activity access"
ON public.user_activity_access
FOR SELECT
USING (auth.uid() = user_id);

-- RLS Policies for user_resource_access
CREATE POLICY "Admins can manage resource access"
ON public.user_resource_access
FOR ALL
USING (has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Users can view their own resource access"
ON public.user_resource_access
FOR SELECT
USING (auth.uid() = user_id);