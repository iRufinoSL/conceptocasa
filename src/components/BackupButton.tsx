import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { useBackup, BackupModule } from '@/hooks/useBackup';

interface BackupButtonProps {
  module?: BackupModule;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showLabel?: boolean;
  className?: string;
}

const MODULE_LABELS: Record<BackupModule, string> = {
  all: 'Backup Completo',
  projects: 'Backup Proyectos',
  budgets: 'Backup Presupuestos',
  crm: 'Backup CRM',
  documents: 'Backup Documentos',
  resources: 'Backup Recursos',
  users: 'Backup Usuarios',
};

export function BackupButton({ 
  module = 'all', 
  variant = 'outline',
  size = 'default',
  showLabel = true,
  className = '',
}: BackupButtonProps) {
  const { exportBackup, isExporting } = useBackup();

  const handleBackup = async () => {
    await exportBackup(module);
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleBackup}
      disabled={isExporting}
      className={`gap-2 ${className}`}
    >
      {isExporting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      {showLabel && (
        <span className="hidden sm:inline">
          {isExporting ? 'Exportando...' : MODULE_LABELS[module]}
        </span>
      )}
    </Button>
  );
}
