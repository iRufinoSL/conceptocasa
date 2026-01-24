import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Building2,
  Scale,
  Shield,
  Hammer,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface UrbanProfile {
  id: string;
  budget_id: string;
  municipality: string | null;
  province: string | null;
  autonomous_community: string | null;
  land_class: string | null;
  cadastral_reference: string | null;
  surface_area: number | null;
  analysis_status: string | null;
  google_maps_lat: number | null;
  google_maps_lng: number | null;
}

interface PhaseResult {
  success: boolean;
  phase: number;
  phaseName: string;
  fieldsCompleted: number;
  updatedFields: string[];
  consultedUrls: string[];
  buildabilityResult?: {
    value: boolean | null;
    confidence: string;
    reason: string;
  };
  analysisNotes?: string;
  message?: string;
  error?: string;
}

interface UrbanAnalysisPhasesProps {
  profile: UrbanProfile;
  onComplete: () => void;
}

const PHASES = [
  {
    id: 1,
    name: 'Catastro + Municipal',
    description: 'Datos catastrales y PGOU/Normas Subsidiarias del Ayuntamiento',
    icon: Building2,
    function: 'urban-analysis-phase1',
    color: 'blue'
  },
  {
    id: 2,
    name: 'Normativa Autonómica',
    description: 'Legislación urbanística de la Comunidad Autónoma',
    icon: Scale,
    function: 'urban-analysis-phase2',
    color: 'purple'
  },
  {
    id: 3,
    name: 'Afecciones Sectoriales',
    description: 'AESA, Costas, Ríos, Patrimonio, Forestal, etc.',
    icon: Shield,
    function: 'urban-analysis-phase3',
    color: 'orange'
  },
  {
    id: 4,
    name: 'CTE y Construcción',
    description: 'Código Técnico, zonas climáticas, estética',
    icon: Hammer,
    function: 'urban-analysis-phase4',
    color: 'green'
  }
];

function getPhaseStatus(analysisStatus: string | null, phaseId: number): 'pending' | 'complete' | 'current' {
  if (!analysisStatus) return phaseId === 1 ? 'current' : 'pending';
  
  const statusMap: Record<string, number> = {
    'pending': 0,
    'phase1_complete': 1,
    'phase2_complete': 2,
    'phase3_complete': 3,
    'complete': 4
  };
  
  const completedPhases = statusMap[analysisStatus] || 0;
  
  if (phaseId <= completedPhases) return 'complete';
  if (phaseId === completedPhases + 1) return 'current';
  return 'pending';
}

export function UrbanAnalysisPhases({ profile, onComplete }: UrbanAnalysisPhasesProps) {
  const { toast } = useToast();
  const [runningPhase, setRunningPhase] = useState<number | null>(null);
  const [phaseResults, setPhaseResults] = useState<Record<number, PhaseResult>>({});
  const [isRunningAll, setIsRunningAll] = useState(false);

  const runPhase = async (phaseId: number): Promise<PhaseResult | null> => {
    const phase = PHASES.find(p => p.id === phaseId);
    if (!phase) return null;

    setRunningPhase(phaseId);

    try {
      const { data, error } = await supabase.functions.invoke(phase.function, {
        body: {
          budgetId: profile.budget_id,
          municipality: profile.municipality,
          province: profile.province,
          autonomousCommunity: profile.autonomous_community,
          landClass: profile.land_class,
          cadastralReference: profile.cadastral_reference,
          surfaceArea: profile.surface_area,
          coordinates: profile.google_maps_lat && profile.google_maps_lng 
            ? { lat: profile.google_maps_lat, lng: profile.google_maps_lng }
            : null
        }
      });

      if (error) throw error;

      const result: PhaseResult = data;
      setPhaseResults(prev => ({ ...prev, [phaseId]: result }));

      if (result.success) {
        toast({
          title: `Fase ${phaseId} completada`,
          description: result.message || `${result.fieldsCompleted} campos actualizados`
        });
      } else {
        toast({
          variant: 'destructive',
          title: `Error en Fase ${phaseId}`,
          description: result.error || 'Error desconocido'
        });
      }

      return result;
    } catch (error) {
      console.error(`Error in phase ${phaseId}:`, error);
      const errorResult: PhaseResult = {
        success: false,
        phase: phaseId,
        phaseName: phase.name,
        fieldsCompleted: 0,
        updatedFields: [],
        consultedUrls: [],
        error: error instanceof Error ? error.message : 'Error desconocido'
      };
      setPhaseResults(prev => ({ ...prev, [phaseId]: errorResult }));
      
      toast({
        variant: 'destructive',
        title: `Error en Fase ${phaseId}`,
        description: error instanceof Error ? error.message : 'Error al ejecutar la fase'
      });
      
      return errorResult;
    } finally {
      setRunningPhase(null);
    }
  };

  const runAllPhases = async () => {
    if (!profile.municipality) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Primero consulta el Catastro para obtener los datos de la parcela'
      });
      return;
    }

    setIsRunningAll(true);
    toast({
      title: 'Iniciando análisis completo',
      description: 'Se ejecutarán las 4 fases secuencialmente'
    });

    for (const phase of PHASES) {
      const result = await runPhase(phase.id);
      if (!result?.success) {
        toast({
          variant: 'destructive',
          title: 'Análisis detenido',
          description: `Error en Fase ${phase.id}. Puedes reintentar esta fase individualmente.`
        });
        break;
      }
      // Small delay between phases
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setIsRunningAll(false);
    onComplete();
  };

  const completedPhases = PHASES.filter(p => 
    getPhaseStatus(profile.analysis_status, p.id) === 'complete'
  ).length;
  
  const progressPercent = (completedPhases / PHASES.length) * 100;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Análisis por Fases
            </CardTitle>
            <CardDescription>
              Análisis secuencial desde lo local hasta la normativa técnica
            </CardDescription>
          </div>
          <Button
            onClick={runAllPhases}
            disabled={isRunningAll || runningPhase !== null || !profile.municipality}
            size="sm"
          >
            {isRunningAll ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analizando...
              </>
            ) : (
              <>
                Ejecutar todas
                <ChevronRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </div>
        
        <div className="mt-3">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground">Progreso del análisis</span>
            <span className="font-medium">{completedPhases}/{PHASES.length} fases</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {PHASES.map((phase, index) => {
          const status = getPhaseStatus(profile.analysis_status, phase.id);
          const result = phaseResults[phase.id];
          const isRunning = runningPhase === phase.id;
          const Icon = phase.icon;
          
          // Determine if phase can be run
          const canRun = !isRunningAll && runningPhase === null && 
            (status === 'current' || status === 'complete') &&
            profile.municipality;

          return (
            <div
              key={phase.id}
              className={`
                flex items-start gap-3 p-3 rounded-lg border transition-colors
                ${status === 'complete' ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800' : ''}
                ${status === 'current' ? 'bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800' : ''}
                ${status === 'pending' ? 'bg-muted/30 border-muted' : ''}
                ${isRunning ? 'ring-2 ring-primary ring-offset-2' : ''}
              `}
            >
              {/* Phase indicator */}
              <div className={`
                flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center
                ${status === 'complete' ? 'bg-emerald-500 text-white' : ''}
                ${status === 'current' ? 'bg-blue-500 text-white' : ''}
                ${status === 'pending' ? 'bg-muted text-muted-foreground' : ''}
              `}>
                {isRunning ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : status === 'complete' ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
              </div>

              {/* Phase info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Fase {phase.id}: {phase.name}</span>
                  {status === 'complete' && (
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                      Completada
                    </Badge>
                  )}
                  {result?.success === false && (
                    <Badge variant="destructive">Error</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {phase.description}
                </p>
                
                {/* Result info */}
                {result?.success && result.fieldsCompleted > 0 && (
                  <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
                    ✓ {result.fieldsCompleted} campos: {result.updatedFields.join(', ')}
                  </p>
                )}
                {result?.buildabilityResult && (
                  <p className={`text-sm mt-1 ${
                    result.buildabilityResult.value ? 'text-emerald-600' : 
                    result.buildabilityResult.value === false ? 'text-red-600' : 'text-amber-600'
                  }`}>
                    {result.buildabilityResult.value ? '✓ Edificable' : 
                     result.buildabilityResult.value === false ? '✗ No edificable' : '? Pendiente verificación'}
                    {' '}({result.buildabilityResult.confidence})
                  </p>
                )}
                {result?.error && (
                  <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {result.error}
                  </p>
                )}
              </div>

              {/* Action button */}
              <Button
                size="sm"
                variant={status === 'complete' ? 'outline' : 'default'}
                onClick={() => runPhase(phase.id)}
                disabled={!canRun || isRunning}
                className="flex-shrink-0"
              >
                {isRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : status === 'complete' ? (
                  'Repetir'
                ) : (
                  'Analizar'
                )}
              </Button>
            </div>
          );
        })}

        {/* Connector lines between phases */}
        {!profile.municipality && (
          <div className="text-center py-4 text-muted-foreground text-sm">
            <AlertCircle className="h-5 w-5 mx-auto mb-2" />
            Primero consulta el Catastro para habilitar el análisis por fases
          </div>
        )}
      </CardContent>
    </Card>
  );
}
