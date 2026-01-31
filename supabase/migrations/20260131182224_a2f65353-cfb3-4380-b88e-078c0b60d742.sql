-- Add column to track if user needs to change password on first login
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS password_change_required boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS last_route text DEFAULT NULL;

-- Add comment explaining the columns
COMMENT ON COLUMN public.profiles.password_change_required IS 'When true, user must change password before accessing the app';
COMMENT ON COLUMN public.profiles.last_route IS 'Last route/path the user visited, used for session restoration';