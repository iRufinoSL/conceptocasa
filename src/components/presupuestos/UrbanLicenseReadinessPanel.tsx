import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  HelpCircle,
  Building2,
  Ruler,
  ArrowLeftRight,
  MoveVertical,
  Shield,
  ChevronDown,
  ChevronUp,
  FileText,
  Waves,
  Droplets,
  Zap,
  TreePine,
  Train,
  Landmark,
  Fence,
  Cross,
  Plane,
  Fuel
} from 'lucide-react';
import { useState } from 'react';

type ReadinessStatus = 'complete' | 'partial' | 'missing' | 'warning';

interface LicenseRequirement {
  id: string;
  title: string;
  description: string;
  status: ReadinessStatus;
  value?: string;
  source?: string;
  details?: string[];
  icon: React.ElementType;
}

interface SectoralAffection {
  id: string;
  name: string;
  affected: boolean | null;
  distance?: number | null;
  source?: string;
  icon: React.ElementType;
  regulations?: string;
}

interface UrbanProfileData {
  is_buildable: boolean | null;
  is_buildable_source: string | null;
  land_class: string | null;
  urban_classification: string | null;
  urban_qualification: string | null;
  surface_area: number | null;
  // Dimensiones edificables
  buildability_index: number | null;
  buildability_index_source: string | null;
  max_buildable_volume: number | null;
  max_buildable_volume_source: string | null;
  max_built_surface: number | null;
  max_built_surface_source: string | null;
  max_occupation_percent: number | null;
  max_occupation_source: string | null;
  min_plot_area: number | null;
  // Retranqueos
  front_setback: number | null;
  front_setback_source: string | null;
  side_setback: number | null;
  side_setback_source: string | null;
  rear_setback: number | null;
  rear_setback_source: string | null;
  min_distance_neighbors: number | null;
  min_distance_neighbors_source: string | null;
  fence_setback: number | null;
  fence_setback_source: string | null;
  // Alturas
  max_height: number | null;
  max_height_source: string | null;
  max_floors: number | null;
  max_floors_source: string | null;
  // Afecciones sectoriales
  affected_by_coast: boolean | null;
  min_distance_coast: number | null;
  min_distance_coast_source: string | null;
  affected_by_water_courses: boolean | null;
  min_distance_water_courses: number | null;
  min_distance_water_courses_source: string | null;
  affected_by_power_lines: boolean | null;
  min_distance_power_lines: number | null;
  min_distance_power_lines_source: string | null;
  affected_by_forest: boolean | null;
  min_distance_forest: number | null;
  min_distance_forest_source: string | null;
  affected_by_airport: boolean | null;
  min_distance_airport: number | null;
  min_distance_airport_source: string | null;
  max_height_airport: number | null;
  max_height_airport_source: string | null;
  affected_by_heritage: boolean | null;
  affected_by_livestock_route: boolean | null;
  min_distance_cemetery: number | null;
  min_distance_cemetery_source: string | null;
  min_distance_railway: number | null;
  min_distance_railway_source: string | null;
  min_distance_pipeline: number | null;
  min_distance_pipeline_source: string | null;
  min_distance_roads: number | null;
  min_distance_roads_source: string | null;
}

interface UrbanLicenseReadinessPanelProps {
  profile: UrbanProfileData;
}

function getStatusIcon(status: ReadinessStatus) {
  switch (status) {
    case 'complete':
      return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    case 'partial':
      return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    case 'warning':
      return <AlertTriangle className="h-5 w-5 text-orange-500" />;
    case 'missing':
      return <HelpCircle className="h-5 w-5 text-muted-foreground" />;
  }
}

function getStatusBadge(status: ReadinessStatus) {
  switch (status) {
    case 'complete':
      return <Badge className="bg-green-600 hover:bg-green-700">Completo</Badge>;
    case 'partial':
      return <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">Parcial</Badge>;
    case 'warning':
      return <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">Requiere atención</Badge>;
    case 'missing':
      return <Badge variant="outline">Pendiente</Badge>;
  }
}

export function UrbanLicenseReadinessPanel({ profile }: UrbanLicenseReadinessPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    buildability: true,
    affections: true
  });

  const toggleSection = (id: string) => {
    setExpandedSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // 1. EDIFICABILIDAD - ¿Se puede construir?
  const getBuildabilityStatus = (): LicenseRequirement => {
    const hasConclusion = profile.is_buildable !== null;
    const isBuildable = profile.is_buildable === true;
    const hasLandClass = !!profile.land_class;
    const hasClassification = !!profile.urban_classification;
    
    let status: ReadinessStatus = 'missing';
    let value = 'Por determinar';
    const details: string[] = [];
    
    if (hasConclusion) {
      status = isBuildable ? 'complete' : 'warning';
      value = isBuildable ? 'SÍ - Edificable' : 'NO - No edificable';
    } else if (hasLandClass || hasClassification) {
      status = 'partial';
      value = 'Datos parciales - Requiere verificación';
    }
    
    if (profile.land_class) details.push(`Calificación: ${profile.land_class}`);
    if (profile.urban_classification) details.push(`Clasificación: ${profile.urban_classification}`);
    if (profile.urban_qualification) details.push(`Zona: ${profile.urban_qualification}`);
    
    return {
      id: 'buildability',
      title: '1. ¿Se puede construir?',
      description: 'Determinación de edificabilidad según normativa urbanística',
      status,
      value,
      source: profile.is_buildable_source || undefined,
      details: details.length > 0 ? details : undefined,
      icon: Building2
    };
  };

  // 2. DIMENSIONES - ¿Qué volumen/superficie se puede construir?
  const getDimensionsStatus = (): LicenseRequirement => {
    const hasBuildabilityIndex = profile.buildability_index !== null;
    const hasVolume = profile.max_buildable_volume !== null;
    const hasSurface = profile.max_built_surface !== null;
    const hasOccupation = profile.max_occupation_percent !== null;
    const hasMinPlot = profile.min_plot_area !== null;
    
    const completedFields = [hasBuildabilityIndex, hasVolume, hasSurface, hasOccupation].filter(Boolean).length;
    const details: string[] = [];
    let value = '';
    
    if (hasBuildabilityIndex) {
      details.push(`Índice edificabilidad: ${profile.buildability_index} m²/m²`);
      if (profile.surface_area) {
        const maxSurface = profile.buildability_index * profile.surface_area;
        value = `Hasta ${maxSurface.toLocaleString('es-ES', { maximumFractionDigits: 0 })} m² construibles`;
      }
    }
    if (hasVolume) details.push(`Volumen máx: ${profile.max_buildable_volume} m³`);
    if (hasSurface) {
      details.push(`Superficie máx: ${profile.max_built_surface} m²`);
      if (!value) value = `Hasta ${profile.max_built_surface} m² construibles`;
    }
    if (hasOccupation) details.push(`Ocupación máx: ${profile.max_occupation_percent}%`);
    if (hasMinPlot) details.push(`Parcela mínima: ${profile.min_plot_area} m²`);
    
    let status: ReadinessStatus = 'missing';
    if (completedFields >= 3) status = 'complete';
    else if (completedFields >= 1) status = 'partial';
    
    return {
      id: 'dimensions',
      title: '2. ¿Qué se puede construir?',
      description: 'Volumen, superficie y ocupación máxima permitida',
      status,
      value: value || (completedFields > 0 ? 'Datos parciales disponibles' : 'Sin determinar'),
      source: profile.buildability_index_source || profile.max_built_surface_source || undefined,
      details: details.length > 0 ? details : undefined,
      icon: Ruler
    };
  };

  // 3. RETRANQUEOS - ¿Qué distancias a linderos?
  const getSetbacksStatus = (): LicenseRequirement => {
    const hasFront = profile.front_setback !== null;
    const hasSide = profile.side_setback !== null;
    const hasRear = profile.rear_setback !== null;
    const hasNeighbors = profile.min_distance_neighbors !== null;
    const hasFence = profile.fence_setback !== null;
    
    const completedFields = [hasFront, hasSide, hasRear, hasNeighbors].filter(Boolean).length;
    const details: string[] = [];
    
    if (hasFront) details.push(`Frontal: ${profile.front_setback} m`);
    if (hasSide) details.push(`Lateral: ${profile.side_setback} m`);
    if (hasRear) details.push(`Trasero: ${profile.rear_setback} m`);
    if (hasNeighbors) details.push(`A linderos: ${profile.min_distance_neighbors} m`);
    if (hasFence) details.push(`Cierres: ${profile.fence_setback} m`);
    
    let status: ReadinessStatus = 'missing';
    let value = 'Sin determinar';
    
    if (completedFields >= 3) {
      status = 'complete';
      value = details.slice(0, 3).join(' | ');
    } else if (completedFields >= 1) {
      status = 'partial';
      value = 'Datos parciales - Requiere completar';
    }
    
    return {
      id: 'setbacks',
      title: '3. Retranqueos y distancias',
      description: 'Distancias mínimas a linderos y límites de parcela',
      status,
      value,
      source: profile.front_setback_source || profile.side_setback_source || undefined,
      details: details.length > 0 ? details : undefined,
      icon: ArrowLeftRight
    };
  };

  // 4. ALTURA - ¿Qué altura máxima?
  const getHeightStatus = (): LicenseRequirement => {
    const hasHeight = profile.max_height !== null;
    const hasFloors = profile.max_floors !== null;
    const hasAirportHeight = profile.max_height_airport !== null;
    
    const details: string[] = [];
    let value = '';
    
    if (hasHeight) {
      details.push(`Altura máx: ${profile.max_height} m`);
      value = `${profile.max_height} metros`;
    }
    if (hasFloors) {
      details.push(`Plantas máx: ${profile.max_floors}`);
      if (value) value += ` (${profile.max_floors} plantas)`;
      else value = `${profile.max_floors} plantas`;
    }
    if (hasAirportHeight) {
      details.push(`Límite aeronáutico: ${profile.max_height_airport} m`);
    }
    
    let status: ReadinessStatus = 'missing';
    if (hasHeight && hasFloors) status = 'complete';
    else if (hasHeight || hasFloors) status = 'partial';
    
    // Warning si hay restricción aeronáutica que limita más
    if (hasAirportHeight && hasHeight && profile.max_height_airport! < profile.max_height!) {
      status = 'warning';
      value += ` ⚠️ Limitado a ${profile.max_height_airport}m por servidumbre aeronáutica`;
    }
    
    return {
      id: 'height',
      title: '4. Altura y plantas',
      description: 'Altura máxima y número de plantas permitidas',
      status,
      value: value || 'Sin determinar',
      source: profile.max_height_source || profile.max_floors_source || undefined,
      details: details.length > 0 ? details : undefined,
      icon: MoveVertical
    };
  };

  // 5. AFECCIONES - ¿Qué precauciones/normas especiales?
  const getSectoralAffections = (): SectoralAffection[] => {
    return [
      {
        id: 'coast',
        name: 'Ley de Costas',
        affected: profile.affected_by_coast,
        distance: profile.min_distance_coast,
        source: profile.min_distance_coast_source || undefined,
        icon: Waves,
        regulations: 'Servidumbre de protección (100m), tránsito (6m), zona de influencia (500m)'
      },
      {
        id: 'water',
        name: 'Cauces y ríos',
        affected: profile.affected_by_water_courses,
        distance: profile.min_distance_water_courses,
        source: profile.min_distance_water_courses_source || undefined,
        icon: Droplets,
        regulations: 'Dominio público hidráulico, zona de policía (100m), servidumbre (5m)'
      },
      {
        id: 'power',
        name: 'Líneas eléctricas',
        affected: profile.affected_by_power_lines,
        distance: profile.min_distance_power_lines,
        source: profile.min_distance_power_lines_source || undefined,
        icon: Zap,
        regulations: 'Servidumbre de paso según tensión (alta/media/baja)'
      },
      {
        id: 'forest',
        name: 'Montes/Bosques',
        affected: profile.affected_by_forest,
        distance: profile.min_distance_forest,
        source: profile.min_distance_forest_source || undefined,
        icon: TreePine,
        regulations: 'Franja de protección contra incendios (25-50m)'
      },
      {
        id: 'airport',
        name: 'Servidumbre aeronáutica',
        affected: profile.affected_by_airport,
        distance: profile.min_distance_airport,
        source: profile.min_distance_airport_source || undefined,
        icon: Plane,
        regulations: 'Superficies limitadoras, altura máxima según AESA'
      },
      {
        id: 'heritage',
        name: 'Patrimonio histórico',
        affected: profile.affected_by_heritage,
        icon: Landmark,
        regulations: 'BIC, entorno de protección, zona arqueológica'
      },
      {
        id: 'livestock',
        name: 'Vías pecuarias',
        affected: profile.affected_by_livestock_route,
        icon: Fence,
        regulations: 'Cañada (75m), cordel (37.5m), vereda (20m)'
      },
      {
        id: 'cemetery',
        name: 'Cementerios',
        affected: profile.min_distance_cemetery !== null,
        distance: profile.min_distance_cemetery,
        source: profile.min_distance_cemetery_source || undefined,
        icon: Cross,
        regulations: 'Zona sanitaria (50-200m según normativa autonómica)'
      },
      {
        id: 'railway',
        name: 'Ferrocarril',
        affected: profile.min_distance_railway !== null,
        distance: profile.min_distance_railway,
        source: profile.min_distance_railway_source || undefined,
        icon: Train,
        regulations: 'Zona de dominio público, línea de edificación'
      },
      {
        id: 'pipeline',
        name: 'Gasoducto/Oleoducto',
        affected: profile.min_distance_pipeline !== null,
        distance: profile.min_distance_pipeline,
        source: profile.min_distance_pipeline_source || undefined,
        icon: Fuel,
        regulations: 'Franja de seguridad, servidumbre de paso'
      }
    ];
  };

  const getAffectionsStatus = (): LicenseRequirement => {
    const affections = getSectoralAffections();
    const activeAffections = affections.filter(a => a.affected === true);
    const unknownAffections = affections.filter(a => a.affected === null);
    const clearAffections = affections.filter(a => a.affected === false);
    
    let status: ReadinessStatus = 'missing';
    let value = '';
    const details: string[] = [];
    
    if (activeAffections.length > 0) {
      status = 'warning';
      value = `${activeAffections.length} afección(es) detectada(s)`;
      activeAffections.forEach(a => {
        let detail = `⚠️ ${a.name}`;
        if (a.distance) detail += ` (${a.distance}m)`;
        details.push(detail);
      });
    } else if (unknownAffections.length === affections.length) {
      status = 'missing';
      value = 'No verificado - Requiere análisis';
    } else if (clearAffections.length > 0) {
      status = 'complete';
      value = 'Sin afecciones detectadas';
      details.push(`${clearAffections.length} categorías verificadas sin afección`);
    } else {
      status = 'partial';
      value = 'Verificación parcial';
    }
    
    return {
      id: 'affections',
      title: '5. Afecciones sectoriales',
      description: 'Normativas especiales que pueden afectar a la parcela',
      status,
      value,
      details: details.length > 0 ? details : undefined,
      icon: Shield
    };
  };

  const requirements = [
    getBuildabilityStatus(),
    getDimensionsStatus(),
    getSetbacksStatus(),
    getHeightStatus(),
    getAffectionsStatus()
  ];

  const completedCount = requirements.filter(r => r.status === 'complete').length;
  const warningCount = requirements.filter(r => r.status === 'warning').length;
  const overallStatus = completedCount === 5 
    ? 'complete' 
    : warningCount > 0 
      ? 'warning' 
      : completedCount >= 3 
        ? 'partial' 
        : 'missing';

  const affections = getSectoralAffections();

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${
              overallStatus === 'complete' ? 'bg-green-100 dark:bg-green-900/30' :
              overallStatus === 'warning' ? 'bg-orange-100 dark:bg-orange-900/30' :
              overallStatus === 'partial' ? 'bg-amber-100 dark:bg-amber-900/30' :
              'bg-muted'
            }`}>
              {overallStatus === 'complete' ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : overallStatus === 'warning' ? (
                <AlertTriangle className="h-6 w-6 text-orange-500" />
              ) : (
                <FileText className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div>
              <CardTitle className="text-lg">Preparación para Licencia Constructiva</CardTitle>
              <CardDescription>
                {completedCount}/5 requisitos verificados
                {warningCount > 0 && ` • ${warningCount} requiere(n) atención`}
              </CardDescription>
            </div>
          </div>
          <Badge 
            variant={overallStatus === 'complete' ? 'default' : 'outline'}
            className={`text-sm px-3 py-1 ${
              overallStatus === 'complete' ? 'bg-green-600 hover:bg-green-700' :
              overallStatus === 'warning' ? 'bg-orange-100 text-orange-800 border-orange-300' :
              ''
            }`}
          >
            {overallStatus === 'complete' ? '✓ APTO PARA LICENCIA' : 
             overallStatus === 'warning' ? '⚠️ REVISAR AFECCIONES' : 
             'EN PROCESO'}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Main 5 Requirements */}
        <div className="space-y-3">
          {requirements.map((req) => (
            <Collapsible 
              key={req.id} 
              open={expandedSections[req.id]}
              onOpenChange={() => toggleSection(req.id)}
            >
              <div className={`p-3 rounded-lg border transition-colors ${
                req.status === 'complete' ? 'bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800' :
                req.status === 'warning' ? 'bg-orange-50/50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800' :
                req.status === 'partial' ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800' :
                'bg-muted/30 border-border'
              }`}>
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(req.status)}
                      <div>
                        <div className="font-medium text-sm flex items-center gap-2">
                          <req.icon className="h-4 w-4 text-primary" />
                          {req.title}
                        </div>
                        <p className="text-xs text-muted-foreground">{req.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(req.status)}
                      {expandedSections[req.id] ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CollapsibleTrigger>
                
                <CollapsibleContent className="mt-3 pt-3 border-t border-dashed">
                  <div className="space-y-2">
                    {req.value && (
                      <div className="text-sm font-medium text-foreground">
                        {req.value}
                      </div>
                    )}
                    {req.details && req.details.length > 0 && (
                      <ul className="text-xs text-muted-foreground space-y-1">
                        {req.details.map((detail, idx) => (
                          <li key={idx} className="flex items-center gap-2">
                            <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                            {detail}
                          </li>
                        ))}
                      </ul>
                    )}
                    {req.source && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground pt-1">
                        <FileText className="h-3 w-3" />
                        <span>Fuente: {req.source}</span>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          ))}
        </div>

        {/* Sectoral Affections Detail Grid */}
        <Separator />
        
        <Collapsible 
          open={expandedSections['affections-detail']}
          onOpenChange={() => toggleSection('affections-detail')}
        >
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity py-2">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Detalle de Afecciones Sectoriales</span>
              </div>
              {expandedSections['affections-detail'] ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CollapsibleTrigger>
          
          <CollapsibleContent className="mt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {affections.map((affection) => (
                <div 
                  key={affection.id}
                  className={`p-2 rounded-lg border text-sm flex items-center justify-between ${
                    affection.affected === true ? 'bg-orange-50/50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800' :
                    affection.affected === false ? 'bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800' :
                    'bg-muted/30 border-border'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <affection.icon className={`h-4 w-4 ${
                      affection.affected === true ? 'text-orange-500' :
                      affection.affected === false ? 'text-green-600' :
                      'text-muted-foreground'
                    }`} />
                    <div>
                      <span className="font-medium">{affection.name}</span>
                      {affection.distance !== null && affection.distance !== undefined && (
                        <span className="text-xs text-muted-foreground ml-1">({affection.distance}m)</span>
                      )}
                    </div>
                  </div>
                  <div>
                    {affection.affected === true ? (
                      <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300 text-xs">
                        Afectado
                      </Badge>
                    ) : affection.affected === false ? (
                      <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300 text-xs">
                        Libre
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        Sin verificar
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-3 p-2 rounded bg-muted/50 text-xs text-muted-foreground">
              <p className="font-medium mb-1">📋 Fuentes de verificación recomendadas:</p>
              <ul className="space-y-0.5 ml-4 list-disc">
                <li>Sede Electrónica del Catastro (calificación del suelo)</li>
                <li>PGOU/Normas Subsidiarias del municipio</li>
                <li>Confederación Hidrográfica (cauces y ríos)</li>
                <li>AESA (servidumbres aeronáuticas)</li>
                <li>Dirección General de Costas</li>
                <li>Consejería de Patrimonio (BIC)</li>
              </ul>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
