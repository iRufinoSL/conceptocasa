import { lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrainNode } from '@/hooks/useBrainNodes';
import { cn } from '@/lib/utils';

// Lazy-load heavy tab components
const BudgetVisualSummary = lazy(() => import('@/components/presupuestos/BudgetVisualSummary').then(m => ({ default: m.BudgetVisualSummary })));

interface BrainSidePanelProps {
  node: BrainNode | null;
  isAdmin: boolean;
  onClose: () => void;
}

export function BrainSidePanel({ node, isAdmin, onClose }: BrainSidePanelProps) {
  if (!node) return null;

  const budgetId = node.target_params?.budgetId;

  return (
    <AnimatePresence>
      {node && (
        <motion.div
          key={node.id}
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className={cn(
            'fixed top-0 right-0 bottom-0 z-50 w-full max-w-2xl',
            'bg-card border-l border-border shadow-2xl',
            'flex flex-col overflow-hidden'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <div>
              <h3 className="font-semibold text-foreground">{node.name}</h3>
              {node.description && (
                <p className="text-xs text-muted-foreground">{node.description}</p>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-4">
            <Suspense fallback={
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            }>
              {budgetId ? (
                <BudgetPanelContent budgetId={budgetId} isAdmin={isAdmin} />
              ) : node.target_url ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground mb-4">
                    Módulo: <strong>{node.name}</strong>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Haz doble-click en los nodos hijos para explorar su contenido.
                  </p>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">
                    Nodo de nota: <strong>{node.name}</strong>
                  </p>
                  {node.description && (
                    <p className="text-sm text-muted-foreground mt-2">{node.description}</p>
                  )}
                </div>
              )}
            </Suspense>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BudgetPanelContent({ budgetId, isAdmin }: { budgetId: string; isAdmin: boolean }) {
  return (
    <div className="space-y-4">
      <BudgetVisualSummary budgetId={budgetId} budgetName="" />
    </div>
  );
}
