import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, Upload, Loader2, Database, Clock, Cloud } from 'lucide-react';
import { useBackup, BackupModule, MODULE_NAMES } from '@/hooks/useBackup';
import { ImportBackupDialog } from '@/components/ImportBackupDialog';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface BackupButtonProps {
  module?: BackupModule;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showLabel?: boolean;
  className?: string;
  onImportSuccess?: () => void;
}

export function BackupButton({ 
  module = 'all', 
  variant = 'outline',
  size = 'default',
  showLabel = true,
  className = '',
  onImportSuccess,
}: BackupButtonProps) {
  const { exportBackup, getLastBackupInfo, isExporting } = useBackup();
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [lastBackup, setLastBackup] = useState<{
    lastAutomatic: any;
    lastManual: any;
    lastAny: any;
  } | null>(null);

  useEffect(() => {
    getLastBackupInfo().then(setLastBackup);
  }, []);

  const handleExport = async () => {
    await exportBackup(module);
    // Refresh last backup info
    getLastBackupInfo().then(setLastBackup);
  };

  const formatBackupDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "dd/MM/yyyy HH:mm", { locale: es });
    } catch {
      return dateStr;
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={variant}
            size={size}
            disabled={isExporting}
            className={`gap-2 ${className}`}
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Database className="h-4 w-4" />
            )}
            {showLabel && (
              <span className="hidden sm:inline">
                {isExporting ? 'Exportando...' : 'Backup'}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          {/* Last backup info */}
          {lastBackup?.lastAny && (
            <>
              <div className="px-2 py-2 space-y-1">
                {lastBackup.lastAutomatic && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Cloud className="h-3 w-3" />
                    <span>Último auto: {formatBackupDate(lastBackup.lastAutomatic.created_at)}</span>
                  </div>
                )}
                {lastBackup.lastManual && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>Último manual: {formatBackupDate(lastBackup.lastManual.created_at)}</span>
                  </div>
                )}
              </div>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={handleExport} disabled={isExporting}>
            <Download className="h-4 w-4 mr-2" />
            Exportar {MODULE_NAMES[module]}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setImportDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Importar backup
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ImportBackupDialog 
        open={importDialogOpen} 
        onOpenChange={setImportDialogOpen}
        onSuccess={onImportSuccess}
      />
    </>
  );
}
