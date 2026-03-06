import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { History, Plus, RotateCcw, Loader2, Clock, Shield, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
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

function groupByDate(snapshots: SnapshotEntry[]) {
  const groups: Record<string, SnapshotEntry[]> = {};
  for (const s of snapshots) {
    const dateKey = new Date(s.created_at).toLocaleDateString('es-ES', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    });
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(s);
  }
  return Object.entries(groups);
}

export function SnapshotRestoreButton({ budgetId, module, onRestored, size = 'sm' }: SnapshotRestoreButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());

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
    const label = newLabel.trim() || `Versión manual - ${MODULE_LABELS[module]}`;
    const fullLabel = newNotes.trim() ? `${label} | ${newNotes.trim()}` : label;
    await createSnapshot('manual', fullLabel);
    setNewLabel('');
    setNewNotes('');
    setShowCreateForm(false);
  };

  const toggleDate = (dateKey: string) => {
    setCollapsedDates(prev => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  };

  const dateGroups = groupByDate(snapshots);

  const parseLabel = (s: SnapshotEntry) => {
    const raw = getSnapshotLabel(s);
    const parts = raw.split(' | ');
    return { name: parts[0], notes: parts.slice(1).join(' | ') || null };
  };

  return (
    <>
      <Button
        variant="outline"
        size={size}
        onClick={() => setDialogOpen(true)}
        title={`Historial ${MODULE_LABELS[module]}`}
      >
        <History className="h-4 w-4 mr-1" />
        <span className="hidden sm:inline">Versiones</span>
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Historial — {MODULE_LABELS[module]}
            </DialogTitle>
          </DialogHeader>

          {/* Create form */}
          {showCreateForm ? (
            <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
              <Label className="text-xs font-medium">Nombre de la versión</Label>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder={`Ej: Diseño con 3 habitaciones`}
                className="h-8 text-sm"
                maxLength={100}
              />
              <Label className="text-xs font-medium">Observaciones (opcional)</Label>
              <Textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Ej: Versión antes de cambiar la distribución del salón"
                className="text-sm min-h-[60px] resize-none"
                maxLength={200}
              />
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={handleManualSnapshot} disabled={creating} className="gap-1 h-7 text-xs">
                  {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  Guardar versión
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowCreateForm(false); setNewLabel(''); setNewNotes(''); }} className="h-7 text-xs">
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCreateForm(true)}
              className="gap-1 self-start"
            >
              <Plus className="h-3.5 w-3.5" />
              Guardar versión actual
            </Button>
          )}

          {/* Timeline */}
          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
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
              dateGroups.map(([dateKey, items], gi) => {
                const isCollapsed = collapsedDates.has(dateKey);
                return (
                  <div key={dateKey}>
                    <button
                      onClick={() => toggleDate(dateKey)}
                      className="flex items-center gap-1.5 w-full text-left py-1.5 px-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors capitalize"
                    >
                      {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {gi === 0 ? 'Hoy' : dateKey}
                      <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-auto">{items.length}</Badge>
                    </button>
                    {!isCollapsed && (
                      <div className="space-y-1.5 ml-2 border-l-2 border-muted pl-3 pb-2">
                        {items.map((s) => {
                          const { name, notes } = parseLabel(s);
                          return (
                            <div
                              key={s.id}
                              className="flex items-start gap-2 p-2 border rounded-lg hover:bg-muted/30 transition-colors relative"
                            >
                              {/* Timeline dot */}
                              <div className="absolute -left-[19px] top-3 w-2 h-2 rounded-full bg-primary border-2 border-background" />

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-sm font-medium truncate max-w-[200px]">{name}</span>
                                  <Badge variant="secondary" className={`text-[9px] px-1 py-0 ${TYPE_COLORS[s.snapshot_type] || ''}`}>
                                    {s.snapshot_type === 'auto' ? 'Auto' : s.snapshot_type === 'manual' ? 'Manual' : 'Diario'}
                                  </Badge>
                                </div>
                                {notes && (
                                  <p className="text-[11px] text-muted-foreground mt-0.5 flex items-start gap-1">
                                    <MessageSquare className="h-3 w-3 mt-0.5 shrink-0 opacity-60" />
                                    <span className="italic">{notes}</span>
                                  </p>
                                )}
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  {new Date(s.created_at).toLocaleString('es-ES', {
                                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                                  })}
                                  {' · '}{getTimeAgo(s.created_at)}
                                </p>
                              </div>

                              {confirmId === s.id ? (
                                <div className="flex items-center gap-1 shrink-0">
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleRestore(s.id)}
                                    disabled={restoring}
                                    className="h-6 text-[10px] gap-1 px-2"
                                  >
                                    {restoring ? <Loader2 className="h-3 w-3 animate-spin" /> : <Shield className="h-3 w-3" />}
                                    Confirmar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setConfirmId(null)}
                                    className="h-6 text-[10px] px-1"
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
                                  className="h-6 text-[10px] gap-1 px-2 shrink-0"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  Restaurar
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
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
