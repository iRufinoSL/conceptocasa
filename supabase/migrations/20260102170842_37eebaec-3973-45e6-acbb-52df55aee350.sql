-- Change code column from integer to text format (0001/26)
ALTER TABLE public.accounting_entries 
ALTER COLUMN code TYPE text USING LPAD(code::text, 4, '0') || '/25';

-- Also update accounting_entry_lines code to text format
ALTER TABLE public.accounting_entry_lines
ALTER COLUMN code TYPE text USING LPAD(code::text, 4, '0');

-- Create a function to generate the next entry code for a given year
CREATE OR REPLACE FUNCTION public.generate_entry_code(entry_year integer)
RETURNS text AS $$
DECLARE
  year_suffix text;
  max_code integer;
  new_code text;
BEGIN
  -- Get last 2 digits of year
  year_suffix := LPAD((entry_year % 100)::text, 2, '0');
  
  -- Find the maximum code number for this year
  SELECT COALESCE(MAX(NULLIF(SPLIT_PART(code, '/', 1), '')::integer), 0)
  INTO max_code
  FROM public.accounting_entries
  WHERE code LIKE '%/' || year_suffix;
  
  -- Generate new code
  new_code := LPAD((max_code + 1)::text, 4, '0') || '/' || year_suffix;
  
  RETURN new_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;