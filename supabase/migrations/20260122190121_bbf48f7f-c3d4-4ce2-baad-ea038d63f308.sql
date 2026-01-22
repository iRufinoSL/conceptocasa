-- Add reminder and travel time fields to budget_activity_resources for appointments
ALTER TABLE public.budget_activity_resources
ADD COLUMN IF NOT EXISTS reminder_minutes integer DEFAULT 15,
ADD COLUMN IF NOT EXISTS travel_time_minutes integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS has_travel_time boolean DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN public.budget_activity_resources.reminder_minutes IS 'Minutes before appointment to send reminder';
COMMENT ON COLUMN public.budget_activity_resources.travel_time_minutes IS 'Travel time in minutes to appointment location';
COMMENT ON COLUMN public.budget_activity_resources.has_travel_time IS 'Whether to include travel time in reminder calculation';