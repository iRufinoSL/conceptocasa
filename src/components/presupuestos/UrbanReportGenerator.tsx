import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  FileDown, 
  MapPin, 
  Building2, 
  FileText, 
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Ruler,
  Home,
  Info,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useCompanySettings } from '@/hooks/useCompanySettings';

interface ConsultedSource {
  name: string;
  type: string;
  url?: string;
  date?: string;
}

interface UrbanProfile {
  id: string;
  cadastral_reference: string;
  municipality: string | null;
  province: string | null;
  autonomous_community: string | null;
  locality: string | null;
  address: string | null;
  surface_area: number | null;
  land_use: string | null;
  land_class: string | null;
  urban_classification: string | null;
  urban_qualification: string | null;
  soil_category: string | null;
  soil_category_source: string | null;
  principal_use: string | null;
  principal_use_source: string | null;
  permitted_uses: Json | null;
  compatible_uses: Json | null;
  prohibited_uses: Json | null;
  building_typology: string | null;
  building_typology_source: string | null;
  implantation_conditions: string | null;
  implantation_conditions_source: string | null;
  consulted_sources: Json | null;
  buildability_index: number | null;
  buildability_index_source: string | null;
  max_height: number | null;
  max_height_source: string | null;
  max_floors: number | null;
  max_floors_source: string | null;
  max_occupation_percent: number | null;
  max_occupation_source: string | null;
  max_built_surface: number | null;
  max_built_surface_source: string | null;
  front_setback: number | null;
  front_setback_source: string | null;
  side_setback: number | null;
  side_setback_source: string | null;
  rear_setback: number | null;
  rear_setback_source: string | null;
  road_setback: number | null;
  road_setback_source: string | null;
  municipal_road_setback: number | null;
  municipal_road_setback_source: string | null;
  highway_setback: number | null;
  highway_setback_source: string | null;
  min_distance_neighbors: number | null;
  min_distance_neighbors_source: string | null;
  fence_setback: number | null;
  fence_setback_source: string | null;
  access_width: number | null;
  access_width_source: string | null;
  // Sectoral restrictions
  affected_by_power_lines: boolean | null;
  affected_by_cemetery: boolean | null;
  affected_by_water_courses: boolean | null;
  affected_by_coast: boolean | null;
  affected_by_airport: boolean | null;
  affected_by_forest: boolean | null;
  affected_by_heritage: boolean | null;
  affected_by_livestock_route: boolean | null;
  min_distance_cemetery: number | null;
  min_distance_power_lines: number | null;
  min_distance_water_courses: number | null;
  min_distance_railway: number | null;
  min_distance_pipeline: number | null;
  min_distance_coast: number | null;
  min_distance_forest: number | null;
  min_distance_airport: number | null;
  max_height_airport: number | null;
  // Coordinates
  google_maps_lat: number | null;
  google_maps_lng: number | null;
  // Buildability
  is_buildable: boolean | null;
  is_buildable_source: string | null;
  analysis_notes: string | null;
}

interface UrbanReportGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetId: string;
  budgetName: string;
}

// Registry URLs by autonomous community
const PLANNING_REGISTRIES: Record<string, { name: string; url: string }> = {
  'Asturias': {
    name: 'Registro de Planeamiento Urbanístico del Principado de Asturias',
    url: 'https://visor.asturias.es/visor/'
  },
  'Andalucía': {
    name: 'Registro Autonómico de Instrumentos de Planeamiento (RAIP)',
    url: 'https://www.juntadeandalucia.es/institutodeestadisticaycartografia/RAIP/'
  },
  'Cataluña': {
    name: 'Registre de Planejament Urbanístic de Catalunya',
    url: 'https://ptop.gencat.cat/rpucportal/'
  },
  'Madrid': {
    name: 'Registro de Planeamiento Urbanístico de la Comunidad de Madrid',
    url: 'https://idem.madrid.org/visor/'
  },
  'Valencia': {
    name: 'Visor de Planeamiento de la Comunitat Valenciana',
    url: 'https://visor.gva.es/visor/'
  },
  'Galicia': {
    name: 'Planeamento Urbanístico de Galicia',
    url: 'https://cmatv.xunta.gal/planeamento'
  },
  'País Vasco': {
    name: 'Udalplan - Sistema de Información Geográfica de Planeamiento',
    url: 'https://www.geo.euskadi.eus/udalplan'
  },
  'Castilla y León': {
    name: 'Archivo de Planeamiento Urbanístico de Castilla y León',
    url: 'https://visor.idecyl.jcyl.es/'
  },
  'Aragón': {
    name: 'Sistema de Información Urbanística de Aragón (SIPCA)',
    url: 'https://idearagon.aragon.es/'
  },
  'Canarias': {
    name: 'IDE Canarias - Planeamiento',
    url: 'https://visor.grafcan.es/visorweb/'
  },
  'Murcia': {
    name: 'Sistema de Información Territorial de la Región de Murcia',
    url: 'https://sitmurcia.carm.es/'
  },
  'Navarra': {
    name: 'SITNA - Sistema de Información Territorial de Navarra',
    url: 'https://sitna.navarra.es/navegar/'
  },
  'Extremadura': {
    name: 'IDE Extremadura - Urbanismo',
    url: 'https://ideex.es/'
  },
  'Baleares': {
    name: 'IDEIB - Infraestructura de Datos Espaciales de las Islas Baleares',
    url: 'https://ideib.caib.es/'
  },
  'Cantabria': {
    name: 'IDE Cantabria - Planeamiento',
    url: 'https://mapas.cantabria.es/'
  },
  'La Rioja': {
    name: 'IDERioja - Planeamiento Urbanístico',
    url: 'https://www.iderioja.larioja.org/'
  },
  'Castilla-La Mancha': {
    name: 'IDE Castilla-La Mancha - Urbanismo',
    url: 'https://castillalamancha.maps.arcgis.com/'
  }
};

export function UrbanReportGenerator({ open, onOpenChange, budgetId, budgetName }: UrbanReportGeneratorProps) {
  const { settings: companySettings } = useCompanySettings();
  const [profile, setProfile] = useState<UrbanProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [selectedSections, setSelectedSections] = useState<string[]>([
    'identification',
    'applicable_regulations',
    'classification',
    'uses',
    'housing_conditions',
    'building_conditions',
    'sectoral',
    'other_considerations',
    'conclusion',
    'disclaimer'
  ]);

  useEffect(() => {
    if (open) {
      fetchProfile();
    }
  }, [open, budgetId]);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('urban_profiles')
        .select('*')
        .eq('budget_id', budgetId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setProfile(data as UrbanProfile);
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast.error('Error al cargar el perfil urbanístico');
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section: string) => {
    setSelectedSections(prev =>
      prev.includes(section)
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  const getConsultedSources = (): ConsultedSource[] => {
    const sources: ConsultedSource[] = [];
    
    // Add Catastro as default source
    sources.push({
      name: 'Sede Electrónica del Catastro',
      type: 'Catastro',
      url: 'https://www.sedecatastro.gob.es/',
      date: format(new Date(), 'dd/MM/yyyy')
    });

    // Add regional planning registry based on autonomous community
    if (profile?.autonomous_community || profile?.province) {
      const region = profile.autonomous_community || profile.province;
      // Find matching registry
      for (const [key, registry] of Object.entries(PLANNING_REGISTRIES)) {
        if (region?.toLowerCase().includes(key.toLowerCase()) || 
            key.toLowerCase().includes(region?.toLowerCase() || '')) {
          sources.push({
            name: registry.name,
            type: 'Registro de Planeamiento',
            url: registry.url,
            date: format(new Date(), 'dd/MM/yyyy')
          });
          break;
        }
      }
    }

    // Add PGOU if mentioned in analysis notes or sources
    if (profile?.municipality) {
      sources.push({
        name: `Plan General de Ordenación Urbana de ${profile.municipality}`,
        type: 'PGOU',
        date: format(new Date(), 'dd/MM/yyyy')
      });
    }

    // Add any stored consulted sources
    if (profile?.consulted_sources && Array.isArray(profile.consulted_sources)) {
      const storedSources = profile.consulted_sources as unknown as ConsultedSource[];
      storedSources.forEach(s => {
        if (s && typeof s === 'object' && 'name' in s && !sources.find(existing => existing.name === s.name)) {
          sources.push(s);
        }
      });
    }

    return sources;
  };

  const getSectoralRestrictions = () => {
    const restrictions: { name: string; affected: boolean | null; distance?: number | null; notes?: string }[] = [];
    
    if (profile) {
      restrictions.push(
        { name: 'Líneas eléctricas de alta tensión', affected: profile.affected_by_power_lines, distance: profile.min_distance_power_lines },
        { name: 'Dominio público hidráulico (cauces)', affected: profile.affected_by_water_courses, distance: profile.min_distance_water_courses },
        { name: 'Cementerios', affected: profile.affected_by_cemetery, distance: profile.min_distance_cemetery },
        { name: 'Ley de Costas (DPMT)', affected: profile.affected_by_coast, distance: profile.min_distance_coast },
        { name: 'Servidumbres aeronáuticas (AESA)', affected: profile.affected_by_airport, distance: profile.min_distance_airport },
        { name: 'Montes y terreno forestal', affected: profile.affected_by_forest, distance: profile.min_distance_forest },
        { name: 'Patrimonio histórico', affected: profile.affected_by_heritage },
        { name: 'Vías pecuarias', affected: profile.affected_by_livestock_route },
        { name: 'Ferrocarril', affected: null, distance: profile.min_distance_railway },
        { name: 'Gasoducto/Oleoducto', affected: null, distance: profile.min_distance_pipeline }
      );
    }
    
    return restrictions.filter(r => r.affected !== null || r.distance !== null);
  };

  const generatePDF = async () => {
    if (!profile) return;
    
    setGenerating(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      let yPos = margin;

      // Company info
      const companyName = companySettings.name || 'Informe Urbanístico';
      const companyInitials = companyName.substring(0, 2).toUpperCase();

      // Header - Try to load company logo, fallback to initials
      let logoLoaded = false;
      const logoUrl = companySettings.logo_signed_url || companySettings.logo_url;
      
      if (logoUrl) {
        try {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise<void>((resolve, reject) => {
            img.onload = () => {
              try {
                // Calculate dimensions maintaining aspect ratio
                const maxHeight = 20;
                const maxWidth = 40;
                let width = img.width;
                let height = img.height;
                
                if (height > maxHeight) {
                  width = (width * maxHeight) / height;
                  height = maxHeight;
                }
                if (width > maxWidth) {
                  height = (height * maxWidth) / width;
                  width = maxWidth;
                }
                
                doc.addImage(img, 'PNG', margin, yPos, width, height);
                logoLoaded = true;
                resolve();
              } catch (e) {
                console.error('Error adding logo to PDF:', e);
                reject(e);
              }
            };
            img.onerror = () => reject(new Error('Failed to load logo'));
            img.src = logoUrl;
          });
        } catch (e) {
          console.warn('Could not load company logo, using initials fallback');
          logoLoaded = false;
        }
      }

      // Fallback to initials if logo not loaded
      if (!logoLoaded) {
        doc.setFillColor(37, 99, 235);
        doc.roundedRect(margin, yPos, 20, 20, 2, 2, 'F');
        doc.setTextColor(255);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(companyInitials, margin + 10, yPos + 13, { align: 'center' });
        doc.setTextColor(0);
      }

      const textXOffset = logoLoaded ? margin + 45 : margin + 25;

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(37, 99, 235);
      doc.text(companyName, textXOffset, yPos + 8);
      doc.setTextColor(100);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const contactInfo = [companySettings.email, companySettings.phone].filter(Boolean).join(' | ');
      if (contactInfo) doc.text(contactInfo, textXOffset, yPos + 14);
      if (companySettings.address) doc.text(companySettings.address, textXOffset, yPos + 19);
      doc.setTextColor(0);

      yPos += 30;
      doc.setDrawColor(200);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 10;

      // Title
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(37, 99, 235);
      doc.text('PRE-INFORME URBANÍSTICO', pageWidth / 2, yPos, { align: 'center' });
      yPos += 8;
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text('(Carácter informativo - No vinculante)', pageWidth / 2, yPos, { align: 'center' });
      doc.setTextColor(0);
      yPos += 12;

      // 1. Identification
      if (selectedSections.includes('identification')) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text('1. IDENTIFICACIÓN DE LA PARCELA', margin, yPos);
        doc.setTextColor(0);
        yPos += 8;

        // Extract polígono y parcela from cadastral reference
        const ref = profile.cadastral_reference;
        let poligono = '-';
        let parcela = '-';
        if (ref && ref.length >= 14) {
          // Format: XXXXXAYYYZZZZZZ (municipal code + sector + polygon + parcel)
          poligono = ref.substring(5, 8);
          parcela = ref.substring(8, 13);
        }

        const identData = [
          ['Referencia Catastral', profile.cadastral_reference],
          ['Polígono', poligono],
          ['Parcela', parcela],
          ['Municipio', profile.municipality || '-'],
          ['Provincia', profile.province || '-'],
          ['Comunidad Autónoma', profile.autonomous_community || '-'],
          ['Localidad', profile.locality || '-'],
          ['Dirección', profile.address || '-'],
          ['Superficie (m²)', profile.surface_area ? profile.surface_area.toLocaleString('es-ES') : '-']
        ];

        autoTable(doc, {
          startY: yPos,
          head: [],
          body: identData,
          theme: 'plain',
          styles: { fontSize: 9, cellPadding: 2 },
          columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
          margin: { left: margin, right: margin }
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;
      }

      // 2. Applicable Regulations (Normativa Urbanística Aplicable)
      if (selectedSections.includes('applicable_regulations')) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text('2. NORMATIVA URBANÍSTICA APLICABLE', margin, yPos);
        doc.setTextColor(0);
        yPos += 6;
        
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        
        const regulations = [
          'Decreto Legislativo 1/2004 - Texto Refundido de Ordenación del Territorio y Urbanismo (TROTU)',
          'Real Decreto Legislativo 7/2015 - Texto Refundido de la Ley de Suelo y Rehabilitación Urbana (TRLSRU)',
          `Plan General de Ordenación de ${profile.municipality || 'la localidad'} (PGMO)`,
          'Normativa autonómica de ordenación del territorio aplicable'
        ];
        
        regulations.forEach(reg => {
          doc.text('• ' + reg, margin + 3, yPos);
          yPos += 4;
        });
        
        // Add consulted sources
        const sources = getConsultedSources();
        yPos += 4;
        doc.setFont('helvetica', 'bold');
        doc.text('Fuentes consultadas:', margin, yPos);
        doc.setFont('helvetica', 'normal');
        yPos += 4;
        sources.forEach(s => {
          doc.text(`• ${s.name} (${s.type})`, margin + 3, yPos);
          yPos += 4;
        });
        yPos += 6;
      }

      // 3. Soil Classification
      if (selectedSections.includes('classification')) {
        if (yPos > pageHeight - 80) {
          doc.addPage();
          yPos = margin;
        }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text('3. CLASIFICACIÓN Y CATEGORÍA DEL SUELO', margin, yPos);
        doc.setTextColor(0);
        yPos += 8;

        const classData = [
          ['Clasificación del suelo', profile.urban_classification || profile.land_class || '-'],
          ['Calificación urbanística', profile.urban_qualification || '-'],
          ['Categoría específica', profile.soil_category || '-'],
          ['Uso característico Catastro', profile.land_use || '-']
        ];

        autoTable(doc, {
          startY: yPos,
          head: [],
          body: classData,
          theme: 'plain',
          styles: { fontSize: 9, cellPadding: 2 },
          columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
          margin: { left: margin, right: margin }
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;
      }

      // 4. Urbanistic Uses
      if (selectedSections.includes('uses')) {
        if (yPos > pageHeight - 80) {
          doc.addPage();
          yPos = margin;
        }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text('4. USOS URBANÍSTICOS', margin, yPos);
        doc.setTextColor(0);
        yPos += 8;

        // Principal use
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('4.1. Uso principal permitido', margin, yPos);
        doc.setFont('helvetica', 'normal');
        yPos += 5;
        doc.setFontSize(9);
        doc.text(profile.principal_use || 'Residencial unifamiliar (por determinar)', margin + 5, yPos);
        yPos += 8;

        // Compatible uses
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('4.2. Usos compatibles', margin, yPos);
        doc.setFont('helvetica', 'normal');
        yPos += 5;
        doc.setFontSize(9);
        const compatibleUses = Array.isArray(profile.compatible_uses) 
          ? (profile.compatible_uses as string[]).join(', ') 
          : 'Por determinar según normativa municipal';
        doc.text(compatibleUses, margin + 5, yPos, { maxWidth: pageWidth - margin * 2 - 5 });
        yPos += 8;

        // Prohibited uses
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('4.3. Usos prohibidos', margin, yPos);
        doc.setFont('helvetica', 'normal');
        yPos += 5;
        doc.setFontSize(9);
        const prohibitedUses = Array.isArray(profile.prohibited_uses) 
          ? (profile.prohibited_uses as string[]).join(', ') 
          : 'Industrial, comercial intensivo, y demás no autorizados expresamente';
        doc.text(prohibitedUses, margin + 5, yPos, { maxWidth: pageWidth - margin * 2 - 5 });
        yPos += 12;
      }

      // 5. Housing Conditions (Condiciones de la vivienda) - based on Siero format
      if (selectedSections.includes('housing_conditions')) {
        if (yPos > pageHeight - 80) {
          doc.addPage();
          yPos = margin;
        }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text('5. CONDICIONES DE LA VIVIENDA', margin, yPos);
        doc.setTextColor(0);
        yPos += 8;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        
        // Parcela mínima
        doc.setFont('helvetica', 'bold');
        doc.text('Parcela mínima edificable:', margin, yPos);
        doc.setFont('helvetica', 'normal');
        yPos += 4;
        doc.text('Dentro del Núcleo Rural no existe parcela mínima edificable, pudiendo construir en la parcela', margin + 3, yPos);
        yPos += 4;
        doc.text('siempre que se cumplan las condiciones mínimas de retranqueos, ocupación y superficie mínima.', margin + 3, yPos);
        yPos += 6;

        // Ocupación máxima
        doc.setFont('helvetica', 'bold');
        doc.text('Ocupación máxima:', margin, yPos);
        doc.setFont('helvetica', 'normal');
        yPos += 4;
        const ocupacion = profile.max_occupation_percent ? `${profile.max_occupation_percent}%` : '50%';
        doc.text(`La ocupación máxima de las construcciones sobre el terreno se fija en ${ocupacion},`, margin + 3, yPos);
        yPos += 4;
        doc.text('incluyéndose indistintamente edificación principal y auxiliar.', margin + 3, yPos);
        yPos += 6;

        // Superficie máxima
        doc.setFont('helvetica', 'bold');
        doc.text('Superficie máxima construida:', margin, yPos);
        doc.setFont('helvetica', 'normal');
        yPos += 4;
        const supMax = profile.max_built_surface ? `${profile.max_built_surface} m²` : '300 m²';
        doc.text(`Se establece la superficie máxima de ${supMax} construidos sobre rasante para las edificaciones.`, margin + 3, yPos);
        yPos += 8;

        // Usos vinculados
        doc.setFont('helvetica', 'bold');
        doc.text('Usos vinculados a la vivienda:', margin, yPos);
        doc.setFont('helvetica', 'normal');
        yPos += 4;
        doc.text('Dentro del programa normal de la vivienda familiar se incluyen los usos de almacenaje de', margin + 3, yPos);
        yPos += 4;
        doc.text('enseres domésticos y el encierro de vehículos, dentro de la edificación principal o anejos.', margin + 3, yPos);
        yPos += 10;
      }

      // 6. Building Conditions
      if (selectedSections.includes('building_conditions')) {
        if (yPos > pageHeight - 100) {
          doc.addPage();
          yPos = margin;
        }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text('5. CONDICIONES DE EDIFICACIÓN', margin, yPos);
        doc.setTextColor(0);
        yPos += 8;

        // 5.1 Typology
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('5.1. Tipología edificatoria', margin, yPos);
        doc.setFont('helvetica', 'normal');
        yPos += 5;
        doc.setFontSize(9);
        doc.text(profile.building_typology || 'Vivienda unifamiliar aislada', margin + 5, yPos);
        yPos += 8;

        // 5.2 Setbacks
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('5.2. Retranqueos y distancias', margin, yPos);
        yPos += 6;

        const setbackData = [
          ['A linderos (frontal)', profile.front_setback ? `${profile.front_setback} m` : '-', profile.front_setback_source || ''],
          ['A linderos (lateral)', profile.side_setback ? `${profile.side_setback} m` : '-', profile.side_setback_source || ''],
          ['A linderos (posterior)', profile.rear_setback ? `${profile.rear_setback} m` : '-', profile.rear_setback_source || ''],
          ['A vecinos', profile.min_distance_neighbors ? `${profile.min_distance_neighbors} m` : '-', profile.min_distance_neighbors_source || ''],
          ['A caminos municipales', profile.municipal_road_setback ? `${profile.municipal_road_setback} m` : '-', profile.municipal_road_setback_source || ''],
          ['A carreteras', profile.road_setback ? `${profile.road_setback} m` : '-', profile.road_setback_source || ''],
          ['A autovías/autopistas', profile.highway_setback ? `${profile.highway_setback} m` : '-', profile.highway_setback_source || ''],
          ['Cierre de parcela', profile.fence_setback ? `${profile.fence_setback} m` : '-', profile.fence_setback_source || '']
        ];

        autoTable(doc, {
          startY: yPos,
          head: [['Concepto', 'Distancia', 'Fuente']],
          body: setbackData,
          theme: 'striped',
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [37, 99, 235] },
          margin: { left: margin, right: margin }
        });
        yPos = (doc as any).lastAutoTable.finalY + 8;

        // 5.3 Heights
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('5.3. Alturas máximas', margin, yPos);
        yPos += 6;

        const heightData = [
          ['Altura máxima', profile.max_height ? `${profile.max_height} m` : '-', profile.max_height_source || ''],
          ['Número máximo de plantas', profile.max_floors ? `${profile.max_floors}` : '-', profile.max_floors_source || '']
        ];

        if (profile.max_height_airport) {
          heightData.push(['Altura máx. (servidumbre aeronáutica)', `${profile.max_height_airport} m`, 'AESA']);
        }

        autoTable(doc, {
          startY: yPos,
          head: [['Concepto', 'Valor', 'Fuente']],
          body: heightData,
          theme: 'striped',
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [37, 99, 235] },
          margin: { left: margin, right: margin }
        });
        yPos = (doc as any).lastAutoTable.finalY + 8;

        // 5.4 Occupation and buildability
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('5.4. Ocupación y edificabilidad', margin, yPos);
        yPos += 6;

        const buildData = [
          ['Ocupación máxima', profile.max_occupation_percent ? `${profile.max_occupation_percent}%` : '-', profile.max_occupation_source || ''],
          ['Edificabilidad', profile.buildability_index ? `${profile.buildability_index} m²/m²` : '-', profile.buildability_index_source || ''],
          ['Superficie máxima construible', profile.max_built_surface ? `${profile.max_built_surface} m²` : '-', profile.max_built_surface_source || ''],
          ['Ancho mínimo de acceso', profile.access_width ? `${profile.access_width} m` : '-', profile.access_width_source || '']
        ];

        autoTable(doc, {
          startY: yPos,
          head: [['Concepto', 'Valor', 'Fuente']],
          body: buildData,
          theme: 'striped',
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [37, 99, 235] },
          margin: { left: margin, right: margin }
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;
      }

      // 7. Sectoral Restrictions
      if (selectedSections.includes('sectoral')) {
        if (yPos > pageHeight - 80) {
          doc.addPage();
          yPos = margin;
        }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text('7. AFECCIONES Y LIMITACIONES SECTORIALES', margin, yPos);
        doc.setTextColor(0);
        yPos += 6;
        
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text('Procede advertir de las siguientes afecciones sectoriales que podrían condicionar', margin, yPos);
        yPos += 4;
        doc.text('las posibilidades de edificación:', margin, yPos);
        yPos += 6;

        const restrictions = getSectoralRestrictions();
        
        if (restrictions.length > 0) {
          restrictions.forEach(r => {
            if (r.affected === true || r.distance) {
              doc.setFont('helvetica', 'bold');
              doc.text(`• ${r.name}:`, margin + 3, yPos);
              doc.setFont('helvetica', 'normal');
              yPos += 4;
              if (r.distance) {
                doc.text(`  Distancia mínima: ${r.distance} m. Deberán respetarse las limitaciones de la normativa sectorial.`, margin + 5, yPos);
              } else {
                doc.text(`  Afectada. Consultar con el organismo competente.`, margin + 5, yPos);
              }
              yPos += 5;
            }
          });
        } else {
          doc.text('No se han identificado afecciones sectoriales significativas. No obstante, deberán', margin + 3, yPos);
          yPos += 4;
          doc.text('comprobarse mediante consultas sectoriales específicas en fase de proyecto.', margin + 3, yPos);
          yPos += 5;
        }

        yPos += 4;
        doc.setFontSize(8);
        doc.setTextColor(100);
        const sectoralNote = 'Organismos a consultar: Confederación Hidrográfica, Consejería de Infraestructuras, AESA, Consejería de Medio Ambiente, etc.';
        doc.text(sectoralNote, margin, yPos);
        doc.setTextColor(0);
        yPos += 10;
      }

      // 8. Other Considerations (Otras Consideraciones) - based on Siero format
      if (selectedSections.includes('other_considerations')) {
        if (yPos > pageHeight - 80) {
          doc.addPage();
          yPos = margin;
        }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text('8. OTRAS CONSIDERACIONES', margin, yPos);
        doc.setTextColor(0);
        yPos += 6;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        
        // Servicios mínimos
        doc.setFont('helvetica', 'bold');
        doc.text('Servicios mínimos exigibles:', margin, yPos);
        doc.setFont('helvetica', 'normal');
        yPos += 4;
        doc.text('Conforme a la normativa vigente, no podrá autorizarse ninguna clase de edificaciones si no', margin + 3, yPos);
        yPos += 4;
        doc.text('estuviera resuelta la disponibilidad de los servicios de: acceso rodado, saneamiento,', margin + 3, yPos);
        yPos += 4;
        doc.text('abastecimiento de agua y energía eléctrica.', margin + 3, yPos);
        yPos += 6;

        // Levantamiento topográfico
        doc.setFont('helvetica', 'bold');
        doc.text('Recomendación:', margin, yPos);
        doc.setFont('helvetica', 'normal');
        yPos += 4;
        doc.text('Para comprobar la superficie de la parcela realmente apta para situar la edificación, se', margin + 3, yPos);
        yPos += 4;
        doc.text('recomienda la realización de un levantamiento topográfico donde se señalen todas las', margin + 3, yPos);
        yPos += 4;
        doc.text('servidumbres, de modo que pueda comprobarse que el espacio no afectado sea suficiente.', margin + 3, yPos);
        yPos += 6;

        // Additional notes
        if (additionalNotes.trim()) {
          yPos += 2;
          doc.setFont('helvetica', 'bold');
          doc.text('Observaciones adicionales:', margin, yPos);
          doc.setFont('helvetica', 'normal');
          yPos += 4;
          const notesLines = doc.splitTextToSize(additionalNotes, pageWidth - margin * 2 - 5);
          doc.text(notesLines, margin + 3, yPos);
          yPos += notesLines.length * 4;
        }
        yPos += 10;
      }

      // 9. Conclusion
      if (selectedSections.includes('conclusion')) {
        if (yPos > pageHeight - 80) {
          doc.addPage();
          yPos = margin;
        }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text('9. CONCLUSIÓN URBANÍSTICA', margin, yPos);
        doc.setTextColor(0);
        yPos += 8;

        // Buildability badge
        const isBuildable = profile.is_buildable;
        if (isBuildable === true) {
          doc.setFillColor(34, 197, 94);
        } else if (isBuildable === false) {
          doc.setFillColor(239, 68, 68);
        } else {
          doc.setFillColor(156, 163, 175);
        }
        doc.roundedRect(margin, yPos, 50, 8, 2, 2, 'F');
        doc.setTextColor(255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        const buildableText = isBuildable === true ? '✓ EDIFICABLE' : isBuildable === false ? '✗ NO EDIFICABLE' : 'POR DETERMINAR';
        doc.text(buildableText, margin + 25, yPos + 5.5, { align: 'center' });
        doc.setTextColor(0);
        doc.setFont('helvetica', 'normal');
        yPos += 14;

        // Conclusion text following Siero format
        doc.setFontSize(9);
        const municipality = profile.municipality || 'el municipio';
        const classification = profile.urban_classification || profile.land_class || 'suelo apto para edificación';
        const category = profile.soil_category ? ` en categoría de ${profile.soil_category}` : '';
        
        if (isBuildable === true) {
          const conclusionText = `Siempre que no proceda de una parcelación ilegal, la parcela con referencia catastral ${profile.cadastral_reference} resultaría EDIFICABLE en las condiciones establecidas en el Plan General vigente, siendo su capacidad edificatoria la equivalente a una edificación destinada a uso residencial, vivienda familiar aislada, de superficie máxima construida ${profile.max_built_surface || 300}m², por razón de su clasificación como ${classification}${category}.`;
          const conclusionLines = doc.splitTextToSize(conclusionText, pageWidth - margin * 2);
          doc.text(conclusionLines, margin, yPos);
          yPos += conclusionLines.length * 4 + 4;
          
          // Condicionantes
          doc.setFont('helvetica', 'bold');
          doc.text('Condicionantes:', margin, yPos);
          doc.setFont('helvetica', 'normal');
          yPos += 4;
          doc.text('• Las condiciones de edificabilidad quedan supeditadas a la disponibilidad de servicios.', margin + 3, yPos);
          yPos += 4;
          doc.text('• Los gastos de acometidas y conexiones correrán a cargo del solicitante de la licencia.', margin + 3, yPos);
          yPos += 4;
          doc.text('• Deberá cumplir con toda la normativa sectorial aplicable.', margin + 3, yPos);
        } else if (isBuildable === false) {
          const conclusionText = `La parcela con referencia catastral ${profile.cadastral_reference} NO resulta edificable según la información analizada. ${profile.is_buildable_source || ''}`;
          const conclusionLines = doc.splitTextToSize(conclusionText, pageWidth - margin * 2);
          doc.text(conclusionLines, margin, yPos);
        } else {
          const conclusionText = `La edificabilidad de la parcela con referencia catastral ${profile.cadastral_reference} está pendiente de determinación definitiva. Se recomienda solicitar Certificado Urbanístico oficial al Ayuntamiento de ${municipality} para confirmación.`;
          const conclusionLines = doc.splitTextToSize(conclusionText, pageWidth - margin * 2);
          doc.text(conclusionLines, margin, yPos);
        }
        yPos += 10;
      }

      // 10. Disclaimer
      if (selectedSections.includes('disclaimer')) {
        if (yPos > pageHeight - 60) {
          doc.addPage();
          yPos = margin;
        }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text('10. CARÁCTER DEL INFORME', margin, yPos);
        doc.setTextColor(0);
        yPos += 8;

        doc.setFillColor(254, 243, 199);
        doc.roundedRect(margin, yPos, pageWidth - margin * 2, 30, 2, 2, 'F');
        yPos += 5;

        doc.setFontSize(8);
        doc.text('Este informe tiene carácter:', margin + 5, yPos);
        yPos += 4;
        doc.text('• Informativo', margin + 10, yPos);
        yPos += 4;
        doc.text('• No vinculante', margin + 10, yPos);
        yPos += 4;
        doc.text('• Elaborado conforme a normativa pública vigente', margin + 10, yPos);
        yPos += 6;
        doc.setFont('helvetica', 'bold');
        doc.text('👉 No sustituye al Certificado Urbanístico oficial emitido por el Ayuntamiento,', margin + 5, yPos);
        yPos += 4;
        doc.text('pero es válido como base técnica para decisiones de inversión, anteproyecto y solicitud de licencia.', margin + 5, yPos);
        doc.setFont('helvetica', 'normal');
      }

      // Footer
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(
          `Página ${i} de ${totalPages} | Generado el ${format(new Date(), "d 'de' MMMM 'de' yyyy, HH:mm", { locale: es })}`,
          pageWidth / 2,
          pageHeight - 10,
          { align: 'center' }
        );
      }

      // Save PDF
      const fileName = `Pre-Informe_Urbanistico_${profile.cadastral_reference}_${format(new Date(), 'yyyyMMdd')}.pdf`;
      doc.save(fileName);
      
      toast.success('Pre-informe urbanístico generado correctamente');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Error al generar el PDF');
    } finally {
      setGenerating(false);
    }
  };

  const sectionOptions = [
    { id: 'identification', label: '1. Identificación de la parcela', icon: MapPin },
    { id: 'applicable_regulations', label: '2. Normativa urbanística aplicable', icon: FileText },
    { id: 'classification', label: '3. Clasificación y calificación del suelo', icon: Building2 },
    { id: 'uses', label: '4. Régimen de usos', icon: Home },
    { id: 'housing_conditions', label: '5. Condiciones de la vivienda', icon: Home },
    { id: 'building_conditions', label: '6. Condiciones de la edificación', icon: Ruler },
    { id: 'sectoral', label: '7. Afecciones sectoriales', icon: AlertTriangle },
    { id: 'other_considerations', label: '8. Otras consideraciones', icon: Info },
    { id: 'conclusion', label: '9. Conclusión urbanística', icon: CheckCircle2 },
    { id: 'disclaimer', label: '10. Carácter del informe', icon: Info }
  ];

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generador de Pre-Informe Urbanístico</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!profile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generador de Pre-Informe Urbanístico</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <XCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              No hay perfil urbanístico para este presupuesto.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Primero debe cargar los datos catastrales y analizar la normativa urbanística.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Generador de Pre-Informe Urbanístico
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Summary Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Parcela: {profile.cadastral_reference}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p><strong>Municipio:</strong> {profile.municipality || '-'}</p>
                <p><strong>Provincia:</strong> {profile.province || '-'}</p>
                <p><strong>Superficie:</strong> {profile.surface_area ? `${profile.surface_area.toLocaleString('es-ES')} m²` : '-'}</p>
                <div className="flex items-center gap-2 mt-2">
                  <strong>Estado:</strong>
                  <Badge 
                    variant={profile.is_buildable === true ? 'default' : profile.is_buildable === false ? 'destructive' : 'outline'}
                    className={profile.is_buildable === true ? 'bg-green-600' : ''}
                  >
                    {profile.is_buildable === true ? '✓ Edificable' : profile.is_buildable === false ? '✗ No edificable' : 'Por determinar'}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Section Selection */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Secciones a incluir</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {sectionOptions.map(section => (
                    <div key={section.id} className="flex items-center gap-2">
                      <Checkbox
                        id={section.id}
                        checked={selectedSections.includes(section.id)}
                        onCheckedChange={() => toggleSection(section.id)}
                      />
                      <Label 
                        htmlFor={section.id} 
                        className="flex items-center gap-2 cursor-pointer text-sm"
                      >
                        <section.icon className="h-4 w-4 text-muted-foreground" />
                        {section.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Sources Preview */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Fuentes que se incluirán
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {getConsultedSources().map((source, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded">
                      <div>
                        <span className="font-medium">{source.name}</span>
                        <span className="text-muted-foreground ml-2">({source.type})</span>
                      </div>
                      {source.url && (
                        <a 
                          href={source.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Additional Notes */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Observaciones adicionales</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={additionalNotes}
                  onChange={(e) => setAdditionalNotes(e.target.value)}
                  placeholder="Añada aquí cualquier observación o nota adicional que desee incluir en el informe..."
                  rows={3}
                />
              </CardContent>
            </Card>
          </div>
        </ScrollArea>

        <Separator />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={generatePDF} disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4 mr-2" />
                Generar PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}