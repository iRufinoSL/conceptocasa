import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { History, Plus, RotateCcw, Loader2, Clock, Shield } from 'lucide-react';
import { useModuleSnapshots, SnapshotModule, SnapshotEntry } from '@/hooks/useModuleSnapshots';

const MODULE_LABELS: Record<SnapshotModule, string> = {
  plano: 'Plano',
  actividades: 'Actividades',
  recursos: 'Recursos',
};

const TYPE_COLORS: Record<string, string> = {
  auto: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  manual: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  daily_first: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  daily_mid: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  daily_last: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
};

interface SnapshotRestoreButtonProps {
  budgetId: string;
  module: SnapshotModule;
  onRestored?: () => void;
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function SnapshotRestoreButton({ budgetId, module, onRestored, size = 'sm' }: SnapshotRestoreButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const {
    snapshots,
    loading,
    creating,
    restoring,
    createSnapshot,
    restoreSnapshot,
    getSnapshotLabel,
    getTimeAgo,
  } = useModuleSnapshots(budgetId, module);

  const handleRestore = async (snapshotId: string) => {
    const success = await restoreSnapshot(snapshotId);
    if (success) {
      setDialogOpen(false);
      setConfirmId(null);
      onRestored?.();
    }
  };

  const handleManualSnapshot = async () => {
    await createSnapshot('manual', `Snapshot manual - ${MODULE_LABELS[module]}`);
  };

  return (
    <>
      <Button
        variant="outline"
        size={size}
        onClick={() => setDialogOpen(true)}
        title={`Restaurar ${MODULE_LABELS[module]}`}
      >
        <History className="h-4 w-4 mr-1" />
        <span className="hidden sm:inline">Versiones</span>
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Versiones — {MODULE_LABELS[module]}
            </DialogTitle>
          </DialogHeader>

          <div className="flex gap-2 mb-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualSnapshot}
              disabled={creating}
              className="gap-1"
            >
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Crear punto de restauración
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : snapshots.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No hay versiones guardadas aún.</p>
                <p className="text-xs mt-1">Se crean automáticamente cada 10 minutos.</p>
              </div>
            ) : (
              snapshots.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {getSnapshotLabel(s)}
                      </span>
                      <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${TYPE_COLORS[s.snapshot_type] || ''}`}>
                        {s.snapshot_type === 'auto' ? 'Auto' : s.snapshot_type === 'manual' ? 'Manual' : 'Diario'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {getTimeAgo(s.created_at)} · {new Date(s.created_at).toLocaleString('es-ES', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>

                  {confirmId === s.id ? (
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleRestore(s.id)}
                        disabled={restoring}
                        className="h-7 text-xs gap-1"
                      >
                        {restoring ? <Loader2 className="h-3 w-3 animate-spin" /> : <Shield className="h-3 w-3" />}
                        Confirmar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmId(null)}
                        className="h-7 text-xs"
                      >
                        ✕
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmId(s.id)}
                      disabled={restoring}
                      className="h-7 text-xs gap-1"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Restaurar
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="pt-3 border-t">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Shield className="h-3 w-3" />
              Al restaurar se crea automáticamente un backup de seguridad del estado actual.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
