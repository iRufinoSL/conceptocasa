/**
 * ChiefArchitect XML Parser
 * Parses Microsoft Office XML Spreadsheet format exported from ChiefArchitect.
 * Handles unit detection from cell styles and intelligent measurement conversion.
 */

// Classification translation map (English → Spanish)
const CLASSIFICATION_MAP: Record<string, string> = {
  'foundation': 'Cimentación',
  'subfloor': 'Subsuelo',
  'framing': 'Estructura',
  'siding': 'Revestimiento Exterior',
  'exterior trim': 'Molduras Exteriores',
  'roofing': 'Cubierta',
  'interior insulation': 'Aislamiento Interior',
  'ceiling insulation': 'Aislamiento Techo',
  'flooring': 'Suelos',
  'wall board': 'Tabiquería',
  'windows': 'Ventanas',
  'doors': 'Puertas',
  'interior trim': 'Molduras Interiores',
  'landscaping': 'Paisajismo',
  'electrical': 'Electricidad',
  'plumbing': 'Fontanería',
  'hvac': 'Climatización',
  'cabinets': 'Carpintería',
  'countertops': 'Encimeras',
  'appliances': 'Electrodomésticos',
  'hardware': 'Herrajes',
  'painting': 'Pintura',
  'insulation': 'Aislamiento',
  'drywall': 'Pladur',
  'masonry': 'Albañilería',
  'concrete': 'Hormigón',
  'steel': 'Acero',
  'lumber': 'Madera',
  'millwork': 'Carpintería de taller',
  'specialties': 'Especialidades',
};

// Unit format detection from NumberFormat strings in styles
type CountUnit = 'cu_m' | 'sq_m' | 'm' | 'each';

interface StyleInfo {
  id: string;
  numberFormat: string | null;
  isBold: boolean;
  unit: CountUnit;
}

export interface ChiefArchitectMeasurement {
  id: string;           // Row ID (FO1, R5, etc.)
  classification: string; // English classification
  classificationEs: string; // Spanish translation
  description: string;  // Description text
  size: string;         // Size column value
  countRaw: number;     // Raw count value from XML
  countUnit: CountUnit; // Unit detected from style
  convertedValue: number; // Final converted value
  finalUnit: string;    // Final unit (m2, ml, m3, ud)
  wasConverted: boolean; // Whether conversion was applied
  conversionNote: string; // Explanation of conversion if any
  floor: number | string | null;
  supplier: string;
  accountingCode: string;
}

export interface ChiefArchitectParseResult {
  measurements: ChiefArchitectMeasurement[];
  classifications: string[];
  errors: string[];
  totalRows: number;
}

/**
 * Determine the unit from a NumberFormat string
 */
function detectUnitFromFormat(format: string | null): CountUnit {
  if (!format) return 'each';
  const f = format.toLowerCase();
  if (f.includes('cu m') || f.includes('cu_m')) return 'cu_m';
  if (f.includes('sq m') || f.includes('sq_m')) return 'sq_m';
  // Check for standalone "m" format (not part of cu m or sq m)
  if (/"\s*m\s*"/.test(f) || f.endsWith('/m"') || f === '###0,00" m"') return 'm';
  if (f.includes('each')) return 'each';
  // Plain number formats → each/units
  if (/^[#0.,]+$/.test(f.replace(/\s/g, ''))) return 'each';
  return 'each';
}

/**
 * Map CountUnit to our system's measurement unit
 */
function countUnitToMeasurementUnit(unit: CountUnit): string {
  switch (unit) {
    case 'cu_m': return 'm3';
    case 'sq_m': return 'm2';
    case 'm': return 'ml';
    case 'each': return 'ud';
  }
}

/**
 * Parse the Size field to extract dimensional information.
 * Handles patterns like:
 *   "45 mm x 195 mm - 4191 mm" → cross-section + length
 *   "200 mm x 200 mm - 2628 mm" → cross-section + length
 *   "80 mm x 160 mm" → cross-section only
 *   "200mm thick" → thickness only
 *   "925mm" → single dimension
 */
interface SizeDimensions {
  hasLength: boolean;
  lengthMm: number | null;    // The individual piece length in mm (from "- NNNmm" pattern)
  crossSection: string | null; // Cross-section description
  isThickness: boolean;
}

function parseSize(size: string): SizeDimensions {
  const result: SizeDimensions = {
    hasLength: false,
    lengthMm: null,
    crossSection: null,
    isThickness: false,
  };

  if (!size || !size.trim()) return result;

  const trimmed = size.trim();

  // Check for thickness pattern: "NNNmm thick"
  if (/^\d+\s*mm\s*thick$/i.test(trimmed)) {
    result.isThickness = true;
    return result;
  }

  // Check for cross-section + length: "dim x dim - length mm"
  // Pattern: number mm x number mm - number mm
  const crossLengthMatch = trimmed.match(
    /^(\d[\d\s]*)\s*mm\s*x\s*(\d[\d\s]*)\s*mm\s*[-–]\s*(\d[\d\s]*)\s*mm$/i
  );
  if (crossLengthMatch) {
    const lengthStr = crossLengthMatch[3].replace(/\s/g, '');
    result.hasLength = true;
    result.lengthMm = parseFloat(lengthStr);
    result.crossSection = `${crossLengthMatch[1].trim()}x${crossLengthMatch[2].trim()}mm`;
    return result;
  }

  // Check for cross-section only: "dim mm x dim mm" or "dimmmxdimmm"
  const crossMatch = trimmed.match(/^(\d[\d\s]*)\s*mm\s*x\s*(\d[\d\s]*)\s*mm$/i);
  if (crossMatch) {
    result.crossSection = `${crossMatch[1].trim()}x${crossMatch[2].trim()}mm`;
    return result;
  }

  // Compact cross-section: "76mmx25mm"
  const compactCross = trimmed.match(/^(\d+)mmx(\d+)mm$/i);
  if (compactCross) {
    result.crossSection = `${compactCross[1]}x${compactCross[2]}mm`;
    return result;
  }

  // 3D dimensions: "NNNmmxNNNmmxNNNmm"
  const threeDMatch = trimmed.match(/^(\d[\d\s]*)mm\s*x\s*(\d[\d\s]*)mm\s*x\s*(\d[\d\s]*)mm$/i);
  if (threeDMatch) {
    result.crossSection = `${threeDMatch[1].trim()}x${threeDMatch[2].trim()}x${threeDMatch[3].trim()}mm`;
    return result;
  }

  // Window/door sizes with spaces in numbers: "1 388mmx1 350mm"
  const windowMatch = trimmed.match(/^(\d[\d\s]*)mm\s*x\s*(\d[\d\s]*)mm$/i);
  if (windowMatch) {
    result.crossSection = `${windowMatch[1].replace(/\s/g, '')}x${windowMatch[2].replace(/\s/g, '')}mm`;
    return result;
  }

  return result;
}

/**
 * Apply intelligent conversion when Count unit is "each" but Size contains length data.
 * Example: Size "45 mm x 195 mm - 4191 mm", Count 44 → 44 * 4.191 = 184.40 ml
 */
function applyConversion(
  countRaw: number,
  countUnit: CountUnit,
  size: string,
): { value: number; unit: string; wasConverted: boolean; note: string } {
  // If unit is already m3, m2, or m → use value directly
  if (countUnit !== 'each') {
    const finalUnit = countUnitToMeasurementUnit(countUnit);
    return {
      value: countRaw,
      unit: finalUnit,
      wasConverted: false,
      note: `${countRaw} ${finalUnit} (directo)`,
    };
  }

  // Unit is "each" - analyze Size for conversion
  const dims = parseSize(size);

  if (dims.hasLength && dims.lengthMm && dims.lengthMm > 0) {
    // Cross-section + length pattern → convert to linear meters
    const totalMeters = countRaw * (dims.lengthMm / 1000);
    const roundedMeters = Math.round(totalMeters * 100) / 100;
    return {
      value: roundedMeters,
      unit: 'ml',
      wasConverted: true,
      note: `${countRaw} uds × ${dims.lengthMm}mm = ${roundedMeters} ml`,
    };
  }

  // No conversion needed - keep as units
  return {
    value: countRaw,
    unit: 'ud',
    wasConverted: false,
    note: `${countRaw} ud`,
  };
}

/**
 * Translate a classification name to Spanish
 */
function translateClassification(name: string): string {
  const key = name.toLowerCase().trim();
  return CLASSIFICATION_MAP[key] || name;
}

/**
 * Extract text content from a Cell element (first Data child)
 */
function getCellText(cell: Element): string {
  const data = cell.querySelector('Data');
  return data?.textContent?.trim() || '';
}

/**
 * Extract number from a Cell element
 */
function getCellNumber(cell: Element): number | null {
  const data = cell.querySelector('Data');
  if (!data) return null;
  const type = data.getAttribute('ss_Type') || data.getAttribute('Type');
  if (type !== 'Number') return null;
  const val = parseFloat(data.textContent || '');
  return isNaN(val) ? null : val;
}

/**
 * Parse the ChiefArchitect XML content
 */
/**
 * Strip XML namespace prefixes so querySelectorAll works on all elements.
 * Handles prefixed attributes (ss:ID → ss_ID) and element names (ss:Row → Row).
 */
function stripNamespaces(xml: string): string {
  // Remove namespace declarations: xmlns:ss="..." and xmlns="..."
  let cleaned = xml.replace(/\s+xmlns(?::\w+)?="[^"]*"/g, '');
  // Replace prefixed element tags: <ss:Row → <Row, </ss:Row → </Row
  cleaned = cleaned.replace(/<\/?(\w+):/g, (match, prefix) => match.replace(`${prefix}:`, ''));
  // Replace prefixed attributes: ss:ID → ss_ID (keep the value accessible)
  cleaned = cleaned.replace(/(\s)(\w+):(\w+)=/g, '$1$2_$3=');
  return cleaned;
}

export function parseChiefArchitectXML(xmlContent: string): ChiefArchitectParseResult {
  const result: ChiefArchitectParseResult = {
    measurements: [],
    classifications: [],
    errors: [],
    totalRows: 0,
  };

  try {
    // Strip namespace prefixes so querySelectorAll works reliably
    const cleanedXml = stripNamespaces(xmlContent);

    const parser = new DOMParser();
    const doc = parser.parseFromString(cleanedXml, 'text/xml');

    // Check for parse errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      result.errors.push('Error al parsear el XML: ' + parseError.textContent);
      return result;
    }

    // Extract styles to determine units
    const styleMap = new Map<string, StyleInfo>();
    const styles = doc.querySelectorAll('Style');
    styles.forEach(style => {
      const id = style.getAttribute('ss_ID') || style.getAttribute('ID') || '';
      const numberFormatEl = style.querySelector('NumberFormat');
      const numberFormat = numberFormatEl?.getAttribute('ss_Format') || numberFormatEl?.getAttribute('Format') || null;
      const fontEl = style.querySelector('Font');
      const isBold = fontEl?.getAttribute('ss_Bold') === '1' || fontEl?.getAttribute('Bold') === '1';

      styleMap.set(id, {
        id,
        numberFormat,
        isBold,
        unit: detectUnitFromFormat(numberFormat),
      });
    });

    // Process rows
    const rows = doc.querySelectorAll('Row');
    console.log(`[ChiefArchitect Parser] Found ${styles.length} styles, ${rows.length} rows`);
    let currentClassification = '';
    let currentClassificationEs = '';

    rows.forEach((row, rowIndex) => {
      const cells = row.querySelectorAll('Cell');
      if (cells.length === 0) return;

      // Get first cell
      const firstCell = cells[0];
      const firstCellStyle = firstCell.getAttribute('ss_StyleID') || firstCell.getAttribute('StyleID') || '';
      const firstCellText = getCellText(firstCell);
      const firstCellStyleInfo = styleMap.get(firstCellStyle);

      // Skip header row
      if (firstCellStyle === 'headercell') return;

      // Check for subtotal rows
      let isSubtotalRow = false;
      cells.forEach(cell => {
        if (getCellText(cell).toLowerCase().includes('subtotal')) {
          isSubtotalRow = true;
        }
      });
      if (isSubtotalRow) return;

      // Check if this is a category header row (bold style, only text in first cell)
      if (firstCellStyleInfo?.isBold && firstCellText && !getCellText(cells[1] || firstCell)) {
        // Verify it's a category row by checking if other cells are empty
        let hasOtherData = false;
        for (let i = 1; i < cells.length && i < 8; i++) {
          if (getCellText(cells[i])) {
            hasOtherData = true;
            break;
          }
        }
        if (!hasOtherData) {
          currentClassification = firstCellText;
          currentClassificationEs = translateClassification(firstCellText);
          if (!result.classifications.includes(currentClassificationEs)) {
            result.classifications.push(currentClassificationEs);
          }
          return;
        }
      }

      // Skip rows without an ID in the first cell
      if (!firstCellText || firstCellText === currentClassification) return;

      // This should be a data row - extract fields
      // Columns: 1:ID, 2:SubCat, 3:Floor, 4:Supplier, 5:Manufacturer, 6:Code, 
      //          7:Size, 8:Description, 9:Count, 10:Extra, ...18:AccountingCode
      const id = firstCellText;

      // Get cell by index (cells may not have all columns)
      const getCell = (idx: number): Element | null => {
        // Cells are 0-indexed in our array, but may have ss:Index attributes
        for (let i = 0; i < cells.length; i++) {
          const indexAttr = cells[i].getAttribute('ss_Index') || cells[i].getAttribute('Index');
          if (indexAttr && parseInt(indexAttr) === idx) {
            return cells[i];
          }
        }
        // If no ss:Index, use positional (idx-1 because XML columns are 1-based)
        return cells[idx - 1] || null;
      };

      const floorCell = getCell(3);
      const supplierCell = getCell(4);
      const sizeCell = getCell(7);
      const descriptionCell = getCell(8);
      const countCell = getCell(9);
      const accountingCodeCell = getCell(18);

      const description = descriptionCell ? getCellText(descriptionCell) : '';
      const size = sizeCell ? getCellText(sizeCell) : '';
      const countRaw = countCell ? getCellNumber(countCell) : null;
      const floorNum = floorCell ? getCellNumber(floorCell) : null;
      const floorText = floorCell ? getCellText(floorCell) : '';
      const floor = floorNum ?? (floorText || null);
      const supplier = supplierCell ? getCellText(supplierCell) : '';
      const accountingCode = accountingCodeCell ? getCellText(accountingCodeCell) : '';

      // Skip rows without a count value or description
      if (countRaw === null || !description) return;

      result.totalRows++;

      // Determine unit from the Count cell's style
      const countCellStyle = countCell?.getAttribute('ss_StyleID') || countCell?.getAttribute('StyleID') || '';
      const countStyleInfo = styleMap.get(countCellStyle);
      const countUnit: CountUnit = countStyleInfo?.unit || 'each';

      // Apply conversion logic
      const conversion = applyConversion(countRaw, countUnit, size);

      result.measurements.push({
        id,
        classification: currentClassification,
        classificationEs: currentClassificationEs || 'Sin clasificación',
        description,
        size,
        countRaw,
        countUnit,
        convertedValue: conversion.value,
        finalUnit: conversion.unit,
        wasConverted: conversion.wasConverted,
        conversionNote: conversion.note,
        floor,
        supplier,
        accountingCode,
      });
    });

  } catch (error) {
    result.errors.push(`Error inesperado: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}
