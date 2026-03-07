import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Archive, RotateCcw, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface DeletionBackupsListProps {
  budgetId: string;
  module: string;
  onRestore?: (backupData: Record<string, any>, entityType: string) => Promise<void>;
}

interface BackupEntry {
  id: string;
  entity_type: string;
  entity_name: string | null;
  backup_data: Record<string, any>;
  created_at: string;
  label: string | null;
  restored_at: string | null;
}

export function DeletionBackupsList({ budgetId, module, onRestore }: DeletionBackupsListProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: backups = [], isLoading } = useQuery({
    queryKey: ['deletion-backups', budgetId, module],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deletion_backups' as any)
        .select('*')
        .eq('budget_id', budgetId)
        .eq('module', module)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as BackupEntry[];
    },
  });

  const handleRestore = async (backup: BackupEntry) => {
    if (!onRestore) return;
    try {
      setRestoringId(backup.id);
      await onRestore(backup.backup_data, backup.entity_type);

      await supabase
        .from('deletion_backups' as any)
        .update({ restored_at: new Date().toISOString() } as any)
        .eq('id', backup.id);

      toast.success(`"${backup.entity_name}" restaurado correctamente`);
      queryClient.invalidateQueries({ queryKey: ['deletion-backups', budgetId, module] });
    } catch (err) {
      console.error(err);
      toast.error('Error al restaurar');
    } finally {
      setRestoringId(null);
    }
  };

  const handleDeleteBackup = async (id: string) => {
    const { error } = await supabase
      .from('deletion_backups' as any)
      .delete()
      .eq('id', id);
    if (error) {
      toast.error('Error al eliminar la copia');
      return;
    }
    toast.success('Copia eliminada');
    queryClient.invalidateQueries({ queryKey: ['deletion-backups', budgetId, module] });
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  if (backups.length === 0 && !isLoading) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground">
          <Archive className="h-3.5 w-3.5" />
          Copias reversibles ({backups.length})
          {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-1">
        {isLoading ? (
          <p className="text-xs text-muted-foreground px-2">Cargando...</p>
        ) : (
          backups.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50 text-xs"
            >
              <div className="flex-1 min-w-0">
                <span className="font-medium truncate block">
                  {b.entity_name || b.entity_type}
                </span>
                <span className="text-muted-foreground">
                  {b.label || formatDate(b.created_at)}
                </span>
                {b.restored_at && (
                  <Badge variant="outline" className="ml-1 text-[10px]">
                    Restaurado
                  </Badge>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                {onRestore && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() => handleRestore(b)}
                    disabled={restoringId === b.id}
                    title="Restaurar"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-primary" />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={() => handleDeleteBackup(b.id)}
                  title="Eliminar copia"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
