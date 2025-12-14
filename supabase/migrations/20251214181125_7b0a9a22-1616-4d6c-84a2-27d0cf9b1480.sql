-- Enable realtime for budget_measurements table
ALTER PUBLICATION supabase_realtime ADD TABLE public.budget_measurements;

-- Also enable for budget_measurement_relations as they affect calculations
ALTER PUBLICATION supabase_realtime ADD TABLE public.budget_measurement_relations;