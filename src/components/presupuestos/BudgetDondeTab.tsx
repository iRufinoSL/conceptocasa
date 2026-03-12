import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { PenTool, MapPin, Home, Box, Layers, ChevronRight, Grid3x3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FloorPlanTab } from './FloorPlanTab';
import { BudgetWorkAreasTab } from './BudgetWorkAreasTab';
import { BudgetSpacesTab } from './BudgetSpacesTab';
import { BudgetWorkspacesTab } from './BudgetWorkspacesTab';
import { WallObjectsList } from './WallObjectsList';
import { CartesianAxesXYZTab } from './CartesianAxesXYZTab';

interface BudgetDondeTabProps {
  budgetId: string;
  budgetName: string;
  isAdmin: boolean;
}

export function BudgetDondeTab({ budgetId, budgetName, isAdmin }: BudgetDondeTabProps) {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [autoShow3D, setAutoShow3D] = useState(false);

  const sections = [
    { id: 'plano', label: 'Plano', icon: PenTool, color: 'text-teal-600' },
    { id: 'areas-trabajo', label: 'Áreas de trabajo', icon: MapPin, color: 'text-emerald-600' },
    { id: 'espacios', label: 'Espacios', icon: Home, color: 'text-green-600' },
    { id: 'espacios-trabajo', label: 'Espacios de trabajo', icon: Box, color: 'text-blue-600' },
    { id: 'ejes-cartesianos-xyz', label: 'Ejes cartesianos XYZ', icon: Grid3x3, color: 'text-primary' },
    { id: 'objetos', label: 'Objetos', icon: Layers, color: 'text-purple-600' },
  ];

  const toggleSection = (id: string) => {
    setOpenSection(prev => prev === id ? null : id);
  };

  return (
    <div className="space-y-2">
      {sections.map(({ id, label, icon: Icon, color }) => (
        <Collapsible
          key={id}
          open={openSection === id}
          onOpenChange={() => toggleSection(id)}
        >
          <CollapsibleTrigger className="flex items-center gap-3 w-full p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors text-left">
            <ChevronRight
              className={cn(
                'h-5 w-5 text-muted-foreground transition-transform duration-200',
                openSection === id && 'rotate-90'
              )}
            />
            <Icon className={cn('h-5 w-5', color)} />
            <span className="font-semibold text-base">{label}</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4">
            {id === 'plano' && (
              <FloorPlanTab budgetId={budgetId} budgetName={budgetName} isAdmin={isAdmin}
                onNavigateTo3D={() => {
                  setAutoShow3D(true);
                  setOpenSection('espacios-trabajo');
                }}
              />
            )}
            {id === 'areas-trabajo' && (
              <BudgetWorkAreasTab budgetId={budgetId} isAdmin={isAdmin} />
            )}
            {id === 'espacios' && (
              <BudgetSpacesTab budgetId={budgetId} isAdmin={isAdmin} />
            )}
            {id === 'espacios-trabajo' && (
              <BudgetWorkspacesTab budgetId={budgetId} isAdmin={isAdmin} autoShow3D={autoShow3D} onAutoShow3DHandled={() => setAutoShow3D(false)} />
            )}
            {id === 'ejes-cartesianos-xyz' && (
              <CartesianAxesXYZTab budgetId={budgetId} isAdmin={isAdmin} />
            )}
            {id === 'objetos' && (
              <WallObjectsList budgetId={budgetId} />
            )}
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
}
