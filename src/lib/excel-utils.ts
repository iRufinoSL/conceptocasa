import ExcelJS from 'exceljs';
import { z } from 'zod';

// ============= Validation Schemas =============

// Schema for measurement imports
export const measurementImportSchema = z.object({
  name: z.string()
    .min(1, { message: "El nombre no puede estar vacío" })
    .max(200, { message: "El nombre no puede exceder 200 caracteres" })
    .transform(val => val.trim()),
  manual_units: z.number()
    .nonnegative({ message: "Las unidades no pueden ser negativas" })
    .max(999999999, { message: "Las unidades son demasiado grandes" })
    .nullable()
    .optional(),
  measurement_unit: z.enum(['m2', 'm3', 'ml', 'ud', 'mes', 'día', 'hora', 'kg', 't', 'l', 'pa'])
    .default('ud'),
  related_measurements: z.string()
    .max(1000, { message: "Lista de relaciones demasiado larga" })
    .optional()
    .nullable(),
});

// Schema for resource imports
export const resourceImportSchema = z.object({
  name: z.string()
    .min(1, { message: "El nombre no puede estar vacío" })
    .max(300, { message: "El nombre no puede exceder 300 caracteres" })
    .transform(val => val.trim()),
  external_unit_cost: z.number()
    .nonnegative({ message: "El coste no puede ser negativo" })
    .max(999999999, { message: "El coste es demasiado grande" })
    .nullable()
    .optional(),
  unit: z.string()
    .max(50, { message: "La unidad no puede exceder 50 caracteres" })
    .nullable()
    .optional(),
  resource_type: z.enum(['Producto', 'Mano de obra', 'Alquiler', 'Servicio', 'Tarea'])
    .nullable()
    .optional(),
  manual_units: z.number()
    .nonnegative({ message: "Las unidades no pueden ser negativas" })
    .max(999999999, { message: "Las unidades son demasiado grandes" })
    .nullable()
    .optional(),
  related_units: z.number()
    .nonnegative({ message: "Las unidades relacionadas no pueden ser negativas" })
    .max(999999999, { message: "Las unidades relacionadas son demasiado grandes" })
    .nullable()
    .optional(),
  activity_id: z.string()
    .max(100, { message: "El ID de actividad es demasiado largo" })
    .nullable()
    .optional(),
});

export type MeasurementImportData = z.infer<typeof measurementImportSchema>;
export type ResourceImportData = z.infer<typeof resourceImportSchema>;

// ============= Number Parsing =============

/**
 * Parse a number from a cell value, handling European format (comma as decimal separator)
 */
export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  
  if (typeof value === 'number') {
    if (!isFinite(value)) return null;
    return value;
  }
  
  const str = String(value).trim();
  if (!str) return null;
  
  // Replace comma with dot for European format
  const normalized = str.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(normalized);
  
  if (isNaN(num) || !isFinite(num)) return null;
  return num;
}

/**
 * Safely get a string from a cell value
 */
export function getCellString(value: unknown, maxLength: number = 500): string {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();
  return str.substring(0, maxLength);
}

// ============= Excel Reading =============

export interface ExcelReadResult<T> {
  success: boolean;
  data: T[];
  errors: Array<{ row: number; message: string }>;
  totalRows: number;
}

/**
 * Read an Excel file and return validated data
 */
export async function readExcelFile<T>(
  file: File,
  schema: z.ZodSchema<T>,
  columnMapping: Record<string, string[]>, // Maps schema field to possible column names
  options: {
    skipDuplicates?: Set<string>;
    duplicateField?: keyof T;
  } = {}
): Promise<ExcelReadResult<T>> {
  const result: ExcelReadResult<T> = {
    success: false,
    data: [],
    errors: [],
    totalRows: 0,
  };

  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount < 2) {
      result.errors.push({ row: 0, message: 'El archivo no contiene datos suficientes' });
      return result;
    }

    // Get headers from first row
    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber - 1] = getCellString(cell.value).toLowerCase();
    });

    // Map column indices to schema fields
    const fieldToColumn: Record<string, number> = {};
    for (const [field, possibleNames] of Object.entries(columnMapping)) {
      for (let i = 0; i < headers.length; i++) {
        if (possibleNames.some(name => headers[i].includes(name.toLowerCase()))) {
          fieldToColumn[field] = i;
          break;
        }
      }
    }

    // Check if we have at least the name column
    if (fieldToColumn['name'] === undefined) {
      result.errors.push({ row: 0, message: 'No se encontró la columna "Nombre" en el archivo' });
      return result;
    }

    // Process data rows
    result.totalRows = worksheet.rowCount - 1;
    
    for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex++) {
      const row = worksheet.getRow(rowIndex);
      if (!row.hasValues) continue;

      const rawData: Record<string, unknown> = {};
      
      for (const [field, colIndex] of Object.entries(fieldToColumn)) {
        const cell = row.getCell(colIndex + 1);
        const value = cell.value;
        
        // Handle different field types
        if (field.includes('units') || field.includes('cost')) {
          rawData[field] = parseNumber(value);
        } else {
          rawData[field] = getCellString(value);
        }
      }

      // Skip if no name
      const name = getCellString(rawData['name']);
      if (!name) continue;

      // Check for duplicates if needed
      if (options.skipDuplicates && options.duplicateField) {
        const dupValue = getCellString(rawData[options.duplicateField as string]).toLowerCase();
        if (options.skipDuplicates.has(dupValue)) {
          continue;
        }
      }

      // Validate with schema
      const validated = schema.safeParse(rawData);
      
      if (validated.success) {
        result.data.push(validated.data);
      } else {
        const errorMessages = validated.error.errors.map(e => e.message).join(', ');
        result.errors.push({ row: rowIndex, message: errorMessages });
      }
    }

    result.success = result.data.length > 0 || result.errors.length === 0;
  } catch (error) {
    console.error('Error reading Excel file:', error);
    result.errors.push({ row: 0, message: 'Error al leer el archivo Excel' });
  }

  return result;
}

// ============= Excel Writing =============

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
}

/**
 * Create and download an Excel file
 */
export async function writeExcelFile(
  data: Record<string, unknown>[],
  columns: ExcelColumn[],
  fileName: string,
  sheetName: string = 'Datos'
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Lovable App';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sheetName);

  // Set columns
  worksheet.columns = columns.map(col => ({
    header: col.header,
    key: col.key,
    width: col.width || 15,
  }));

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };

  // Add data rows
  data.forEach(item => {
    const rowData: Record<string, unknown> = {};
    columns.forEach(col => {
      rowData[col.key] = item[col.key] ?? '';
    });
    worksheet.addRow(rowData);
  });

  // Generate file
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });
  
  // Trigger download
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============= Column Mappings =============

export const MEASUREMENT_COLUMN_MAPPING: Record<string, string[]> = {
  name: ['nombre', 'medición', 'medicion'],
  manual_units: ['uds manual', 'uds', 'unidades', 'cantidad'],
  measurement_unit: ['ud medida', 'unidad', 'unidad medida'],
  related_measurements: ['mediciones relacionadas', 'relacionadas', 'relaciones'],
};

export const RESOURCE_COLUMN_MAPPING: Record<string, string[]> = {
  name: ['nombre', 'recurso', 'descripción', 'descripcion'],
  external_unit_cost: ['€coste ud', 'coste', 'precio', 'coste unitario'],
  unit: ['ud medida', 'unidad', 'unidad medida'],
  resource_type: ['tipo recurso', 'tipo', 'categoría', 'categoria'],
  manual_units: ['uds manual', 'uds', 'unidades', 'cantidad'],
  related_units: ['uds relacionadas', 'relacionadas'],
  activity_id: ['actividadid', 'actividad'],
};

// ============= Measurement Units =============

export const MEASUREMENT_UNITS = ['m2', 'm3', 'ml', 'ud', 'mes', 'día', 'hora', 'kg', 't', 'l', 'pa'] as const;
export type MeasurementUnit = typeof MEASUREMENT_UNITS[number];
