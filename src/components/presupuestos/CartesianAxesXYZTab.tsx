import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CustomSection } from './CustomSectionManager';

interface CartesianAxesXYZTabProps {
  budgetId: string;
  isAdmin: boolean;
}

type SectionType = Extract<CustomSection['sectionType'], 'vertical' | 'longitudinal' | 'transversal'>;

type SectionDraft = {
  name: string;
  axisValue: string;
};

const SECTION_CONFIG: Record<SectionType, { title: string; axis: 'X' | 'Y' | 'Z'; axisLabel: string; placeholder: string }> = {
  vertical: {
    title: 'Crear secciones Z',
    axis: 'Z',
    axisLabel: 'Eje Z',
    placeholder: '0',
  },
  longitudinal: {
    title: 'Crear secciones Y',
    axis: 'Y',
    axisLabel: 'Eje Y',
    placeholder: '0',
  },
  transversal: {
    title: 'Crear secciones X',
    axis: 'X',
    axisLabel: 'Eje X',
    placeholder: '0',
  },
};

const INITIAL_DRAFTS: Record<SectionType, SectionDraft> = {
  vertical: { name: 'Sección Z=0', axisValue: '0' },
  longitudinal: { name: 'Sección Y=0', axisValue: '0' },
  transversal: { name: 'Sección X=0', axisValue: '0' },
};

export function CartesianAxesXYZTab({ budgetId, isAdmin }: CartesianAxesXYZTabProps) {
  const queryClient = useQueryClient();
  const [openCreator, setOpenCreator] = useState<SectionType | null>('vertical');
  const [drafts, setDrafts] = useState<Record<SectionType, SectionDraft>>(INITIAL_DRAFTS);

  const { data: floorPlan } = useQuery({
    queryKey: ['floor-plan-for-workspaces', budgetId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('budget_floor_plans')
        .select('id, custom_corners')
        .eq('budget_id', budgetId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  const allSections = useMemo<CustomSection[]>(() => {
    if (!floorPlan?.custom_corners) return [];
    try {
      const parsed = typeof floorPlan.custom_corners === 'string'
        ? JSON.parse(floorPlan.custom_corners)
        : floorPlan.custom_corners;
      return Array.isArray(parsed?.customSections) ? parsed.customSections : [];
    } catch {
      return [];
    }
  }, [floorPlan?.custom_corners]);

  const sectionsByType = useMemo(() => {
    return {
      vertical: allSections.filter(section => section.sectionType === 'vertical').sort((a, b) => a.axisValue - b.axisValue),
      longitudinal: allSections.filter(section => section.sectionType === 'longitudinal').sort((a, b) => a.axisValue - b.axisValue),
      transversal: allSections.filter(section => section.sectionType === 'transversal').sort((a, b) => a.axisValue - b.axisValue),
    };
  }, [allSections]);

  const updateDraft = (type: SectionType, patch: Partial<SectionDraft>) => {
    setDrafts(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        ...patch,
      },
    }));
  };

  const handleCreateSection = async (type: SectionType) => {
    if (!isAdmin) {
      toast.error('No tienes permisos para crear secciones');
      return;
    }

    if (!floorPlan?.id) {
      toast.error('No se encontró el plano para este presupuesto');
      return;
    }

    const draft = drafts[type];
    if (!draft.name.trim()) {
      toast.error('Indica un nombre para la sección');
      return;
    }

    const axisValue = parseFloat(draft.axisValue);
    const newSection: CustomSection = {
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: draft.name.trim(),
      sectionType: type,
      axis: SECTION_CONFIG[type].axis,
      axisValue: Number.isFinite(axisValue) ? axisValue : 0,
      polygons: [],
    };

    let parsedCorners: Record<string, unknown> = {};
    try {
      parsedCorners = typeof floorPlan.custom_corners === 'string'
        ? JSON.parse(floorPlan.custom_corners)
        : (floorPlan.custom_corners || {});
    } catch {
      parsedCorners = {};
    }

    const existingSections = Array.isArray(parsedCorners.customSections)
      ? parsedCorners.customSections as CustomSection[]
      : [];

    const nextCustomCorners = {
      ...parsedCorners,
      customSections: [...existingSections, newSection],
    };

    const { error } = await supabase
      .from('budget_floor_plans')
      .update({ custom_corners: nextCustomCorners as any })
      .eq('id', floorPlan.id);

    if (error) {
      toast.error(`Error al crear sección ${SECTION_CONFIG[type].axis}`);
      return;
    }

    updateDraft(type, {
      name: `${SECTION_CONFIG[type].title.replace('Crear ', '').replace('secciones ', 'Sección ')}=${newSection.axisValue}`,
      axisValue: String(newSection.axisValue),
    });

    toast.success(`Sección ${newSection.axis} creada: ${newSection.name}`);
    queryClient.invalidateQueries({ queryKey: ['floor-plan-for-workspaces', budgetId] });
    queryClient.invalidateQueries({ queryKey: ['workspace-rooms'] });
  };

  const creators: SectionType[] = ['vertical', 'transversal', 'longitudinal'];

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-card p-3">
        <p className="text-sm font-semibold">Ejes cartesianos XYZ</p>
        <p className="text-xs text-muted-foreground mt-0.5">Crea secciones limpias por eje sin tocar los espacios de trabajo.</p>
      </div>

      {creators.map((type) => {
        const config = SECTION_CONFIG[type];
        const draft = drafts[type];
        const currentSections = sectionsByType[type];

        return (
          <Collapsible
            key={type}
            open={openCreator === type}
            onOpenChange={() => setOpenCreator(prev => prev === type ? null : type)}
          >
            <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left hover:bg-accent/50 transition-colors">
              <ChevronRight
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform duration-200',
                  openCreator === type && 'rotate-90',
                )}
              />
              <span className="text-sm font-medium">{config.title}</span>
              <Badge variant="secondary" className="ml-auto h-5 text-[10px]">{currentSections.length}</Badge>
            </CollapsibleTrigger>

            <CollapsibleContent className="pt-2">
              <div className="rounded-lg border bg-card p-3 space-y-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-[11px]">Nombre</Label>
                    <Input
                      className="h-8 text-xs"
                      value={draft.name}
                      onChange={(event) => updateDraft(type, { name: event.target.value })}
                      placeholder={`Ej: ${config.title.replace('Crear ', '').replace('secciones ', 'Sección ')}`}
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">{config.axisLabel}</Label>
                    <Input
                      className="h-8 text-xs"
                      type="number"
                      value={draft.axisValue}
                      onChange={(event) => updateDraft(type, { axisValue: event.target.value })}
                      placeholder={config.placeholder}
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => handleCreateSection(type)}
                    disabled={!isAdmin || !draft.name.trim()}
                  >
                    <Plus className="h-3 w-3" /> Crear sección
                  </Button>
                </div>

                {currentSections.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium text-muted-foreground">Secciones existentes</p>
                    <div className="flex flex-wrap gap-1">
                      {currentSections.map((section) => (
                        <Badge key={section.id} variant="outline" className="text-[10px] h-5">
                          {section.name} ({section.axis}={section.axisValue})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
