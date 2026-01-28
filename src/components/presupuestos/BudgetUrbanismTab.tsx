import { UrbanProfileCard } from './UrbanProfileCard';
import { PreliminaryUrbanReportsManager } from './PreliminaryUrbanReportsManager';

interface BudgetUrbanismTabProps {
  budgetId: string;
  isAdmin: boolean;
  cadastralReference?: string;
}

export function BudgetUrbanismTab({ budgetId, isAdmin, cadastralReference }: BudgetUrbanismTabProps) {
  return (
    <div className="space-y-6">
      {/* Urban Profile Section - Analyze specific land by cadastral reference */}
      <UrbanProfileCard 
        budgetId={budgetId} 
        cadastralReference={cadastralReference}
        isAdmin={isAdmin} 
      />

      {/* Preliminary Urban Reports - Non-binding reports for buildability analysis */}
      <PreliminaryUrbanReportsManager 
        budgetId={budgetId}
        isAdmin={isAdmin}
      />
    </div>
  );
}
