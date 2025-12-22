import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { FileDown, Printer, X } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/format-utils';
import { calcResourceSubtotal } from '@/lib/budget-pricing';
import { recalculateAllBudgetResources } from '@/lib/budget-utils';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface BudgetReportPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presupuesto: {
    id: string;
    nombre: string;
    codigo_correlativo: number;
    version: string;
    poblacion: string;
    provincia: string | null;
    portada_url?: string | null;
    portada_text_color?: string | null;
    portada_text_position?: string | null;
    portada_overlay_opacity?: number | null;
  };
}

interface Activity {
  id: string;
  name: string;
  code: string;
  description: string | null;
  measurement_unit: string;
  phase_id: string | null;
  measurement_id: string | null;
  start_date: string | null;
  duration_days: number | null;
  tolerance_days: number | null;
  end_date: string | null;
}

interface Phase {
  id: string;
  name: string;
  code: string | null;
  start_date: string | null;
  duration_days: number | null;
  estimated_end_date: string | null;
}

interface Resource {
  id: string;
  name: string;
  resource_type: string | null;
  unit: string | null;
  external_unit_cost: number | null;
  safety_margin_percent: number | null;
  sales_margin_percent: number | null;
  manual_units: number | null;
  related_units: number | null;
  activity_id: string | null;
}

interface Predesign {
  id: string;
  content: string;
  description: string | null;
  content_type: string;
  file_path: string | null;
  file_name: string | null;
  file_type: string | null;
}

interface Measurement {
  id: string;
  name: string;
  manual_units: number | null;
  measurement_unit: string | null;
}

interface MeasurementRelation {
  id: string;
  measurement_id: string;
  related_measurement_id: string;
}

interface BudgetSpace {
  id: string;
  name: string;
  space_type: string;
  level: string;
  m2_built: number | null;
  m2_livable: number | null;
  observations: string | null;
}

interface BudgetContactWithDetails {
  id: string;
  contact_id: string;
  contact_role: 'cliente' | 'proveedor';
  contact: {
    id: string;
    name: string;
    surname: string | null;
    email: string | null;
    city: string | null;
  } | null;
}

// Format for PDF
const formatPdfCurrency = (value: number): string => {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value) + ' €';
};

// Valid resource types
const VALID_RESOURCE_TYPES = ['Producto', 'Mano de obra', 'Alquiler', 'Servicio', 'Impuestos'];

export function BudgetReportPreview({ open, onOpenChange, presupuesto }: BudgetReportPreviewProps) {
  const { settings: companySettings } = useCompanySettings();
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [predesigns, setPredesigns] = useState<Predesign[]>([]);
  const [predesignUrls, setPredesignUrls] = useState<Map<string, string>>(new Map());
  const [filesCountMap, setFilesCountMap] = useState<Map<string, number>>(new Map());
  const [budgetContacts, setBudgetContacts] = useState<BudgetContactWithDetails[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [measurementRelations, setMeasurementRelations] = useState<MeasurementRelation[]>([]);
  const [spaces, setSpaces] = useState<BudgetSpace[]>([]);
  const [selectedSections, setSelectedSections] = useState<string[]>(['activities']);
  const [customNotes, setCustomNotes] = useState<string>('');
  const [onlyWithCost, setOnlyWithCost] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Derived data for clients and providers
  const clients = budgetContacts.filter(bc => bc.contact_role === 'cliente');
  const providers = budgetContacts.filter(bc => bc.contact_role === 'proveedor');

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, presupuesto.id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [activitiesRes, phasesRes, resourcesRes, filesCountRes, predesignsRes, budgetContactsRes, measurementsRes, measurementRelationsRes, spacesRes] = await Promise.all([
        supabase
          .from('budget_activities')
          .select('id, name, code, description, measurement_unit, phase_id, measurement_id, start_date, duration_days, tolerance_days, end_date')
          .eq('budget_id', presupuesto.id)
          .order('name'),
        supabase
          .from('budget_phases')
          .select('id, name, code, start_date, duration_days, estimated_end_date')
          .eq('budget_id', presupuesto.id)
          .order('code'),
        supabase
          .from('budget_activity_resources')
          .select('*')
          .eq('budget_id', presupuesto.id)
          .order('name'),
        supabase
          .from('budget_activity_files')
          .select('activity_id'),
        supabase
          .from('budget_predesigns')
          .select('id, content, description, content_type, file_path, file_name, file_type')
          .eq('budget_id', presupuesto.id)
          .order('content'),
        supabase
          .from('budget_contacts')
          .select('id, contact_id, contact_role')
          .eq('budget_id', presupuesto.id),
        supabase
          .from('budget_measurements')
          .select('id, name, manual_units, measurement_unit')
          .eq('budget_id', presupuesto.id)
          .order('name'),
        supabase
          .from('budget_measurement_relations')
          .select('id, measurement_id, related_measurement_id'),
        supabase
          .from('budget_spaces')
          .select('id, name, space_type, level, m2_built, m2_livable, observations')
          .eq('budget_id', presupuesto.id)
          .order('name'),
      ]);

      if (activitiesRes.error) throw activitiesRes.error;
      if (phasesRes.error) throw phasesRes.error;
      if (resourcesRes.error) throw resourcesRes.error;

      setActivities(activitiesRes.data || []);
      setPhases(phasesRes.data || []);
      setResources(resourcesRes.data || []);
      setPredesigns(predesignsRes.data || []);
      
      // Set measurements and filter relations to this budget
      const measurementsData = measurementsRes.data || [];
      setMeasurements(measurementsData);
      const measurementIds = measurementsData.map(m => m.id);
      const filteredRelations = (measurementRelationsRes.data || []).filter(
        r => measurementIds.includes(r.measurement_id)
      );
      setMeasurementRelations(filteredRelations);
      
      // Set spaces
      setSpaces(spacesRes.data || []);

      // Load budget contacts with contact details
      if (budgetContactsRes.data && budgetContactsRes.data.length > 0) {
        const contactIds = budgetContactsRes.data.map(bc => bc.contact_id);
        const { data: contactsData } = await supabase
          .from('crm_contacts')
          .select('id, name, surname, email, city')
          .in('id', contactIds);
        
        const enrichedContacts: BudgetContactWithDetails[] = budgetContactsRes.data.map(bc => ({
          ...bc,
          contact_role: bc.contact_role as 'cliente' | 'proveedor',
          contact: contactsData?.find(c => c.id === bc.contact_id) || null
        }));
        setBudgetContacts(enrichedContacts);
      } else {
        setBudgetContacts([]);
      }

      // Load signed URLs for predesigns
      const urlMap = new Map<string, string>();
      for (const predesign of (predesignsRes.data || [])) {
        if (predesign.file_path) {
          const { data } = await supabase.storage
            .from('budget-predesigns')
            .createSignedUrl(predesign.file_path, 3600);
          if (data?.signedUrl) {
            urlMap.set(predesign.id, data.signedUrl);
          }
        }
      }
      setPredesignUrls(urlMap);

      const filesMap = new Map<string, number>();
      (filesCountRes.data || []).forEach(f => {
        filesMap.set(f.activity_id, (filesMap.get(f.activity_id) || 0) + 1);
      });
      setFilesCountMap(filesMap);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar los datos del informe');
    } finally {
      setLoading(false);
    }
  };

  // Resource calculation helper
  const calculateFields = (resource: Resource) => {
    const subtotalSales = calcResourceSubtotal({
      externalUnitCost: resource.external_unit_cost,
      safetyPercent: resource.safety_margin_percent,
      salesPercent: resource.sales_margin_percent,
      manualUnits: resource.manual_units,
      relatedUnits: resource.related_units,
    });

    // Para el resto del informe solo necesitamos subtotal + uds calculadas
    const calculatedUnits = (resource.manual_units !== null && resource.manual_units !== undefined)
      ? (Number(resource.manual_units) || 0)
      : (Number(resource.related_units) || 0);

    // Coste de venta por unidad (para mostrar si hiciera falta)
    const salesCostUd = calculatedUnits > 0 ? subtotalSales / calculatedUnits : 0;

    return { salesCostUd, calculatedUnits, subtotalSales };
  };

  // Calculate activity resources subtotals
  const activityResourcesMap = new Map<string, number>();
  resources.forEach(r => {
    if (r.activity_id) {
      const fields = calculateFields(r);
      activityResourcesMap.set(r.activity_id, (activityResourcesMap.get(r.activity_id) || 0) + fields.subtotalSales);
    }
  });

  // Get phase info for activity
  const getPhaseInfo = (phaseId: string | null) => {
    if (!phaseId) return { code: '', name: '' };
    const phase = phases.find(p => p.id === phaseId);
    return { code: phase?.code || '', name: phase?.name || '' };
  };

  // Generate ActivityID
  const generateActivityId = (activity: Activity) => {
    const phaseInfo = getPhaseInfo(activity.phase_id);
    if (phaseInfo.code) {
      return `${phaseInfo.code} ${activity.code}.-${activity.name}`;
    }
    return `${activity.code}.-${activity.name}`;
  };

  // Calculate totals
  const totalResourcesSubtotal = resources.reduce((sum, r) => sum + calculateFields(r).subtotalSales, 0);

  // Group resources by type (filter to valid types only)
  const byType = resources.reduce((acc, r) => {
    const type = r.resource_type || 'Sin tipo';
    // Skip invalid types like "Herramienta"
    if (type !== 'Sin tipo' && !VALID_RESOURCE_TYPES.includes(type)) return acc;
    const fields = calculateFields(r);
    if (!acc[type]) acc[type] = { count: 0, total: 0 };
    acc[type].count++;
    acc[type].total += fields.subtotalSales;
    return acc;
  }, {} as Record<string, { count: number; total: number }>);

  const presupuestoId = `${presupuesto.nombre} (${presupuesto.codigo_correlativo}/${presupuesto.version}): ${presupuesto.poblacion}`;

  // Generate report type name based on selected sections
  const getReportTypeName = () => {
    const names: string[] = [];
    if (selectedSections.includes('cuanto-cuando')) names.push('CUÁNTO cuesta + CUÁNDO hacer');
    if (selectedSections.includes('predesigns')) names.push('Ante-proyecto');
    if (selectedSections.includes('activities')) names.push('Actividades');
    if (selectedSections.includes('resources')) names.push('Recursos');
    if (selectedSections.includes('time-phases')) names.push('Gestión Tiempo Fases');
    if (selectedSections.includes('time-activities')) names.push('Gestión Tiempo Actividades');
    if (selectedSections.includes('measurements')) names.push('Mediciones');
    if (selectedSections.includes('spaces-alphabetical')) names.push('Espacios Alfabético');
    if (selectedSections.includes('spaces-grouped')) names.push('Espacios por Nivel/Tipo');
    return names.length > 0 ? names.join(' + ') : 'Resumen General';
  };

  // Group predesigns by content type
  const getGroupedPredesigns = () => {
    const groups: Record<string, Predesign[]> = {};
    predesigns.forEach(item => {
      const type = item.content_type || 'Sin tipo';
      if (!groups[type]) groups[type] = [];
      groups[type].push(item);
    });
    // Sort items within each group alphabetically
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => a.content.localeCompare(b.content, 'es'));
    });
    return groups;
  };

  // Measurements helper functions
  const getRelatedUnits = (measurementId: string): number => {
    const relatedIds = measurementRelations
      .filter(r => r.measurement_id === measurementId)
      .map(r => r.related_measurement_id);
    
    return relatedIds.reduce((sum, relId) => {
      const relMeasurement = measurements.find(m => m.id === relId);
      return sum + (relMeasurement?.manual_units || 0);
    }, 0);
  };

  const getCalculatedUnits = (measurement: Measurement): number => {
    const relatedUnits = getRelatedUnits(measurement.id);
    if (relatedUnits > 0) {
      return relatedUnits;
    }
    return measurement.manual_units || 0;
  };

  const getRelatedActivitiesForMeasurement = (measurementId: string) => {
    return activities.filter(a => a.measurement_id === measurementId);
  };

  const generateMeasurementId = (measurement: Measurement): string => {
    const udsCalculo = getCalculatedUnits(measurement);
    const unit = measurement.measurement_unit || 'ud';
    const relatedActivities = getRelatedActivitiesForMeasurement(measurement.id);
    
    if (relatedActivities.length === 0) {
      return `${formatNumber(udsCalculo)}/${unit}: Sin actividad`;
    }
    
    const activityNames = relatedActivities.map(a => {
      const phase = phases.find(p => p.id === a.phase_id);
      const phaseCode = phase?.code || '';
      return `${phaseCode} ${a.code}.-${a.name}`;
    }).join(', ');
    
    return `${formatNumber(udsCalculo)}/${unit}: ${activityNames}`;
  };

  // Spaces helper functions
  const LEVELS_ORDER = ['Sótano', 'Planta Baja', 'Nivel 1', 'Nivel 2', 'Nivel 3', 'Nivel 4', 'Cubierta', 'Ático'];
  
  const getM2Construction = (space: BudgetSpace): number => {
    const built = space.m2_built || 0;
    const livable = space.m2_livable || 0;
    return built - livable;
  };

  const spacesTotals = spaces.reduce(
    (acc, space) => ({
      m2_built: acc.m2_built + (space.m2_built || 0),
      m2_livable: acc.m2_livable + (space.m2_livable || 0),
      m2_construction: acc.m2_construction + getM2Construction(space)
    }),
    { m2_built: 0, m2_livable: 0, m2_construction: 0 }
  );

  const getSpacesByLevelAndType = () => {
    const grouped: Record<string, Record<string, BudgetSpace[]>> = {};
    
    spaces.forEach(space => {
      if (!grouped[space.level]) {
        grouped[space.level] = {};
      }
      if (!grouped[space.level][space.space_type]) {
        grouped[space.level][space.space_type] = [];
      }
      grouped[space.level][space.space_type].push(space);
    });
    
    // Sort by LEVELS order
    const sortedGrouped: Record<string, Record<string, BudgetSpace[]>> = {};
    LEVELS_ORDER.forEach(level => {
      if (grouped[level]) {
        sortedGrouped[level] = {};
        Object.keys(grouped[level]).sort().forEach(type => {
          sortedGrouped[level][type] = grouped[level][type].sort((a, b) => a.name.localeCompare(b.name));
        });
      }
    });
    
    // Add any custom levels not in the predefined list
    Object.keys(grouped).forEach(level => {
      if (!sortedGrouped[level]) {
        sortedGrouped[level] = {};
        Object.keys(grouped[level]).sort().forEach(type => {
          sortedGrouped[level][type] = grouped[level][type].sort((a, b) => a.name.localeCompare(b.name));
        });
      }
    });
    
    return sortedGrouped;
  };

  const getLevelTotals = (levelData: Record<string, BudgetSpace[]>) => {
    const allSpaces = Object.values(levelData).flat();
    return allSpaces.reduce(
      (acc, space) => ({
        m2_built: acc.m2_built + (space.m2_built || 0),
        m2_livable: acc.m2_livable + (space.m2_livable || 0),
        m2_construction: acc.m2_construction + getM2Construction(space)
      }),
      { m2_built: 0, m2_livable: 0, m2_construction: 0 }
    );
  };

  // Filter functions for onlyWithCost
  const getFilteredActivities = () => {
    if (!onlyWithCost) return activities;
    return activities.filter(a => (activityResourcesMap.get(a.id) || 0) > 0);
  };

  const getFilteredResources = () => {
    if (!onlyWithCost) return resources;
    return resources.filter(r => calculateFields(r).subtotalSales > 0);
  };

  const getFilteredPhases = () => {
    if (!onlyWithCost) return phases;
    const filteredActivities = getFilteredActivities();
    const phaseIdsWithCost = new Set(filteredActivities.map(a => a.phase_id).filter(Boolean));
    return phases.filter(p => phaseIdsWithCost.has(p.id));
  };

  const handlePrint = async () => {
    try {
      toast.message('Recalculando presupuesto…');
      const result = await recalculateAllBudgetResources(presupuesto.id);
      if (result.errors > 0) {
        toast.warning('Recalculado con avisos. Revisa los recursos/mediciones.');
      }
    } catch (error) {
      console.error('Error recalculando antes de imprimir:', error);
      toast.error('No se pudo recalcular antes de imprimir');
      return;
    }

    window.print();
  };

  const exportToPDF = async () => {
    setIsExporting(true);
    try {
      toast.message('Recalculando presupuesto…');
      const result = await recalculateAllBudgetResources(presupuesto.id);
      if (result.errors > 0) {
        toast.warning('Recalculado con avisos. Revisa los recursos/mediciones.');
      }

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Company info (without address per user request)
      const companyName = companySettings.name || 'Mi Empresa';
      const companyEmail = companySettings.email || '';
      const companyPhone = companySettings.phone || '';
      const companyWeb = companySettings.website || '';
      const companyLogo = companySettings.logo_url || '';
      const companyInitials = companyName.substring(0, 2).toUpperCase();

      // Budget cover image
      const portadaUrl = presupuesto.portada_url || '';

      // Load company logo if available
      let logoImgData: string | null = null;
      if (companyLogo) {
        try {
          const response = await fetch(companyLogo);
          const blob = await response.blob();
          logoImgData = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } catch (err) {
          console.error('Error loading company logo:', err);
        }
      }

      // Load portada image if available
      let portadaImgData: string | null = null;
      if (portadaUrl) {
        try {
          const response = await fetch(portadaUrl);
          const blob = await response.blob();
          portadaImgData = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } catch (err) {
          console.error('Error loading portada:', err);
        }
      }

      // Helper function for header with logo (used on all pages)
      const drawHeader = (showLine = true) => {
        // Reset all drawing states first
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.setDrawColor(0, 0, 0);
        
        // Header starts at y=12 with proper margins to prevent cutting
        const headerY = 12;
        const logoSize = 12; // Slightly smaller logo to fit better
        
        // Draw logo or initials
        if (logoImgData) {
          try {
            doc.addImage(logoImgData, 'JPEG', 14, headerY, logoSize, logoSize);
          } catch (e) {
            console.error('Error drawing logo:', e);
            // Fallback to initials
            doc.setFillColor(37, 99, 235);
            doc.roundedRect(14, headerY, logoSize, logoSize, 2, 2, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.text(companyInitials, 14 + logoSize / 2, headerY + logoSize / 2 + 2, { align: 'center' });
          }
        } else {
          doc.setFillColor(37, 99, 235);
          doc.roundedRect(14, headerY, logoSize, logoSize, 2, 2, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.text(companyInitials, 14 + logoSize / 2, headerY + logoSize / 2 + 2, { align: 'center' });
        }

        // Company name - positioned next to logo with proper vertical alignment
        const textX = 14 + logoSize + 4;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text(companyName, textX, headerY + 5);

        // Contact info - below company name
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        const contactLine = [companyEmail, companyPhone, companyWeb].filter(Boolean).join('  |  ');
        if (contactLine) {
          doc.text(contactLine, textX, headerY + 10);
        }

        // Reset colors
        doc.setTextColor(0, 0, 0);

        if (showLine) {
          doc.setDrawColor(200, 200, 200);
          doc.line(14, headerY + logoSize + 4, pageWidth - 14, headerY + logoSize + 4);
        }
      };

      // PAGE 1: Cover Page with Header, Cover Image, Title, and Index
      // Draw header at top
      drawHeader(true);
      
      // Start content after header (header ends at y=28)
      let yPos = 30;
      
      if (portadaImgData) {
        // Get style settings
        const textColor = presupuesto.portada_text_color || '#FFFFFF';
        const overlayOpacity = presupuesto.portada_overlay_opacity ?? 0.4;
        
        // Convert hex color to RGB
        const hexToRgb = (hex: string) => {
          const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
          return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
          } : { r: 255, g: 255, b: 255 };
        };
        const rgb = hexToRgb(textColor);
        
        // Load image to get original dimensions for proper aspect ratio
        const getImageDimensions = (src: string): Promise<{ width: number; height: number }> => {
          return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
            img.onerror = () => resolve({ width: pageWidth, height: 100 });
            img.src = src;
          });
        };
        
        const imgDimensions = await getImageDimensions(portadaImgData);
        const imgAspectRatio = imgDimensions.width / imgDimensions.height;
        
        // Cover image area (smaller - about 1/3 of page height)
        const coverHeight = 60; // mm - smaller to fit index on same page
        const coverWidth = pageWidth - 28; // margins
        const coverX = 14;
        const coverY = yPos;
        
        // Calculate image dimensions to cover the area while maintaining aspect ratio
        let imgWidth = coverWidth;
        let imgHeight = coverWidth / imgAspectRatio;
        let imgX = coverX;
        let imgY = coverY;
        
        if (imgHeight < coverHeight) {
          imgHeight = coverHeight;
          imgWidth = coverHeight * imgAspectRatio;
          imgX = coverX + (coverWidth - imgWidth) / 2;
        } else {
          imgY = coverY + (coverHeight - imgHeight) / 2;
        }
        
        // Clip to cover area
        doc.saveGraphicsState();
        doc.rect(coverX, coverY, coverWidth, coverHeight, 'S');
        doc.addImage(portadaImgData, 'JPEG', imgX, imgY, imgWidth, imgHeight, undefined, 'FAST');
        
        // Semi-transparent overlay
        doc.setFillColor(0, 0, 0);
        doc.setGState(new (doc as any).GState({ opacity: overlayOpacity }));
        doc.rect(coverX, coverY, coverWidth, coverHeight, 'F');
        doc.setGState(new (doc as any).GState({ opacity: 1 }));
        
        // Text on cover image
        doc.setTextColor(rgb.r, rgb.g, rgb.b);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('INFORME DE PRESUPUESTO', pageWidth / 2, coverY + coverHeight / 2 - 5, { align: 'center' });
        
        doc.setFontSize(14);
        doc.text(presupuesto.nombre, pageWidth / 2, coverY + coverHeight / 2 + 5, { align: 'center' });
        
        doc.restoreGraphicsState();
        yPos = coverY + coverHeight + 8;
      }
      
      // Report title info below cover
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('INFORME DE PRESUPUESTO', pageWidth / 2, yPos, { align: 'center' });
      
      yPos += 6;
      // Report type name
      doc.setFontSize(10);
      doc.setTextColor(37, 99, 235);
      doc.text(getReportTypeName(), pageWidth / 2, yPos, { align: 'center' });
      
      yPos += 6;
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(presupuesto.nombre, pageWidth / 2, yPos, { align: 'center' });
      
      yPos += 5;
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(9);
      doc.text(presupuestoId, pageWidth / 2, yPos, { align: 'center' });
      
      yPos += 5;
      doc.setFontSize(8);
      doc.text(`Fecha de generación: ${format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es })}`, pageWidth / 2, yPos, { align: 'center' });
      doc.setTextColor(0);

      // Index section on the same first page
      yPos += 10;
      
      // Index box background
      doc.setFillColor(248, 250, 252);
      const indexHeight = 50;
      doc.roundedRect(14, yPos, pageWidth - 28, indexHeight, 3, 3, 'F');
      
      // Index header with icon-like element
      doc.setFillColor(37, 99, 235);
      doc.roundedRect(18, yPos + 4, 3, 12, 1, 1, 'F');
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(37, 99, 235);
      doc.text('ÍNDICE DEL DOCUMENTO', 26, yPos + 12);
      doc.setTextColor(0);

      let indexY = yPos + 20;
      
      // Build index items (all on page 2)
      const indexItems: { title: string; page: number }[] = [
        { title: 'Resumen General', page: 2 },
      ];

      if (selectedSections.includes('cuanto-cuando')) {
        indexItems.push({ title: 'CUÁNTO cuesta + CUÁNDO hacer', page: 3 });
      }
      if (selectedSections.includes('predesigns')) {
        indexItems.push({ title: 'Ante-proyecto', page: 3 });
      }
      if (selectedSections.includes('activities')) {
        indexItems.push({ title: 'Resumen de Actividades por Fase', page: 3 });
      }
      if (selectedSections.includes('resources')) {
        indexItems.push({ title: 'Desglose de Recursos por Fase y Actividad', page: 3 });
      }
      if (selectedSections.includes('time-phases')) {
        indexItems.push({ title: 'Gestión del Tiempo por Fases', page: 3 });
      }
      if (selectedSections.includes('time-activities')) {
        indexItems.push({ title: 'Gestión del Tiempo por Actividades', page: 3 });
      }

      indexItems.forEach((item, idx) => {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        
        // Draw bullet
        doc.setFillColor(37, 99, 235);
        doc.circle(22, indexY - 1, 1.2, 'F');
        
        // Draw title
        doc.setTextColor(30, 41, 59);
        doc.text(`${idx + 1}. ${item.title}`, 28, indexY);
        
        // Page number
        doc.setTextColor(100, 116, 139);
        doc.text(`Pág. ${item.page}`, pageWidth - 22, indexY, { align: 'right' });
        
        indexY += 6;
      });

      // PAGE 2: General Summary
      doc.addPage();
      yPos = 20;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(37, 99, 235);
      doc.text('1. RESUMEN GENERAL', 14, yPos);
      doc.setTextColor(0);

      yPos += 12;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('1.1. Estadísticas del presupuesto', 14, yPos);
      doc.setFont('helvetica', 'normal');

      yPos += 10;
      doc.setFontSize(10);

      const summaryData = [
        ['Total de actividades:', activities.length.toString()],
        ['Total de fases:', phases.length.toString()],
        ['Total de recursos:', resources.length.toString()],
      ];

      summaryData.forEach(([label, value]) => {
        doc.text(label, 14, yPos);
        doc.text(value, 80, yPos);
        yPos += 6;
      });

      // Client and Provider Section
      if (clients.length > 0 || providers.length > 0) {
        yPos += 10;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('1.2. Cliente y Proveedor', 14, yPos);
        doc.setFont('helvetica', 'normal');
        yPos += 8;

        // Clients
        if (clients.length > 0) {
          doc.setFillColor(220, 252, 231); // green-100
          const clientBoxHeight = 8 + clients.length * 12;
          doc.roundedRect(14, yPos - 4, (pageWidth - 32) / 2, clientBoxHeight, 2, 2, 'F');
          
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(22, 101, 52); // green-800
          doc.text('CLIENTE', 18, yPos + 2);
          
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(30, 41, 59);
          doc.setFontSize(9);
          
          let clientY = yPos + 10;
          clients.forEach(c => {
            if (c.contact) {
              const clientName = `${c.contact.name} ${c.contact.surname || ''}`.trim();
              doc.setFont('helvetica', 'bold');
              doc.text(clientName, 18, clientY);
              doc.setFont('helvetica', 'normal');
              const clientDetails = [c.contact.email, c.contact.city].filter(Boolean).join(' | ');
              if (clientDetails) {
                doc.setFontSize(8);
                doc.setTextColor(100, 116, 139);
                doc.text(clientDetails, 18, clientY + 4);
                doc.setTextColor(30, 41, 59);
                doc.setFontSize(9);
              }
              clientY += 12;
            }
          });
          
          yPos += clientBoxHeight + 4;
        }

        // Providers
        if (providers.length > 0) {
          const providerStartX = clients.length > 0 ? 14 + (pageWidth - 32) / 2 + 4 : 14;
          const providerWidth = clients.length > 0 ? (pageWidth - 32) / 2 : pageWidth - 28;
          const providerY = clients.length > 0 ? yPos - (8 + clients.length * 12) - 4 : yPos;
          
          doc.setFillColor(254, 249, 195); // yellow-100
          const providerBoxHeight = 8 + providers.length * 12;
          doc.roundedRect(providerStartX, providerY - 4, providerWidth, providerBoxHeight, 2, 2, 'F');
          
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(133, 77, 14); // yellow-800
          doc.text('PROVEEDOR', providerStartX + 4, providerY + 2);
          
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(30, 41, 59);
          doc.setFontSize(9);
          
          let provY = providerY + 10;
          providers.forEach(p => {
            if (p.contact) {
              const providerName = `${p.contact.name} ${p.contact.surname || ''}`.trim();
              doc.setFont('helvetica', 'bold');
              doc.text(providerName, providerStartX + 4, provY);
              doc.setFont('helvetica', 'normal');
              const providerDetails = [p.contact.email, p.contact.city].filter(Boolean).join(' | ');
              if (providerDetails) {
                doc.setFontSize(8);
                doc.setTextColor(100, 116, 139);
                doc.text(providerDetails, providerStartX + 4, provY + 4);
                doc.setTextColor(30, 41, 59);
                doc.setFontSize(9);
              }
              provY += 12;
            }
          });
          
          if (clients.length === 0) {
            yPos += providerBoxHeight + 4;
          }
        }
        
        yPos += 4;
      }

      // Custom notes section
      if (customNotes.trim()) {
        yPos += 8;
        doc.setFillColor(248, 250, 252);
        
        // Calculate text height
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const splitNotes = doc.splitTextToSize(customNotes, pageWidth - 40);
        const notesHeight = splitNotes.length * 5 + 16;
        
        doc.roundedRect(14, yPos - 4, pageWidth - 28, notesHeight, 2, 2, 'F');
        
        // Left accent bar
        doc.setFillColor(100, 116, 139);
        doc.roundedRect(14, yPos - 4, 3, notesHeight, 1, 1, 'F');
        
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('OBSERVACIONES:', 22, yPos + 4);
        
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(10);
        doc.text(splitNotes, 22, yPos + 12);
        
        yPos += notesHeight + 4;
      }

      // Check if ONLY Ante-proyecto is selected (no other sections)
      const isOnlyAnteproyecto = selectedSections.length === 1 && selectedSections.includes('predesigns');
      
      // Only show Total Presupuesto and Desglose if NOT only Ante-proyecto
      if (!isOnlyAnteproyecto) {
        yPos += 4;
        doc.setFillColor(34, 197, 94);
        doc.roundedRect(14, yPos - 4, pageWidth - 28, 10, 2, 2, 'F');
        doc.setTextColor(255);
        doc.setFont('helvetica', 'bold');
        doc.text('TOTAL PRESUPUESTO:', 18, yPos + 3);
        doc.text(formatPdfCurrency(totalResourcesSubtotal), pageWidth - 18, yPos + 3, { align: 'right' });
        doc.setTextColor(0);
        doc.setFont('helvetica', 'normal');

        yPos += 20;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('1.3. Desglose por Tipo de Recurso', 14, yPos);
        doc.setFont('helvetica', 'normal');

        yPos += 8;
        const typeData = Object.entries(byType).map(([type, data]) => [
          type,
          data.count.toString(),
          formatPdfCurrency(data.total)
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['Tipo', 'Cantidad', 'Total']],
          body: typeData,
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246] },
          margin: { left: 14, right: 14 },
          columnStyles: {
            0: { cellWidth: 80 },
            1: { cellWidth: 30, halign: 'right' },
            2: { cellWidth: 50, halign: 'right' },
          },
        });
      }

      // Section: CUÁNTO cuesta + CUÁNDO hacer (only if selected)
      if (selectedSections.includes('cuanto-cuando')) {
        doc.addPage();
        yPos = 20;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text('2. ¿CUÁNTO CUESTA? PRESUPUESTO', 14, yPos);
        doc.setTextColor(0);

        yPos += 10;

        // Draw portada image if available
        if (portadaImgData) {
          const coverHeight = 50;
          const coverWidth = pageWidth - 28;
          const coverX = 14;
          const coverY = yPos;
          
          try {
            doc.addImage(portadaImgData, 'JPEG', coverX, coverY, coverWidth, coverHeight, undefined, 'FAST');
            
            // Semi-transparent overlay
            doc.setFillColor(0, 0, 0);
            doc.setGState(new (doc as any).GState({ opacity: presupuesto.portada_overlay_opacity ?? 0.4 }));
            doc.rect(coverX, coverY, coverWidth, coverHeight, 'F');
            doc.setGState(new (doc as any).GState({ opacity: 1 }));
            
            // Text on cover image
            const textColor = presupuesto.portada_text_color || '#FFFFFF';
            const hexToRgb = (hex: string) => {
              const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
              return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
              } : { r: 255, g: 255, b: 255 };
            };
            const rgb = hexToRgb(textColor);
            doc.setTextColor(rgb.r, rgb.g, rgb.b);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text(presupuesto.nombre, pageWidth / 2, coverY + coverHeight / 2 - 2, { align: 'center' });
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text(`${presupuesto.poblacion}${presupuesto.provincia ? `, ${presupuesto.provincia}` : ''}`, pageWidth / 2, coverY + coverHeight / 2 + 5, { align: 'center' });
            
            doc.setTextColor(0, 0, 0);
            yPos = coverY + coverHeight + 10;
          } catch (e) {
            console.error('Error drawing portada in CUÁNTO:', e);
          }
        }

        // Budget info
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Datos del Presupuesto', 14, yPos);
        doc.setFont('helvetica', 'normal');
        yPos += 6;
        
        const budgetInfoData = [
          ['Nombre:', presupuesto.nombre],
          ['Código:', presupuesto.codigo_correlativo.toString()],
          ['Versión:', presupuesto.version],
          ['Ubicación:', `${presupuesto.poblacion}${presupuesto.provincia ? `, ${presupuesto.provincia}` : ''}`],
        ];
        
        budgetInfoData.forEach(([label, value]) => {
          doc.setFontSize(9);
          doc.text(label, 14, yPos);
          doc.text(value, 50, yPos);
          yPos += 5;
        });

        yPos += 8;

        // Cost summary
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Resumen de Costes', 14, yPos);
        yPos += 8;

        // Calculate values
        const costPerM2Built = spacesTotals.m2_built > 0 ? totalResourcesSubtotal / spacesTotals.m2_built : 0;
        const costPerM2Livable = spacesTotals.m2_livable > 0 ? totalResourcesSubtotal / spacesTotals.m2_livable : 0;

        const costSummaryData = [
          ['Subtotal Recursos (PVP):', formatPdfCurrency(totalResourcesSubtotal)],
          ['m² Construidos:', `${formatNumber(spacesTotals.m2_built)} m²`],
          ['m² Habitables:', `${formatNumber(spacesTotals.m2_livable)} m²`],
          ['€ Coste por m² Construido:', formatPdfCurrency(costPerM2Built)],
          ['€ Coste por m² Habitable:', formatPdfCurrency(costPerM2Livable)],
        ];

        autoTable(doc, {
          startY: yPos,
          body: costSummaryData,
          theme: 'plain',
          margin: { left: 14, right: 14 },
          styles: { fontSize: 10 },
          columnStyles: {
            0: { cellWidth: 60, fontStyle: 'bold' },
            1: { cellWidth: 60, halign: 'right' },
          },
        });

        yPos = (doc as any).lastAutoTable.finalY + 15;

        // CUÁNDO hacer - Phases section
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text('¿CUÁNDO HACER? FASES', 14, yPos);
        doc.setTextColor(0);
        yPos += 8;

        // Phases table sorted by code alphabetically
        const sortedPhasesForPdf = [...phases].sort((a, b) => (a.code || '').localeCompare(b.code || ''));
        
        // Helper to calculate subtotal for a phase
        const getPhaseSubtotal = (phaseId: string): number => {
          const phaseActivities = activities.filter(a => a.phase_id === phaseId);
          const activityIds = phaseActivities.map(a => a.id);
          const phaseResources = resources.filter(r => r.activity_id && activityIds.includes(r.activity_id));
          return phaseResources.reduce((sum, r) => {
            return sum + calcResourceSubtotal({
              externalUnitCost: r.external_unit_cost,
              safetyPercent: r.safety_margin_percent,
              salesPercent: r.sales_margin_percent,
              manualUnits: r.manual_units,
              relatedUnits: r.related_units,
            });
          }, 0);
        };
        
        const phasesData = sortedPhasesForPdf.map(phase => {
          const formatDate = (date: string | null) => {
            if (!date) return '-';
            try {
              return format(new Date(date), 'dd/MM/yyyy');
            } catch {
              return '-';
            }
          };
          
          const phaseSubtotal = getPhaseSubtotal(phase.id);
          
          return [
            phase.code || '-',
            phase.name,
            formatDate(phase.start_date),
            phase.duration_days ? `${phase.duration_days} días` : '-',
            formatDate(phase.estimated_end_date),
            formatPdfCurrency(phaseSubtotal)
          ];
        });

        autoTable(doc, {
          startY: yPos,
          head: [['FaseID', 'Nombre', 'Fecha Inicio', 'Duración', 'Fecha Fin', '€SubTotal']],
          body: phasesData,
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246] },
          margin: { left: 14, right: 14 },
          styles: { fontSize: 9 },
          columnStyles: {
            0: { cellWidth: 22 },
            1: { cellWidth: 50 },
            2: { cellWidth: 25, halign: 'center' },
            3: { cellWidth: 24, halign: 'center' },
            4: { cellWidth: 25, halign: 'center' },
            5: { cellWidth: 28, halign: 'right' },
          },
        });
      }

      // Section 2: Activities Summary (only if selected)
      if (selectedSections.includes('activities')) {
        doc.addPage();
        yPos = 20;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text('2. RESUMEN DE ACTIVIDADES POR FASE', 14, yPos);
        doc.setTextColor(0);

        yPos += 10;

        const activitiesTableData: any[] = [];
        
        // Apply filter based on onlyWithCost for activities, but always show all phases
        const filteredActivitiesForPdf = getFilteredActivities();
        // Always use all phases to show phases with SubTotal = 0
        const allPhasesForPdf = [...phases].sort((a, b) => (a.code || '').localeCompare(b.code || ''));
        
        // Calculate filtered total
        const filteredActivitiesTotal = filteredActivitiesForPdf.reduce((sum, a) => sum + (activityResourcesMap.get(a.id) || 0), 0);

        const unassigned = filteredActivitiesForPdf.filter(a => !a.phase_id);
        if (unassigned.length > 0) {
          const unassignedSubtotal = unassigned.reduce((sum, a) => sum + (activityResourcesMap.get(a.id) || 0), 0);
          activitiesTableData.push([
            { content: 'Sin fase asignada', colSpan: 3, styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } },
            { content: formatPdfCurrency(unassignedSubtotal), styles: { fillColor: [240, 240, 240], fontStyle: 'bold', halign: 'right' } }
          ]);
          unassigned.forEach(activity => {
            activitiesTableData.push([
              `  ${generateActivityId(activity)}`,
              activity.measurement_unit,
              (filesCountMap.get(activity.id) || 0).toString(),
              formatPdfCurrency(activityResourcesMap.get(activity.id) || 0)
            ]);
          });
        }

        allPhasesForPdf.forEach(phase => {
          const phaseActivities = activities.filter(a => a.phase_id === phase.id);

          const phaseSubtotal = phaseActivities.reduce((sum, a) => sum + (activityResourcesMap.get(a.id) || 0), 0);

          activitiesTableData.push([
            { content: `${phase.code || ''} ${phase.name}`, colSpan: 3, styles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' } },
            { content: formatPdfCurrency(phaseSubtotal), styles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } }
          ]);

          phaseActivities.sort((a, b) => a.name.localeCompare(b.name)).forEach(activity => {
            activitiesTableData.push([
              `  ${generateActivityId(activity)}`,
              activity.measurement_unit,
              (filesCountMap.get(activity.id) || 0).toString(),
              formatPdfCurrency(activityResourcesMap.get(activity.id) || 0)
            ]);
          });
        });

        activitiesTableData.push([
          { content: 'TOTAL ACTIVIDADES', colSpan: 3, styles: { fillColor: [34, 197, 94], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } },
          { content: formatPdfCurrency(filteredActivitiesTotal), styles: { fillColor: [34, 197, 94], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } }
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['ActividadID', 'Unidad', 'Archivos', '€SubTotal']],
          body: activitiesTableData,
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246] },
          margin: { left: 14, right: 14 },
          styles: { fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 90 },
            1: { cellWidth: 20 },
            2: { cellWidth: 20, halign: 'center' },
            3: { cellWidth: 40, halign: 'right' },
          },
        });
      }

      // Section 3: Resources Detail (only if selected)
      if (selectedSections.includes('resources')) {
        doc.addPage();
        yPos = 20;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text('2. DESGLOSE DE RECURSOS POR FASE Y ACTIVIDAD', 14, yPos);
        doc.setTextColor(0);

        yPos += 10;

        const resourcesTableData: any[] = [];
        
        // Apply filter based on onlyWithCost
        const filteredResourcesForPdf = getFilteredResources();
        const filteredActivitiesForResources = getFilteredActivities();
        const filteredPhasesForResources = getFilteredPhases();
        
        // Calculate filtered total
        const filteredResourcesTotal = filteredResourcesForPdf.reduce((sum, r) => sum + calculateFields(r).subtotalSales, 0);

        const unassignedResources = filteredResourcesForPdf.filter(r => !r.activity_id);
        if (unassignedResources.length > 0) {
          const unassignedTotal = unassignedResources.reduce((sum, r) => sum + calculateFields(r).subtotalSales, 0);
          resourcesTableData.push([
            { content: 'Sin actividad asignada', colSpan: 5, styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } },
            { content: formatPdfCurrency(unassignedTotal), styles: { fillColor: [240, 240, 240], fontStyle: 'bold', halign: 'right' } }
          ]);
          unassignedResources.forEach(resource => {
            const fields = calculateFields(resource);
            resourcesTableData.push([
              `  ${resource.name}`,
              resource.resource_type || '-',
              resource.unit || '-',
              formatPdfCurrency(fields.salesCostUd),
              formatNumber(fields.calculatedUnits),
              formatPdfCurrency(fields.subtotalSales)
            ]);
          });
        }

        filteredPhasesForResources.forEach(phase => {
          const phaseActivities = filteredActivitiesForResources.filter(a => a.phase_id === phase.id);
          const phaseResources = filteredResourcesForPdf.filter(r => {
            const activity = activities.find(a => a.id === r.activity_id);
            return activity?.phase_id === phase.id;
          });

          if (phaseResources.length === 0) return;

          const phaseTotal = phaseResources.reduce((sum, r) => sum + calculateFields(r).subtotalSales, 0);

          resourcesTableData.push([
            { content: `${phase.code || ''} ${phase.name}`, colSpan: 5, styles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' } },
            { content: formatPdfCurrency(phaseTotal), styles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } }
          ]);

          phaseActivities.forEach(activity => {
            const activityResources = filteredResourcesForPdf.filter(r => r.activity_id === activity.id);
            if (activityResources.length === 0) return;

            const activityTotal = activityResources.reduce((sum, r) => sum + calculateFields(r).subtotalSales, 0);

            resourcesTableData.push([
              { content: `  ${activity.code}.-${activity.name}`, colSpan: 5, styles: { fillColor: [219, 234, 254], fontStyle: 'italic' } },
              { content: formatPdfCurrency(activityTotal), styles: { fillColor: [219, 234, 254], fontStyle: 'italic', halign: 'right' } }
            ]);

            activityResources.sort((a, b) => a.name.localeCompare(b.name)).forEach(resource => {
              const fields = calculateFields(resource);
              resourcesTableData.push([
                `    ${resource.name}`,
                resource.resource_type || '-',
                resource.unit || '-',
                formatPdfCurrency(fields.salesCostUd),
                formatNumber(fields.calculatedUnits),
                formatPdfCurrency(fields.subtotalSales)
              ]);
            });
          });
        });

        const activitiesWithoutPhase = filteredActivitiesForResources.filter(a => !a.phase_id);
        activitiesWithoutPhase.forEach(activity => {
          const activityResources = filteredResourcesForPdf.filter(r => r.activity_id === activity.id);
          if (activityResources.length === 0) return;

          const activityTotal = activityResources.reduce((sum, r) => sum + calculateFields(r).subtotalSales, 0);

          resourcesTableData.push([
            { content: `${activity.code}.-${activity.name} (sin fase)`, colSpan: 5, styles: { fillColor: [254, 243, 199], fontStyle: 'italic' } },
            { content: formatPdfCurrency(activityTotal), styles: { fillColor: [254, 243, 199], fontStyle: 'italic', halign: 'right' } }
          ]);

          activityResources.sort((a, b) => a.name.localeCompare(b.name)).forEach(resource => {
            const fields = calculateFields(resource);
            resourcesTableData.push([
              `  ${resource.name}`,
              resource.resource_type || '-',
              resource.unit || '-',
              formatPdfCurrency(fields.salesCostUd),
              formatNumber(fields.calculatedUnits),
              formatPdfCurrency(fields.subtotalSales)
            ]);
          });
        });

        resourcesTableData.push([
          { content: 'TOTAL PRESUPUESTO', colSpan: 5, styles: { fillColor: [34, 197, 94], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } },
          { content: formatPdfCurrency(filteredResourcesTotal), styles: { fillColor: [34, 197, 94], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } }
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['Recurso', 'Tipo', 'Ud', '€Coste Venta', 'Uds', '€SubTotal']],
          body: resourcesTableData,
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246] },
          margin: { left: 14, right: 14 },
          styles: { fontSize: 7 },
          columnStyles: {
            0: { cellWidth: 65 },
            1: { cellWidth: 25 },
            2: { cellWidth: 15 },
            3: { cellWidth: 25, halign: 'right' },
            4: { cellWidth: 20, halign: 'right' },
            5: { cellWidth: 28, halign: 'right' },
          },
        });
      }

      // Section: Time Management by Phases (only if selected)
      if (selectedSections.includes('time-phases')) {
        doc.addPage();
        yPos = 20;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text('2. GESTIÓN DEL TIEMPO POR FASES', 14, yPos);
        doc.setTextColor(0);

        yPos += 10;

        const phasesTimeData: any[] = [];
        
        // Sort phases by start_date
        const sortedPhases = [...phases].sort((a, b) => {
          if (!a.start_date && !b.start_date) return 0;
          if (!a.start_date) return 1;
          if (!b.start_date) return -1;
          return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
        });

        sortedPhases.forEach(phase => {
          const formatDate = (date: string | null) => {
            if (!date) return '-';
            try {
              return format(new Date(date), 'dd/MM/yyyy');
            } catch {
              return '-';
            }
          };
          
          phasesTimeData.push([
            `${phase.code || ''} ${phase.name}`.trim(),
            formatDate(phase.start_date),
            phase.duration_days?.toString() || '-',
            formatDate(phase.estimated_end_date)
          ]);
        });

        autoTable(doc, {
          startY: yPos,
          head: [['Fase', 'Fecha Inicio', 'Duración (días)', 'Fecha Fin Estimada']],
          body: phasesTimeData,
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246] },
          margin: { left: 14, right: 14 },
          styles: { fontSize: 9 },
          columnStyles: {
            0: { cellWidth: 80 },
            1: { cellWidth: 35, halign: 'center' },
            2: { cellWidth: 30, halign: 'center' },
            3: { cellWidth: 35, halign: 'center' },
          },
        });
      }

      // Section: Time Management by Activities (only if selected)
      if (selectedSections.includes('time-activities')) {
        doc.addPage();
        yPos = 20;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text('2. GESTIÓN DEL TIEMPO POR ACTIVIDADES', 14, yPos);
        doc.setTextColor(0);

        yPos += 10;

        const activitiesTimeData: any[] = [];
        
        // Sort activities by start_date
        const sortedActivities = [...activities].sort((a, b) => {
          if (!a.start_date && !b.start_date) return 0;
          if (!a.start_date) return 1;
          if (!b.start_date) return -1;
          return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
        });

        sortedActivities.forEach(activity => {
          const formatDate = (date: string | null) => {
            if (!date) return '-';
            try {
              return format(new Date(date), 'dd/MM/yyyy');
            } catch {
              return '-';
            }
          };
          
          const phaseInfo = getPhaseInfo(activity.phase_id);
          const activityId = phaseInfo.code ? `${phaseInfo.code} ${activity.code}` : activity.code;
          
          activitiesTimeData.push([
            `${activityId}.-${activity.name}`,
            formatDate(activity.start_date),
            activity.duration_days?.toString() || '-',
            activity.tolerance_days?.toString() || '-',
            formatDate(activity.end_date)
          ]);
        });

        autoTable(doc, {
          startY: yPos,
          head: [['ActividadID', 'Fecha Inicio', 'Duración', 'Tolerancia', 'Fecha Fin']],
          body: activitiesTimeData,
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246] },
          margin: { left: 14, right: 14 },
          styles: { fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 70 },
            1: { cellWidth: 28, halign: 'center' },
            2: { cellWidth: 22, halign: 'center' },
            3: { cellWidth: 22, halign: 'center' },
            4: { cellWidth: 28, halign: 'center' },
          },
        });
      }

      // Section: Predesigns / Ante-proyecto (only if selected)
      if (selectedSections.includes('predesigns') && predesigns.length > 0) {
        const groupedPredesigns = getGroupedPredesigns();
        const contentTypes = Object.keys(groupedPredesigns).sort((a, b) => a.localeCompare(b, 'es'));
        
        // Load predesign images
        const predesignImages: Map<string, string> = new Map();
        for (const predesign of predesigns) {
          const url = predesignUrls.get(predesign.id);
          if (url && predesign.file_type?.startsWith('image/')) {
            try {
              const response = await fetch(url);
              const blob = await response.blob();
              const imgData = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
              predesignImages.set(predesign.id, imgData);
            } catch (err) {
              console.error('Error loading predesign image:', err);
            }
          }
        }

        let sectionNumber = 2;
        for (const contentType of contentTypes) {
          const items = groupedPredesigns[contentType];
          doc.addPage();
          yPos = 20;
          
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(37, 99, 235);
          doc.text(`${sectionNumber}. ANTE-PROYECTO: ${contentType.toUpperCase()}`, 14, yPos);
          doc.setTextColor(0);
          
          yPos += 10;
          
          // 3 images per page, arranged vertically
          const imageHeight = 70; // mm
          const imageWidth = pageWidth - 28; // full width minus margins
          let imageCount = 0;
          
          for (const item of items) {
            if (imageCount > 0 && imageCount % 3 === 0) {
              // New page for every 3 images
              doc.addPage();
              yPos = 20;
              doc.setFontSize(12);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(37, 99, 235);
              doc.text(`${sectionNumber}. ANTE-PROYECTO: ${contentType.toUpperCase()} (cont.)`, 14, yPos);
              doc.setTextColor(0);
              yPos += 10;
            }
            
            // Draw image title
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 41, 59);
            doc.text(item.content, 14, yPos);
            
            if (item.description) {
              doc.setFontSize(8);
              doc.setFont('helvetica', 'normal');
              doc.setTextColor(100, 116, 139);
              doc.text(item.description, 14, yPos + 4);
              yPos += 8;
            } else {
              yPos += 4;
            }
            
            // Draw image if available
            const imgData = predesignImages.get(item.id);
            if (imgData) {
              // Get image dimensions for proper aspect ratio
              const getImgDimensions = (src: string): Promise<{ width: number; height: number }> => {
                return new Promise((resolve) => {
                  const img = new Image();
                  img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
                  img.onerror = () => resolve({ width: imageWidth, height: imageHeight });
                  img.src = src;
                });
              };
              
              const imgDimensions = await getImgDimensions(imgData);
              const imgAspectRatio = imgDimensions.width / imgDimensions.height;
              
              let drawWidth = imageWidth;
              let drawHeight = imageWidth / imgAspectRatio;
              
              if (drawHeight > imageHeight) {
                drawHeight = imageHeight;
                drawWidth = imageHeight * imgAspectRatio;
              }
              
              const offsetX = 14 + (imageWidth - drawWidth) / 2;
              
              doc.addImage(imgData, 'JPEG', offsetX, yPos, drawWidth, drawHeight, undefined, 'FAST');
              yPos += drawHeight + 8;
            } else {
              // Placeholder for non-image files
              doc.setFillColor(240, 240, 240);
              doc.roundedRect(14, yPos, imageWidth, 20, 2, 2, 'F');
              doc.setFontSize(9);
              doc.setTextColor(100);
              doc.text(`Archivo: ${item.file_name || 'Sin archivo'}`, 20, yPos + 12);
              yPos += 28;
            }
            
            imageCount++;
          }
          sectionNumber++;
        }
      }

      // Section: Measurements List (only if selected) - A4 Landscape
      if (selectedSections.includes('measurements') && measurements.length > 0) {
        doc.addPage('landscape');
        const landscapeWidth = doc.internal.pageSize.getWidth();
        yPos = 20;
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text('2. LISTADO DE MEDICIONES', 14, yPos);
        doc.setTextColor(0);

        yPos += 10;

        const measurementsData: any[] = [];
        
        [...measurements].sort((a, b) => a.name.localeCompare(b.name)).forEach(measurement => {
          measurementsData.push([
            measurement.name,
            formatNumber(measurement.manual_units || 0),
            measurement.measurement_unit || 'ud',
            formatNumber(getCalculatedUnits(measurement)),
            generateMeasurementId(measurement)
          ]);
        });

        // Total row
        measurementsData.push([
          { content: 'TOTAL MEDICIONES', colSpan: 3, styles: { fillColor: [219, 234, 254], fontStyle: 'bold', halign: 'right' } },
          { content: measurements.length.toString(), styles: { fillColor: [219, 234, 254], fontStyle: 'bold', halign: 'right' } },
          { content: '', styles: { fillColor: [219, 234, 254] } }
        ]);

        // Calculate proportional column widths for landscape A4 (297mm - 28mm margins = 269mm usable)
        const usableWidth = landscapeWidth - 28;
        autoTable(doc, {
          startY: yPos,
          head: [['Nombre', 'Uds. Manual', 'Unidad', 'Uds. Cálculo', 'MediciónID']],
          body: measurementsData,
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246] },
          margin: { left: 14, right: 14 },
          styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
          columnStyles: {
            0: { cellWidth: usableWidth * 0.20 },
            1: { cellWidth: usableWidth * 0.10, halign: 'right' },
            2: { cellWidth: usableWidth * 0.08, halign: 'center' },
            3: { cellWidth: usableWidth * 0.10, halign: 'right' },
            4: { cellWidth: usableWidth * 0.52 },
          },
        });
      }

      // Section: Spaces List Alphabetical (only if selected) - A4 Landscape
      if (selectedSections.includes('spaces-alphabetical') && spaces.length > 0) {
        doc.addPage('landscape');
        const landscapeWidth = doc.internal.pageSize.getWidth();
        yPos = 20;
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text('2. LISTADO DE ESPACIOS (ALFABÉTICO)', 14, yPos);
        doc.setTextColor(0);

        yPos += 10;

        const spacesAlphaData: any[] = [];
        
        [...spaces].sort((a, b) => a.name.localeCompare(b.name)).forEach(space => {
          spacesAlphaData.push([
            space.name,
            space.space_type,
            space.level,
            formatNumber(space.m2_built || 0),
            formatNumber(space.m2_livable || 0),
            formatNumber(getM2Construction(space))
          ]);
        });

        // Total row
        spacesAlphaData.push([
          { content: 'TOTAL', colSpan: 3, styles: { fillColor: [219, 234, 254], fontStyle: 'bold', halign: 'right' } },
          { content: formatNumber(spacesTotals.m2_built), styles: { fillColor: [219, 234, 254], fontStyle: 'bold', halign: 'right' } },
          { content: formatNumber(spacesTotals.m2_livable), styles: { fillColor: [219, 234, 254], fontStyle: 'bold', halign: 'right' } },
          { content: formatNumber(spacesTotals.m2_construction), styles: { fillColor: [219, 234, 254], fontStyle: 'bold', halign: 'right' } }
        ]);

        // Calculate proportional column widths for landscape A4
        const usableWidth = landscapeWidth - 28;
        autoTable(doc, {
          startY: yPos,
          head: [['Nombre', 'Tipo', 'Nivel', 'm² Construidos', 'm² Habitables', 'm² Construcción']],
          body: spacesAlphaData,
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246] },
          margin: { left: 14, right: 14 },
          styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
          columnStyles: {
            0: { cellWidth: usableWidth * 0.25 },
            1: { cellWidth: usableWidth * 0.18 },
            2: { cellWidth: usableWidth * 0.15 },
            3: { cellWidth: usableWidth * 0.14, halign: 'right' },
            4: { cellWidth: usableWidth * 0.14, halign: 'right' },
            5: { cellWidth: usableWidth * 0.14, halign: 'right' },
          },
        });
      }

      // Section: Spaces List Grouped (only if selected) - A4 Landscape
      if (selectedSections.includes('spaces-grouped') && spaces.length > 0) {
        doc.addPage('landscape');
        const landscapeWidth = doc.internal.pageSize.getWidth();
        yPos = 20;
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text('2. LISTADO DE ESPACIOS (POR NIVEL/TIPO)', 14, yPos);
        doc.setTextColor(0);

        yPos += 10;

        const spacesGroupedData: any[] = [];
        const groupedSpaces = getSpacesByLevelAndType();
        
        Object.entries(groupedSpaces).forEach(([level, typeData]) => {
          const levelTotals = getLevelTotals(typeData);
          
          // Level header row
          spacesGroupedData.push([
            { content: level, colSpan: 3, styles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' } },
            { content: formatNumber(levelTotals.m2_built), styles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } },
            { content: formatNumber(levelTotals.m2_livable), styles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } },
            { content: formatNumber(levelTotals.m2_construction), styles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } }
          ]);
          
          Object.entries(typeData).forEach(([type, typeSpaces]) => {
            // Type subheader
            spacesGroupedData.push([
              { content: `  ${type}`, colSpan: 6, styles: { fillColor: [240, 240, 240], fontStyle: 'italic' } }
            ]);
            
            typeSpaces.forEach(space => {
              spacesGroupedData.push([
                `    ${space.name}`,
                space.space_type,
                space.level,
                formatNumber(space.m2_built || 0),
                formatNumber(space.m2_livable || 0),
                formatNumber(getM2Construction(space))
              ]);
            });
          });
        });

        // Grand total row
        spacesGroupedData.push([
          { content: 'TOTAL GENERAL', colSpan: 3, styles: { fillColor: [34, 197, 94], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } },
          { content: formatNumber(spacesTotals.m2_built), styles: { fillColor: [34, 197, 94], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } },
          { content: formatNumber(spacesTotals.m2_livable), styles: { fillColor: [34, 197, 94], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } },
          { content: formatNumber(spacesTotals.m2_construction), styles: { fillColor: [34, 197, 94], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } }
        ]);

        // Calculate proportional column widths for landscape A4
        const usableWidth = landscapeWidth - 28;
        autoTable(doc, {
          startY: yPos,
          head: [['Nombre', 'Tipo', 'Nivel', 'm² Construidos', 'm² Habitables', 'm² Construcción']],
          body: spacesGroupedData,
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246] },
          margin: { left: 14, right: 14 },
          styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
          columnStyles: {
            0: { cellWidth: usableWidth * 0.25 },
            1: { cellWidth: usableWidth * 0.18 },
            2: { cellWidth: usableWidth * 0.15 },
            3: { cellWidth: usableWidth * 0.14, halign: 'right' },
            4: { cellWidth: usableWidth * 0.14, halign: 'right' },
            5: { cellWidth: usableWidth * 0.14, halign: 'right' },
          },
        });
      }

      // Footer
      const pageCount = doc.getNumberOfPages();
      const footerTextHeight = 3; // Height of footer text in mm (font size 7 ≈ 2.5-3mm)
      const footerLogoHeight = footerTextHeight; // Same height as text
      const footerLogoWidth = footerLogoHeight * 3; // 3:1 aspect ratio (width:height)
      
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        const currentPageWidth = doc.internal.pageSize.getWidth();
        const currentPageHeight = doc.internal.pageSize.getHeight();
        doc.setDrawColor(200);
        doc.line(14, currentPageHeight - 20, currentPageWidth - 14, currentPageHeight - 20);
        doc.setFontSize(7);
        doc.setTextColor(120);
        
        let footerTextX = 14;
        
        // Add logo before company name if available
        if (logoImgData) {
          try {
            const logoY = currentPageHeight - 14 - footerLogoHeight + 1; // Align with text baseline
            doc.addImage(logoImgData, 'JPEG', 14, logoY, footerLogoWidth, footerLogoHeight);
            footerTextX = 14 + footerLogoWidth + 2; // Position text after logo with small gap
          } catch (e) {
            console.error('Error drawing footer logo:', e);
          }
        }
        
        const footerInfo = [companyName, companyEmail, companyPhone].filter(Boolean).join(' | ');
        doc.text(footerInfo, footerTextX, currentPageHeight - 14);
        doc.text(`Página ${i} de ${pageCount}`, currentPageWidth - 14, currentPageHeight - 14, { align: 'right' });
      }

      const sectionSuffixes: string[] = [];
      if (selectedSections.includes('predesigns')) sectionSuffixes.push('anteproyecto');
      if (selectedSections.includes('activities')) sectionSuffixes.push('actividades');
      if (selectedSections.includes('resources')) sectionSuffixes.push('recursos');
      if (selectedSections.includes('time-phases')) sectionSuffixes.push('tiempo_fases');
      if (selectedSections.includes('time-activities')) sectionSuffixes.push('tiempo_actividades');
      if (selectedSections.includes('measurements')) sectionSuffixes.push('mediciones');
      if (selectedSections.includes('spaces-alphabetical')) sectionSuffixes.push('espacios_alfa');
      if (selectedSections.includes('spaces-grouped')) sectionSuffixes.push('espacios_nivel');
      const sectionSuffix = sectionSuffixes.length > 0 ? sectionSuffixes.join('_') : 'informe';
      const fileName = `presupuesto_${sectionSuffix}_${presupuesto.nombre.replace(/[^a-zA-Z0-9]/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`;
      doc.save(fileName);
      toast.success('PDF exportado correctamente');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Error al exportar el PDF');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b print:hidden flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold">
              Vista previa del informe
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" />
                Imprimir
              </Button>
              <Button size="sm" onClick={exportToPDF} disabled={isExporting || loading}>
                <FileDown className="h-4 w-4 mr-2" />
                {isExporting ? 'Exportando...' : 'Exportar PDF'}
              </Button>
            </div>
          </div>
          
          {/* Section selection */}
          <div className="mt-4 print:hidden space-y-3">
            <Label className="text-sm font-medium block">Seleccionar secciones a incluir:</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-3 bg-muted/20 rounded-lg border">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="cuanto-cuando" 
                  checked={selectedSections.includes('cuanto-cuando')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedSections(prev => [...prev, 'cuanto-cuando']);
                    } else {
                      setSelectedSections(prev => prev.filter(s => s !== 'cuanto-cuando'));
                    }
                  }}
                />
                <Label htmlFor="cuanto-cuando" className="cursor-pointer text-sm font-medium text-primary">CUÁNTO cuesta + CUÁNDO hacer</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="predesigns" 
                  checked={selectedSections.includes('predesigns')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedSections(prev => [...prev, 'predesigns']);
                    } else {
                      setSelectedSections(prev => prev.filter(s => s !== 'predesigns'));
                    }
                  }}
                />
                <Label htmlFor="predesigns" className="cursor-pointer text-sm">Ante-proyecto</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="activities" 
                  checked={selectedSections.includes('activities')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedSections(prev => [...prev, 'activities']);
                    } else {
                      setSelectedSections(prev => prev.filter(s => s !== 'activities'));
                    }
                  }}
                />
                <Label htmlFor="activities" className="cursor-pointer text-sm">Actividades por Fase</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="resources" 
                  checked={selectedSections.includes('resources')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedSections(prev => [...prev, 'resources']);
                    } else {
                      setSelectedSections(prev => prev.filter(s => s !== 'resources'));
                    }
                  }}
                />
                <Label htmlFor="resources" className="cursor-pointer text-sm">Recursos por Fase/Actividad</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="time-phases" 
                  checked={selectedSections.includes('time-phases')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedSections(prev => [...prev, 'time-phases']);
                    } else {
                      setSelectedSections(prev => prev.filter(s => s !== 'time-phases'));
                    }
                  }}
                />
                <Label htmlFor="time-phases" className="cursor-pointer text-sm">Tiempo por Fases</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="time-activities" 
                  checked={selectedSections.includes('time-activities')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedSections(prev => [...prev, 'time-activities']);
                    } else {
                      setSelectedSections(prev => prev.filter(s => s !== 'time-activities'));
                    }
                  }}
                />
                <Label htmlFor="time-activities" className="cursor-pointer text-sm">Tiempo por Actividades</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="measurements" 
                  checked={selectedSections.includes('measurements')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedSections(prev => [...prev, 'measurements']);
                    } else {
                      setSelectedSections(prev => prev.filter(s => s !== 'measurements'));
                    }
                  }}
                />
                <Label htmlFor="measurements" className="cursor-pointer text-sm">Listado de Mediciones</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="spaces-alphabetical" 
                  checked={selectedSections.includes('spaces-alphabetical')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedSections(prev => [...prev, 'spaces-alphabetical']);
                    } else {
                      setSelectedSections(prev => prev.filter(s => s !== 'spaces-alphabetical'));
                    }
                  }}
                />
                <Label htmlFor="spaces-alphabetical" className="cursor-pointer text-sm">Espacios (Alfabético)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="spaces-grouped" 
                  checked={selectedSections.includes('spaces-grouped')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedSections(prev => [...prev, 'spaces-grouped']);
                    } else {
                      setSelectedSections(prev => prev.filter(s => s !== 'spaces-grouped'));
                    }
                  }}
                />
                <Label htmlFor="spaces-grouped" className="cursor-pointer text-sm">Espacios (Nivel/Tipo)</Label>
              </div>
            </div>
            
            {/* Filter option for SubTotal > 0 */}
            <div className="flex items-center space-x-3 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
              <Switch 
                id="only-with-cost" 
                checked={onlyWithCost}
                onCheckedChange={setOnlyWithCost}
              />
              <Label htmlFor="only-with-cost" className="cursor-pointer text-sm">
                <span className="font-medium">Solo con coste:</span> Mostrar solo Fases/Actividades/Recursos con SubTotal {'>'} 0
              </Label>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 200px)' }}>
          {loading ? (
            <div className="space-y-4 py-6">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <div ref={printRef} className="py-6 space-y-8 print:py-0 print:space-y-0 print-content">
              {/* Cover Page with Header, Cover, Title, and Index */}
              <div className="print-cover">
                {/* Header - with more vertical space */}
                <div className="flex items-center gap-4 p-5 print:p-3 border-b print:border-none">
                  <div className="w-12 h-12 print:w-10 print:h-10 rounded bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {companySettings.logo_url ? (
                      <img 
                        src={companySettings.logo_url} 
                        alt="Logo" 
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-primary font-bold text-sm print:text-xs">
                        {(companySettings.name || 'MI').substring(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="text-left">
                    <h2 className="text-base font-bold text-primary">
                      {companySettings.name || 'Mi Empresa'}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      {[companySettings.email, companySettings.phone, companySettings.website].filter(Boolean).join(' | ')}
                    </p>
                  </div>
                </div>
                
                {/* Cover Image - smaller, about 1/3 of page */}
                {presupuesto.portada_url && (
                  <div className="relative mx-4 print:mx-2 my-3 print:my-2 rounded-lg print:rounded-none overflow-hidden" style={{ height: '140px' }}>
                    <img 
                      src={presupuesto.portada_url} 
                      alt="Portada del presupuesto" 
                      className="w-full h-full object-cover"
                    />
                    {/* Overlay for text */}
                    {(() => {
                      const opacity = presupuesto.portada_overlay_opacity ?? 0.4;
                      const textColor = presupuesto.portada_text_color || '#FFFFFF';
                      
                      return (
                        <>
                          <div 
                            className="absolute inset-0"
                            style={{ backgroundColor: `rgba(0,0,0,${opacity})` }}
                          />
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4" style={{ color: textColor }}>
                            <p className="text-xs font-medium uppercase tracking-wider">Informe de Presupuesto</p>
                            <p className="text-lg font-bold mt-1">{presupuesto.nombre}</p>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
                
                {/* Report title info with report type name */}
                <div className="text-center py-3 print:py-2 px-4">
                  <h1 className="text-lg print:text-base font-bold text-foreground">INFORME DE PRESUPUESTO</h1>
                  <p className="text-sm font-semibold text-primary mt-1">{getReportTypeName()}</p>
                  <p className="text-sm print:text-xs text-foreground mt-1">{presupuesto.nombre}</p>
                  <p className="text-xs print:text-[10px] text-muted-foreground">{presupuestoId}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Fecha de generación: {format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es })}
                  </p>
                </div>

                {/* Index Section - on the same first page */}
                <div className="print-index mx-4 print:mx-2 p-4 print:p-3 bg-muted/30 rounded-lg print:rounded">
                  <h3 className="text-sm font-bold text-primary border-l-4 border-primary pl-2 mb-3">ÍNDICE DEL DOCUMENTO</h3>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span>1. Resumen General</span>
                      <span className="text-muted-foreground text-xs">Pág. 2</span>
                    </div>
                    {selectedSections.includes('cuanto-cuando') && (
                      <div className="flex justify-between">
                        <span>2. CUÁNTO cuesta + CUÁNDO hacer</span>
                        <span className="text-muted-foreground text-xs">Pág. 3</span>
                      </div>
                    )}
                    {selectedSections.includes('predesigns') && (
                      <div className="flex justify-between">
                        <span>2. Ante-proyecto</span>
                        <span className="text-muted-foreground text-xs">Pág. 3</span>
                      </div>
                    )}
                    {selectedSections.includes('activities') && (
                      <div className="flex justify-between">
                        <span>2. Resumen de Actividades por Fase</span>
                        <span className="text-muted-foreground text-xs">Pág. 3</span>
                      </div>
                    )}
                    {selectedSections.includes('resources') && (
                      <div className="flex justify-between">
                        <span>2. Desglose de Recursos por Fase y Actividad</span>
                        <span className="text-muted-foreground text-xs">Pág. 3</span>
                      </div>
                    )}
                    {selectedSections.includes('time-phases') && (
                      <div className="flex justify-between">
                        <span>2. Gestión del Tiempo por Fases</span>
                        <span className="text-muted-foreground text-xs">Pág. 3</span>
                      </div>
                    )}
                    {selectedSections.includes('time-activities') && (
                      <div className="flex justify-between">
                        <span>2. Gestión del Tiempo por Actividades</span>
                        <span className="text-muted-foreground text-xs">Pág. 3</span>
                      </div>
                    )}
                    {selectedSections.includes('measurements') && (
                      <div className="flex justify-between">
                        <span>2. Listado de Mediciones</span>
                        <span className="text-muted-foreground text-xs">Pág. 3</span>
                      </div>
                    )}
                    {selectedSections.includes('spaces-alphabetical') && (
                      <div className="flex justify-between">
                        <span>2. Listado de Espacios (Alfabético)</span>
                        <span className="text-muted-foreground text-xs">Pág. 3</span>
                      </div>
                    )}
                    {selectedSections.includes('spaces-grouped') && (
                      <div className="flex justify-between">
                        <span>2. Listado de Espacios (Por Nivel/Tipo)</span>
                        <span className="text-muted-foreground text-xs">Pág. 3</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Section 1: General Summary - starts on new page */}
              <div className="print-section">
                <h3 className="text-lg font-bold text-primary mb-4">1. RESUMEN GENERAL</h3>
                
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-2xl font-bold">{activities.length}</p>
                      <p className="text-sm text-muted-foreground">Actividades</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-2xl font-bold">{phases.length}</p>
                      <p className="text-sm text-muted-foreground">Fases</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-2xl font-bold">{resources.length}</p>
                      <p className="text-sm text-muted-foreground">Recursos</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Custom notes textarea */}
                <div className="mt-4 print:hidden">
                  <Label className="text-sm font-medium mb-2 block">Observaciones (texto personalizado):</Label>
                  <textarea
                    value={customNotes}
                    onChange={(e) => setCustomNotes(e.target.value)}
                    placeholder="Escriba aquí las observaciones o notas que desea incluir en el informe antes del total..."
                    className="w-full min-h-[80px] p-3 border rounded-md bg-background text-foreground resize-y text-sm"
                  />
                </div>

                {/* Custom notes preview for print */}
                {customNotes.trim() && (
                  <Card className="bg-muted/50 border-muted hidden print:block">
                    <CardContent className="py-3">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">OBSERVACIONES:</p>
                      <p className="text-sm whitespace-pre-wrap">{customNotes}</p>
                    </CardContent>
                  </Card>
                )}

                <Card className="bg-green-500/10 border-green-500/30">
                  <CardContent className="py-4 flex items-center justify-between">
                    <span className="font-semibold text-lg">TOTAL PRESUPUESTO</span>
                    <span className="text-2xl font-bold text-green-600">{formatCurrency(totalResourcesSubtotal)}</span>
                  </CardContent>
                </Card>

                <div className="mt-4">
                  <h4 className="font-semibold mb-2">Desglose por Tipo de Recurso</h4>
                  <div className="space-y-1">
                    {Object.entries(byType).map(([type, data]) => (
                      <div key={type} className="flex justify-between items-center text-sm border-b pb-1">
                        <span>{type}: {data.count}</span>
                        <span className="font-mono text-right">{formatCurrency(data.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <Separator className="print:hidden" />

              {/* Section: CUÁNTO cuesta + CUÁNDO hacer - only if selected */}
              {selectedSections.includes('cuanto-cuando') && (
              <div className="print-section">
                <h3 className="text-lg font-bold text-primary mb-4">2. ¿CUÁNTO CUESTA? PRESUPUESTO</h3>
                
                {/* Budget Info with Cover Image */}
                <div className="mb-6">
                  {presupuesto.portada_url && (
                    <div className="relative rounded-lg overflow-hidden mb-4" style={{ height: '180px' }}>
                      <img 
                        src={presupuesto.portada_url} 
                        alt="Portada del presupuesto" 
                        className="w-full h-full object-cover"
                      />
                      <div 
                        className="absolute inset-0"
                        style={{ backgroundColor: `rgba(0,0,0,${presupuesto.portada_overlay_opacity ?? 0.4})` }}
                      />
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4" style={{ color: presupuesto.portada_text_color || '#FFFFFF' }}>
                        <p className="text-sm font-medium uppercase tracking-wider">Presupuesto</p>
                        <p className="text-xl font-bold mt-1">{presupuesto.nombre}</p>
                        <p className="text-sm mt-1">{presupuesto.poblacion}{presupuesto.provincia ? `, ${presupuesto.provincia}` : ''}</p>
                      </div>
                    </div>
                  )}
                  
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Nombre:</span>
                        <p className="font-medium">{presupuesto.nombre}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Código:</span>
                        <p className="font-medium">{presupuesto.codigo_correlativo}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Versión:</span>
                        <p className="font-medium">{presupuesto.version}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Ubicación:</span>
                        <p className="font-medium">{presupuesto.poblacion}{presupuesto.provincia ? `, ${presupuesto.provincia}` : ''}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cost Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <Card className="bg-primary/5 border-primary/20">
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">Subtotal Recursos</p>
                      <p className="text-2xl font-bold text-primary">{formatCurrency(totalResourcesSubtotal)}</p>
                      <p className="text-xs text-muted-foreground">Total PVP de {resources.length} recursos</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">m² Construidos</p>
                      <p className="text-2xl font-bold">{formatNumber(spacesTotals.m2_built)} m²</p>
                      <p className="text-xs text-muted-foreground">De {spaces.length} espacios</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">m² Habitables</p>
                      <p className="text-2xl font-bold">{formatNumber(spacesTotals.m2_livable)} m²</p>
                      <p className="text-xs text-muted-foreground">De {spaces.length} espacios</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Cost per m2 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <Card className="bg-amber-500/10 border-amber-500/20">
                    <CardContent className="pt-4">
                      <p className="text-sm font-medium text-amber-600">€ Coste por m² Construido</p>
                      <p className="text-3xl font-bold text-amber-600">
                        {formatCurrency(spacesTotals.m2_built > 0 ? totalResourcesSubtotal / spacesTotals.m2_built : 0)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatCurrency(totalResourcesSubtotal)} ÷ {formatNumber(spacesTotals.m2_built)} m²
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-emerald-500/10 border-emerald-500/20">
                    <CardContent className="pt-4">
                      <p className="text-sm font-medium text-emerald-600">€ Coste por m² Habitable</p>
                      <p className="text-3xl font-bold text-emerald-600">
                        {formatCurrency(spacesTotals.m2_livable > 0 ? totalResourcesSubtotal / spacesTotals.m2_livable : 0)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatCurrency(totalResourcesSubtotal)} ÷ {formatNumber(spacesTotals.m2_livable)} m²
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <Separator className="my-6" />

                {/* CUÁNDO hacer - Phases List */}
                <h3 className="text-lg font-bold text-primary mb-4">¿CUÁNDO HACER? FASES</h3>
                
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-primary/10">
                        <TableHead className="font-bold">FaseID</TableHead>
                        <TableHead className="font-bold">Nombre</TableHead>
                        <TableHead className="font-bold w-28 text-center">Fecha Inicio</TableHead>
                        <TableHead className="font-bold w-24 text-center">Duración</TableHead>
                        <TableHead className="font-bold w-28 text-center">Fecha Fin</TableHead>
                        <TableHead className="font-bold w-28 text-right">€SubTotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {phases.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            No hay fases registradas
                          </TableCell>
                        </TableRow>
                      ) : (
                        [...phases].sort((a, b) => (a.code || '').localeCompare(b.code || '')).map(phase => {
                          // Calculate subtotal for this phase
                          const phaseActivities = activities.filter(a => a.phase_id === phase.id);
                          const activityIds = phaseActivities.map(a => a.id);
                          const phaseResources = resources.filter(r => r.activity_id && activityIds.includes(r.activity_id));
                          const phaseSubtotal = phaseResources.reduce((sum, r) => {
                            return sum + calcResourceSubtotal({
                              externalUnitCost: r.external_unit_cost,
                              safetyPercent: r.safety_margin_percent,
                              salesPercent: r.sales_margin_percent,
                              manualUnits: r.manual_units,
                              relatedUnits: r.related_units,
                            });
                          }, 0);
                          
                          return (
                            <TableRow key={phase.id}>
                              <TableCell className="font-mono font-medium">{phase.code || '-'}</TableCell>
                              <TableCell className="font-medium">{phase.name}</TableCell>
                              <TableCell className="text-center">
                                {phase.start_date ? format(new Date(phase.start_date), 'dd/MM/yyyy') : '-'}
                              </TableCell>
                              <TableCell className="text-center">
                                {phase.duration_days ? `${phase.duration_days} días` : '-'}
                              </TableCell>
                              <TableCell className="text-center">
                                {phase.estimated_end_date ? format(new Date(phase.estimated_end_date), 'dd/MM/yyyy') : '-'}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(phaseSubtotal)}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
              )}

              {selectedSections.includes('cuanto-cuando') && <Separator className="print:hidden" />}

              {/* Section 2: Activities Summary - only if selected */}
              {selectedSections.includes('activities') && (
              <div className="print-section">
                <h3 className="text-lg font-bold text-primary mb-4">2. RESUMEN DE ACTIVIDADES POR FASE</h3>
                
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-primary/10">
                        <TableHead className="font-bold">ActividadID</TableHead>
                        <TableHead className="font-bold w-20">Unidad</TableHead>
                        <TableHead className="font-bold w-20 text-center">Archivos</TableHead>
                        <TableHead className="font-bold w-32 text-right">€SubTotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Unassigned activities */}
                      {activities.filter(a => !a.phase_id).length > 0 && (
                        <>
                          <TableRow className="bg-muted/50">
                            <TableCell colSpan={3} className="font-semibold">Sin fase asignada</TableCell>
                            <TableCell className="font-semibold text-right">
                              {formatCurrency(activities.filter(a => !a.phase_id).reduce((sum, a) => sum + (activityResourcesMap.get(a.id) || 0), 0))}
                            </TableCell>
                          </TableRow>
                          {activities.filter(a => !a.phase_id).map(activity => (
                            <TableRow key={activity.id}>
                              <TableCell className="pl-6">{generateActivityId(activity)}</TableCell>
                              <TableCell>{activity.measurement_unit}</TableCell>
                              <TableCell className="text-center">{filesCountMap.get(activity.id) || 0}</TableCell>
                              <TableCell className="text-right font-mono">{formatCurrency(activityResourcesMap.get(activity.id) || 0)}</TableCell>
                            </TableRow>
                          ))}
                        </>
                      )}

                      {/* Phases with activities */}
                      {phases.map(phase => {
                        const phaseActivities = activities.filter(a => a.phase_id === phase.id);
                        
                        const phaseSubtotal = phaseActivities.reduce((sum, a) => sum + (activityResourcesMap.get(a.id) || 0), 0);
                        
                        return (
                          <React.Fragment key={phase.id}>
                            <TableRow className="bg-primary text-primary-foreground">
                              <TableCell colSpan={3} className="font-bold">{phase.code} {phase.name}</TableCell>
                              <TableCell className="font-bold text-right">{formatCurrency(phaseSubtotal)}</TableCell>
                            </TableRow>
                            {phaseActivities.sort((a, b) => a.name.localeCompare(b.name)).map(activity => (
                              <TableRow key={activity.id}>
                                <TableCell className="pl-6">{generateActivityId(activity)}</TableCell>
                                <TableCell>{activity.measurement_unit}</TableCell>
                                <TableCell className="text-center">{filesCountMap.get(activity.id) || 0}</TableCell>
                                <TableCell className="text-right font-mono">{formatCurrency(activityResourcesMap.get(activity.id) || 0)}</TableCell>
                              </TableRow>
                            ))}
                          </React.Fragment>
                        );
                      })}

                      {/* Total row */}
                      <TableRow className="bg-green-500 text-white">
                        <TableCell colSpan={3} className="font-bold text-right">TOTAL ACTIVIDADES</TableCell>
                        <TableCell className="font-bold text-right">{formatCurrency(totalResourcesSubtotal)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
              )}

              {selectedSections.includes('activities') && <Separator className="print:hidden" />}

              {/* Section 3: Resources Detail - only if selected */}
              {selectedSections.includes('resources') && (
              <div className="print-section">
                <h3 className="text-lg font-bold text-primary mb-4">2. DESGLOSE DE RECURSOS POR FASE Y ACTIVIDAD</h3>
                
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-primary/10">
                        <TableHead className="font-bold">Recurso</TableHead>
                        <TableHead className="font-bold w-24">Tipo</TableHead>
                        <TableHead className="font-bold w-16">Ud</TableHead>
                        <TableHead className="font-bold w-24 text-right">€Coste Venta</TableHead>
                        <TableHead className="font-bold w-16 text-right">Uds</TableHead>
                        <TableHead className="font-bold w-28 text-right">€SubTotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Resources without activity */}
                      {resources.filter(r => !r.activity_id).length > 0 && (
                        <>
                          <TableRow className="bg-muted/50">
                            <TableCell colSpan={5} className="font-semibold">Sin actividad asignada</TableCell>
                            <TableCell className="font-semibold text-right">
                              {formatCurrency(resources.filter(r => !r.activity_id).reduce((sum, r) => sum + calculateFields(r).subtotalSales, 0))}
                            </TableCell>
                          </TableRow>
                          {resources.filter(r => !r.activity_id).map(resource => {
                            const fields = calculateFields(resource);
                            return (
                              <TableRow key={resource.id}>
                                <TableCell className="pl-6">{resource.name}</TableCell>
                                <TableCell>{resource.resource_type || '-'}</TableCell>
                                <TableCell>{resource.unit || '-'}</TableCell>
                                <TableCell className="text-right font-mono">{formatCurrency(fields.salesCostUd)}</TableCell>
                                <TableCell className="text-right font-mono">{formatNumber(fields.calculatedUnits)}</TableCell>
                                <TableCell className="text-right font-mono">{formatCurrency(fields.subtotalSales)}</TableCell>
                              </TableRow>
                            );
                          })}
                        </>
                      )}

                      {/* Phases with resources */}
                      {phases.map(phase => {
                        const phaseActivities = activities.filter(a => a.phase_id === phase.id);
                        const phaseResources = resources.filter(r => {
                          const activity = activities.find(a => a.id === r.activity_id);
                          return activity?.phase_id === phase.id;
                        });
                        
                        if (phaseResources.length === 0) return null;
                        
                        const phaseTotal = phaseResources.reduce((sum, r) => sum + calculateFields(r).subtotalSales, 0);
                        
                        return (
                          <React.Fragment key={phase.id}>
                            <TableRow className="bg-primary text-primary-foreground">
                              <TableCell colSpan={5} className="font-bold">{phase.code} {phase.name}</TableCell>
                              <TableCell className="font-bold text-right">{formatCurrency(phaseTotal)}</TableCell>
                            </TableRow>
                            {phaseActivities.map(activity => {
                              const activityResources = resources.filter(r => r.activity_id === activity.id);
                              if (activityResources.length === 0) return null;
                              
                              const activityTotal = activityResources.reduce((sum, r) => sum + calculateFields(r).subtotalSales, 0);
                              
                              return (
                                <React.Fragment key={activity.id}>
                                  <TableRow className="bg-primary/10">
                                    <TableCell colSpan={5} className="font-medium italic pl-4">{activity.code}.-{activity.name}</TableCell>
                                    <TableCell className="font-medium italic text-right">{formatCurrency(activityTotal)}</TableCell>
                                  </TableRow>
                                  {activityResources.sort((a, b) => a.name.localeCompare(b.name)).map(resource => {
                                    const fields = calculateFields(resource);
                                    return (
                                      <TableRow key={resource.id}>
                                        <TableCell className="pl-8">{resource.name}</TableCell>
                                        <TableCell>{resource.resource_type || '-'}</TableCell>
                                        <TableCell>{resource.unit || '-'}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(fields.salesCostUd)}</TableCell>
                                        <TableCell className="text-right font-mono">{formatNumber(fields.calculatedUnits)}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(fields.subtotalSales)}</TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </React.Fragment>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}

                      {/* Total row */}
                      <TableRow className="bg-green-500 text-white">
                        <TableCell colSpan={5} className="font-bold text-right">TOTAL PRESUPUESTO</TableCell>
                        <TableCell className="font-bold text-right">{formatCurrency(totalResourcesSubtotal)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
              )}

              {/* Section: Time Management by Phases - only if selected */}
              {selectedSections.includes('time-phases') && (
              <div className="print-section">
                <h3 className="text-lg font-bold text-primary mb-4">2. GESTIÓN DEL TIEMPO POR FASES</h3>
                
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-primary/10">
                        <TableHead className="font-bold">Fase</TableHead>
                        <TableHead className="font-bold w-28 text-center">Fecha Inicio</TableHead>
                        <TableHead className="font-bold w-28 text-center">Duración (días)</TableHead>
                        <TableHead className="font-bold w-28 text-center">Fecha Fin Estimada</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...phases]
                        .sort((a, b) => {
                          if (!a.start_date && !b.start_date) return 0;
                          if (!a.start_date) return 1;
                          if (!b.start_date) return -1;
                          return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
                        })
                        .map(phase => {
                          const formatDate = (date: string | null) => {
                            if (!date) return '-';
                            try {
                              return format(new Date(date), 'dd/MM/yyyy');
                            } catch {
                              return '-';
                            }
                          };
                          
                          return (
                            <TableRow key={phase.id}>
                              <TableCell className="font-medium">{phase.code} {phase.name}</TableCell>
                              <TableCell className="text-center">{formatDate(phase.start_date)}</TableCell>
                              <TableCell className="text-center">{phase.duration_days ?? '-'}</TableCell>
                              <TableCell className="text-center">{formatDate(phase.estimated_end_date)}</TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </div>
              </div>
              )}

              {/* Section: Time Management by Activities - only if selected */}
              {selectedSections.includes('time-activities') && (
              <div className="print-section">
                <h3 className="text-lg font-bold text-primary mb-4">2. GESTIÓN DEL TIEMPO POR ACTIVIDADES</h3>
                
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-primary/10">
                        <TableHead className="font-bold">ActividadID</TableHead>
                        <TableHead className="font-bold w-24 text-center">Fecha Inicio</TableHead>
                        <TableHead className="font-bold w-20 text-center">Duración</TableHead>
                        <TableHead className="font-bold w-20 text-center">Tolerancia</TableHead>
                        <TableHead className="font-bold w-24 text-center">Fecha Fin</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...activities]
                        .sort((a, b) => {
                          if (!a.start_date && !b.start_date) return 0;
                          if (!a.start_date) return 1;
                          if (!b.start_date) return -1;
                          return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
                        })
                        .map(activity => {
                          const formatDate = (date: string | null) => {
                            if (!date) return '-';
                            try {
                              return format(new Date(date), 'dd/MM/yyyy');
                            } catch {
                              return '-';
                            }
                          };
                          
                          return (
                            <TableRow key={activity.id}>
                              <TableCell className="font-medium">{generateActivityId(activity)}</TableCell>
                              <TableCell className="text-center">{formatDate(activity.start_date)}</TableCell>
                              <TableCell className="text-center">{activity.duration_days ?? '-'}</TableCell>
                              <TableCell className="text-center">{activity.tolerance_days ?? '-'}</TableCell>
                              <TableCell className="text-center">{formatDate(activity.end_date)}</TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </div>
              </div>
              )}

              {/* Section: Predesigns / Ante-proyecto - only if selected */}
              {selectedSections.includes('predesigns') && predesigns.length > 0 && (
              <div className="print-section">
                <h3 className="text-lg font-bold text-primary mb-4">2. ANTE-PROYECTO</h3>
                
                {Object.entries(getGroupedPredesigns()).sort(([a], [b]) => a.localeCompare(b, 'es')).map(([contentType, items]) => (
                  <div key={contentType} className="mb-6">
                    <h4 className="font-semibold text-base mb-3 text-primary/80 border-l-4 border-primary/50 pl-2">
                      {contentType}
                    </h4>
                    <div className="grid grid-cols-3 gap-4">
                      {items.map(item => {
                        const imageUrl = predesignUrls.get(item.id);
                        const isImage = item.file_type?.startsWith('image/');
                        
                        return (
                          <Card key={item.id} className="overflow-hidden">
                            <div className="aspect-[4/3] bg-muted flex items-center justify-center overflow-hidden">
                              {imageUrl && isImage ? (
                                <img 
                                  src={imageUrl} 
                                  alt={item.content}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="text-muted-foreground text-sm text-center p-2">
                                  {item.file_name || 'Sin archivo'}
                                </div>
                              )}
                            </div>
                            <CardContent className="p-2">
                              <p className="font-medium text-sm truncate">{item.content}</p>
                              {item.description && (
                                <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              )}

              {/* Section: Measurements List - only if selected */}
              {selectedSections.includes('measurements') && (
              <div className="print-section">
                <h3 className="text-lg font-bold text-primary mb-4">2. LISTADO DE MEDICIONES</h3>
                
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-primary/10">
                        <TableHead className="font-bold">Nombre</TableHead>
                        <TableHead className="font-bold w-24 text-right">Uds. Manual</TableHead>
                        <TableHead className="font-bold w-20 text-center">Unidad</TableHead>
                        <TableHead className="font-bold w-24 text-right">Uds. Cálculo</TableHead>
                        <TableHead className="font-bold">MediciónID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {measurements.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            No hay mediciones registradas
                          </TableCell>
                        </TableRow>
                      ) : (
                        <>
                          {[...measurements].sort((a, b) => a.name.localeCompare(b.name)).map(measurement => (
                            <TableRow key={measurement.id}>
                              <TableCell className="font-medium">{measurement.name}</TableCell>
                              <TableCell className="text-right font-mono">{formatNumber(measurement.manual_units || 0)}</TableCell>
                              <TableCell className="text-center">{measurement.measurement_unit || 'ud'}</TableCell>
                              <TableCell className="text-right font-mono">{formatNumber(getCalculatedUnits(measurement))}</TableCell>
                              <TableCell className="text-sm">{generateMeasurementId(measurement)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-primary/10 font-bold">
                            <TableCell colSpan={3} className="font-bold">TOTAL MEDICIONES</TableCell>
                            <TableCell className="text-right font-bold">{measurements.length}</TableCell>
                            <TableCell></TableCell>
                          </TableRow>
                        </>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
              )}

              {/* Section: Spaces List Alphabetical - only if selected */}
              {selectedSections.includes('spaces-alphabetical') && (
              <div className="print-section">
                <h3 className="text-lg font-bold text-primary mb-4">2. LISTADO DE ESPACIOS (ALFABÉTICO)</h3>
                
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-primary/10">
                        <TableHead className="font-bold">Nombre</TableHead>
                        <TableHead className="font-bold">Tipo</TableHead>
                        <TableHead className="font-bold">Nivel</TableHead>
                        <TableHead className="font-bold w-24 text-right">m² Construidos</TableHead>
                        <TableHead className="font-bold w-24 text-right">m² Habitables</TableHead>
                        <TableHead className="font-bold w-24 text-right">m² Construcción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {spaces.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            No hay espacios registrados
                          </TableCell>
                        </TableRow>
                      ) : (
                        <>
                          {[...spaces].sort((a, b) => a.name.localeCompare(b.name)).map(space => (
                            <TableRow key={space.id}>
                              <TableCell className="font-medium">{space.name}</TableCell>
                              <TableCell>{space.space_type}</TableCell>
                              <TableCell>{space.level}</TableCell>
                              <TableCell className="text-right font-mono">{formatNumber(space.m2_built || 0)}</TableCell>
                              <TableCell className="text-right font-mono">{formatNumber(space.m2_livable || 0)}</TableCell>
                              <TableCell className="text-right font-mono">{formatNumber(getM2Construction(space))}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-primary/10 font-bold">
                            <TableCell colSpan={3}>TOTAL</TableCell>
                            <TableCell className="text-right">{formatNumber(spacesTotals.m2_built)}</TableCell>
                            <TableCell className="text-right">{formatNumber(spacesTotals.m2_livable)}</TableCell>
                            <TableCell className="text-right">{formatNumber(spacesTotals.m2_construction)}</TableCell>
                          </TableRow>
                        </>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
              )}

              {/* Section: Spaces List by Level/Type - only if selected */}
              {selectedSections.includes('spaces-grouped') && (
              <div className="print-section">
                <h3 className="text-lg font-bold text-primary mb-4">2. LISTADO DE ESPACIOS (POR NIVEL/TIPO)</h3>
                
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-primary/10">
                        <TableHead className="font-bold">Nombre</TableHead>
                        <TableHead className="font-bold">Tipo</TableHead>
                        <TableHead className="font-bold">Nivel</TableHead>
                        <TableHead className="font-bold w-24 text-right">m² Construidos</TableHead>
                        <TableHead className="font-bold w-24 text-right">m² Habitables</TableHead>
                        <TableHead className="font-bold w-24 text-right">m² Construcción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {spaces.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            No hay espacios registrados
                          </TableCell>
                        </TableRow>
                      ) : (
                        <>
                          {Object.entries(getSpacesByLevelAndType()).map(([level, typeData]) => {
                            const levelTotals = getLevelTotals(typeData);
                            return (
                              <React.Fragment key={`level-${level}`}>
                                {/* Level Header */}
                                <TableRow className="bg-primary text-primary-foreground">
                                  <TableCell colSpan={3} className="font-bold">{level}</TableCell>
                                  <TableCell className="text-right font-bold">{formatNumber(levelTotals.m2_built)}</TableCell>
                                  <TableCell className="text-right font-bold">{formatNumber(levelTotals.m2_livable)}</TableCell>
                                  <TableCell className="text-right font-bold">{formatNumber(levelTotals.m2_construction)}</TableCell>
                                </TableRow>
                                
                                {/* Types within Level */}
                                {Object.entries(typeData).map(([type, typeSpaces]) => (
                                  <React.Fragment key={`type-${level}-${type}`}>
                                    {/* Type SubHeader */}
                                    <TableRow className="bg-muted/50">
                                      <TableCell colSpan={6} className="font-semibold text-muted-foreground pl-6">{type}</TableCell>
                                    </TableRow>
                                    {typeSpaces.map(space => (
                                      <TableRow key={space.id}>
                                        <TableCell className="pl-10 font-medium">{space.name}</TableCell>
                                        <TableCell>{space.space_type}</TableCell>
                                        <TableCell>{space.level}</TableCell>
                                        <TableCell className="text-right font-mono">{formatNumber(space.m2_built || 0)}</TableCell>
                                        <TableCell className="text-right font-mono">{formatNumber(space.m2_livable || 0)}</TableCell>
                                        <TableCell className="text-right font-mono">{formatNumber(getM2Construction(space))}</TableCell>
                                      </TableRow>
                                    ))}
                                  </React.Fragment>
                                ))}
                              </React.Fragment>
                            );
                          })}
                          <TableRow className="bg-green-500 text-white font-bold">
                            <TableCell colSpan={3}>TOTAL GENERAL</TableCell>
                            <TableCell className="text-right">{formatNumber(spacesTotals.m2_built)}</TableCell>
                            <TableCell className="text-right">{formatNumber(spacesTotals.m2_livable)}</TableCell>
                            <TableCell className="text-right">{formatNumber(spacesTotals.m2_construction)}</TableCell>
                          </TableRow>
                        </>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
              )}

              {/* Footer */}
              <div className="text-center text-xs text-muted-foreground pt-4 border-t print:mt-8">
                <p>{[companySettings.name, companySettings.email, companySettings.phone, companySettings.website].filter(Boolean).join(' | ')}</p>
              </div>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t print:hidden">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

