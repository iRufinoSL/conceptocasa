-- Add status column to presupuestos table
-- Values: 'activo', 'en_ejecucion', 'archivado'
ALTER TABLE public.presupuestos 
ADD COLUMN status TEXT NOT NULL DEFAULT 'activo';

-- Migrate existing data: archived = true -> 'archivado', archived = false -> 'activo'
UPDATE public.presupuestos 
SET status = CASE 
  WHEN archived = true THEN 'archivado'
  ELSE 'activo'
END;

-- Add check constraint for valid status values
ALTER TABLE public.presupuestos 
ADD CONSTRAINT presupuestos_status_check 
CHECK (status IN ('activo', 'en_ejecucion', 'archivado'));