-- Añadir columna document_type a invoices para diferenciar Factura, Presupuesto, Proforma
ALTER TABLE public.invoices 
ADD COLUMN document_type text NOT NULL DEFAULT 'factura'
CHECK (document_type IN ('factura', 'presupuesto', 'proforma'));

-- Crear índice para mejorar consultas por tipo y año
CREATE INDEX idx_invoices_document_type ON public.invoices(document_type);
CREATE INDEX idx_invoices_invoice_date ON public.invoices(invoice_date);

-- Modificar la constraint unique para que sea única por tipo de documento y número
-- Primero eliminamos la constraint existente si existe
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;

-- Crear nueva constraint única por documento, número y año
CREATE UNIQUE INDEX idx_invoices_unique_number_type_year 
ON public.invoices(document_type, invoice_number, EXTRACT(YEAR FROM invoice_date::date));