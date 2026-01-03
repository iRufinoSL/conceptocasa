import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Upload, FileJson, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import { useBackup, BackupData, MODULE_NAMES } from '@/hooks/useBackup';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ImportBackupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ImportBackupDialog({ open, onOpenChange, onSuccess }: ImportBackupDialogProps) {
  const { parseBackupFile, importBackup, isImporting, importProgress } = useBackup();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [backupData, setBackupData] = useState<BackupData | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [parseError, setParseError] = useState<string | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setParseError(null);
    setBackupData(null);

    try {
      const data = await parseBackupFile(file);
      setBackupData(data);
    } catch (error: any) {
      setParseError(error.message);
    }
  };

  const handleImport = async () => {
    if (!backupData) return;

    const result = await importBackup(backupData, importMode);
    
    if (result.success) {
      onOpenChange(false);
      resetForm();
      onSuccess?.();
    }
  };

  const resetForm = () => {
    setSelectedFile(null);
    setBackupData(null);
    setParseError(null);
    setImportMode('merge');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      resetForm();
    }
    onOpenChange(isOpen);
  };

  const getTotalRecords = () => {
    if (!backupData) return 0;
    return Object.values(backupData.tables).reduce((sum, arr) => sum + arr.length, 0);
  };

  const getTableCount = () => {
    if (!backupData) return 0;
    return Object.keys(backupData.tables).filter(t => backupData.tables[t].length > 0).length;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar Backup</DialogTitle>
          <DialogDescription>
            Selecciona un archivo de backup JSON para restaurar los datos
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Input */}
          <div className="space-y-2">
            <Label>Archivo de backup</Label>
            <div 
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="hidden"
              />
              {selectedFile ? (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <FileJson className="h-5 w-5 text-primary" />
                  <span className="font-medium">{selectedFile.name}</span>
                  <span className="text-muted-foreground">
                    ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Click para seleccionar archivo o arrastra aquí
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Parse Error */}
          {parseError && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
              <AlertTriangle className="h-4 w-4" />
              {parseError}
            </div>
          )}

          {/* Backup Info */}
          {backupData && (
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <CheckCircle2 className="h-4 w-4" />
                Backup válido
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Módulo:</span>
                  <span className="ml-2 font-medium">{MODULE_NAMES[backupData.module]}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Fecha:</span>
                  <span className="ml-2 font-medium">
                    {format(new Date(backupData.exportDate), 'dd/MM/yyyy HH:mm', { locale: es })}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Registros:</span>
                  <span className="ml-2 font-medium">{getTotalRecords()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Tablas:</span>
                  <span className="ml-2 font-medium">{getTableCount()}</span>
                </div>
              </div>
            </div>
          )}

          {/* Import Mode */}
          {backupData && (
            <div className="space-y-2">
              <Label>Modo de importación</Label>
              <Select value={importMode} onValueChange={(v) => setImportMode(v as 'merge' | 'replace')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="merge">
                    <div className="flex flex-col items-start">
                      <span>Fusionar (recomendado)</span>
                      <span className="text-xs text-muted-foreground">
                        Añade registros nuevos, actualiza existentes
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="replace">
                    <div className="flex flex-col items-start">
                      <span>Reemplazar</span>
                      <span className="text-xs text-muted-foreground">
                        Elimina datos existentes antes de importar
                      </span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              
              {importMode === 'replace' && (
                <div className="flex items-start gap-2 p-3 bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-lg text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-medium">⚠️ Operación destructiva</span>
                    <p>
                      El modo "Reemplazar" eliminará los datos actuales antes de importar.
                      Se creará un backup automático de los datos actuales antes de proceder.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Progress */}
          {isImporting && importProgress && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {importProgress}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={isImporting}>
            Cancelar
          </Button>
          <Button 
            onClick={handleImport} 
            disabled={!backupData || isImporting}
          >
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importando...
              </>
            ) : (
              'Importar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
