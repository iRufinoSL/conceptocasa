import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Shield, Trash2, Archive } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DeleteWithBackupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmDelete: () => Promise<void> | void;
  entityName: string;
  entityId: string;
  entityType: string;
  module: string;
  budgetId: string;
  backupData: Record<string, any>;
  title?: string;
  description?: string;
}

export function DeleteWithBackupDialog({
  open,
  onOpenChange,
  onConfirmDelete,
  entityName,
  entityId,
  entityType,
  module,
  budgetId,
  backupData,
  title,
  description,
}: DeleteWithBackupDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const now = new Date();
  const label = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getFullYear()).slice(-2)}/${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  const saveBackupAndDelete = async () => {
    try {
      setIsProcessing(true);
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.from('deletion_backups' as any).insert({
        budget_id: budgetId,
        module,
        entity_type: entityType,
        entity_id: entityId,
        entity_name: entityName,
        backup_data: backupData,
        created_by: user?.id || null,
        label,
      } as any);

      if (error) {
        toast.error('Error al guardar la copia de seguridad');
        console.error(error);
        return;
      }

      toast.success(`Copia reversible guardada: ${label}`);
      await onConfirmDelete();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error('Error al procesar la operación');
    } finally {
      setIsProcessing(false);
    }
  };

  const deleteWithoutBackup = async () => {
    try {
      setIsProcessing(true);
      await onConfirmDelete();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error('Error al eliminar');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-500" />
            {title || '¿Eliminar elemento?'}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              {description || (
                <>
                  Vas a eliminar <strong className="text-foreground">"{entityName}"</strong>.
                  Esta acción puede ser irreversible.
                </>
              )}
            </p>
            <p className="font-medium text-foreground">
              ¿Quieres guardar una copia reversible antes de eliminar?
            </p>
            <p className="text-xs text-muted-foreground">
              La copia se guardará como: <code className="bg-muted px-1 rounded">{label}</code>
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={saveBackupAndDelete}
            disabled={isProcessing}
            className="w-full bg-primary text-primary-foreground"
          >
            <Archive className="h-4 w-4 mr-2" />
            {isProcessing ? 'Procesando...' : 'Sí, guardar copia y eliminar'}
          </Button>
          <Button
            onClick={deleteWithoutBackup}
            disabled={isProcessing}
            variant="destructive"
            className="w-full"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Eliminar sin guardar copia
          </Button>
          <Button
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
            variant="outline"
            className="w-full"
          >
            Cancelar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
