import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, Upload, Loader2, Database } from 'lucide-react';
import { useBackup, BackupModule, MODULE_NAMES } from '@/hooks/useBackup';
import { ImportBackupDialog } from '@/components/ImportBackupDialog';

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
  const { exportBackup, isExporting } = useBackup();
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const handleExport = async () => {
    await exportBackup(module);
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
        <DropdownMenuContent align="end">
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
