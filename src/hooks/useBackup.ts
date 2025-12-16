import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type BackupModule = 
  | 'all' 
  | 'projects' 
  | 'budgets' 
  | 'crm' 
  | 'documents' 
  | 'resources' 
  | 'users';

export interface BackupData {
  exportDate: string;
  module: BackupModule;
  version: string;
  tables: Record<string, any[]>;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
}

// Order matters for import - parent tables first
const TABLE_IMPORT_ORDER: Record<BackupModule, string[]> = {
  all: [
    'company_settings',
    'crm_professional_activities',
    'crm_activities',
    'crm_contacts',
    'crm_contact_activities',
    'crm_contact_professional_activities',
    'crm_contact_relations',
    'crm_managements',
    'crm_management_contacts',
    'crm_opportunities',
    'projects',
    'project_contacts',
    'project_documents',
    'project_predesigns',
    'presupuestos',
    'budget_phases',
    'budget_measurements',
    'budget_measurement_relations',
    'budget_activities',
    'budget_activity_resources',
    'budget_activity_files',
    'budget_predesigns',
    'budget_items',
    'budget_concepts',
  ],
  projects: [
    'projects',
    'project_contacts',
    'project_documents',
    'project_predesigns',
  ],
  budgets: [
    'presupuestos',
    'budget_phases',
    'budget_measurements',
    'budget_measurement_relations',
    'budget_activities',
    'budget_activity_resources',
    'budget_activity_files',
    'budget_predesigns',
    'budget_items',
    'budget_concepts',
  ],
  crm: [
    'crm_professional_activities',
    'crm_activities',
    'crm_contacts',
    'crm_contact_activities',
    'crm_contact_professional_activities',
    'crm_contact_relations',
    'crm_managements',
    'crm_management_contacts',
    'crm_opportunities',
  ],
  documents: [
    'project_documents',
  ],
  resources: [
    'budget_activity_resources',
  ],
  users: [],
};

const TABLE_MAPPING: Record<BackupModule, string[]> = {
  all: [
    'profiles',
    'user_roles',
    'company_settings',
    'projects',
    'project_contacts',
    'project_documents',
    'project_predesigns',
    'presupuestos',
    'user_presupuestos',
    'budget_phases',
    'budget_activities',
    'budget_activity_resources',
    'budget_activity_files',
    'budget_measurements',
    'budget_measurement_relations',
    'budget_predesigns',
    'budget_items',
    'budget_concepts',
    'crm_contacts',
    'crm_activities',
    'crm_professional_activities',
    'crm_contact_activities',
    'crm_contact_professional_activities',
    'crm_contact_relations',
    'crm_managements',
    'crm_management_contacts',
    'crm_opportunities',
  ],
  projects: [
    'projects',
    'project_contacts',
    'project_documents',
    'project_predesigns',
  ],
  budgets: [
    'presupuestos',
    'user_presupuestos',
    'budget_phases',
    'budget_activities',
    'budget_activity_resources',
    'budget_activity_files',
    'budget_measurements',
    'budget_measurement_relations',
    'budget_predesigns',
    'budget_items',
    'budget_concepts',
  ],
  crm: [
    'crm_contacts',
    'crm_activities',
    'crm_professional_activities',
    'crm_contact_activities',
    'crm_contact_professional_activities',
    'crm_contact_relations',
    'crm_managements',
    'crm_management_contacts',
    'crm_opportunities',
  ],
  documents: [
    'project_documents',
  ],
  resources: [
    'budget_activity_resources',
  ],
  users: [
    'profiles',
    'user_roles',
    'user_presupuestos',
  ],
};

export const MODULE_NAMES: Record<BackupModule, string> = {
  all: 'Backup Completo',
  projects: 'Proyectos',
  budgets: 'Presupuestos',
  crm: 'CRM',
  documents: 'Documentos',
  resources: 'Recursos',
  users: 'Usuarios',
};

// Tables that should not be imported (managed by auth or system)
const SKIP_IMPORT_TABLES = ['profiles', 'user_roles', 'user_presupuestos'];

export function useBackup() {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string>('');

  const exportBackup = async (module: BackupModule = 'all') => {
    setIsExporting(true);
    
    try {
      const tables = TABLE_MAPPING[module];
      const backupData: BackupData = {
        exportDate: new Date().toISOString(),
        module,
        version: '1.0',
        tables: {},
      };

      for (const tableName of tables) {
        const { data, error } = await supabase
          .from(tableName as any)
          .select('*');
        
        if (error) {
          console.warn(`Error fetching ${tableName}:`, error.message);
          backupData.tables[tableName] = [];
        } else {
          backupData.tables[tableName] = data || [];
        }
      }

      // Generate filename
      const date = new Date().toISOString().split('T')[0];
      const time = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
      const filename = `backup_${module}_${date}_${time}.json`;

      // Create and download file
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { 
        type: 'application/json' 
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const totalRecords = Object.values(backupData.tables).reduce(
        (sum, arr) => sum + arr.length, 
        0
      );

      toast.success(`Backup de ${MODULE_NAMES[module]} completado`, {
        description: `${totalRecords} registros exportados en ${Object.keys(backupData.tables).length} tablas`,
      });

      return backupData;
    } catch (error) {
      console.error('Backup error:', error);
      toast.error('Error al generar backup', {
        description: 'Por favor, inténtelo de nuevo',
      });
      throw error;
    } finally {
      setIsExporting(false);
    }
  };

  const parseBackupFile = async (file: File): Promise<BackupData> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const data = JSON.parse(content) as BackupData;
          
          // Validate backup structure
          if (!data.exportDate || !data.module || !data.tables) {
            throw new Error('Formato de backup inválido');
          }
          
          resolve(data);
        } catch (err) {
          reject(new Error('Error al leer el archivo de backup'));
        }
      };
      reader.onerror = () => reject(new Error('Error al leer el archivo'));
      reader.readAsText(file);
    });
  };

  const importBackup = async (
    backupData: BackupData, 
    mode: 'merge' | 'replace' = 'merge'
  ): Promise<ImportResult> => {
    setIsImporting(true);
    const result: ImportResult = {
      success: true,
      imported: 0,
      skipped: 0,
      errors: [],
    };

    try {
      const importOrder = TABLE_IMPORT_ORDER[backupData.module] || Object.keys(backupData.tables);
      
      for (const tableName of importOrder) {
        const records = backupData.tables[tableName];
        
        if (!records || records.length === 0) continue;
        
        // Skip system tables
        if (SKIP_IMPORT_TABLES.includes(tableName)) {
          result.skipped += records.length;
          continue;
        }

        setImportProgress(`Importando ${tableName}...`);

        try {
          if (mode === 'replace') {
            // Delete existing records first (only for non-system tables)
            await supabase.from(tableName as any).delete().neq('id', '00000000-0000-0000-0000-000000000000');
          }

          // Remove timestamps that might cause conflicts
          const cleanedRecords = records.map(record => {
            const { created_at, updated_at, ...rest } = record;
            return rest;
          });

          // Insert in batches of 100
          const batchSize = 100;
          for (let i = 0; i < cleanedRecords.length; i += batchSize) {
            const batch = cleanedRecords.slice(i, i + batchSize);
            
            const { error } = await supabase
              .from(tableName as any)
              .upsert(batch, { 
                onConflict: 'id',
                ignoreDuplicates: mode === 'merge'
              });

            if (error) {
              console.error(`Error importing ${tableName}:`, error);
              result.errors.push(`${tableName}: ${error.message}`);
            } else {
              result.imported += batch.length;
            }
          }
        } catch (tableError: any) {
          result.errors.push(`${tableName}: ${tableError.message}`);
        }
      }

      if (result.errors.length > 0) {
        result.success = false;
        toast.error('Importación completada con errores', {
          description: `${result.imported} importados, ${result.errors.length} errores`,
        });
      } else {
        toast.success('Importación completada', {
          description: `${result.imported} registros importados correctamente`,
        });
      }

      return result;
    } catch (error: any) {
      console.error('Import error:', error);
      result.success = false;
      result.errors.push(error.message);
      toast.error('Error al importar backup');
      return result;
    } finally {
      setIsImporting(false);
      setImportProgress('');
    }
  };

  return {
    exportBackup,
    parseBackupFile,
    importBackup,
    isExporting,
    isImporting,
    importProgress,
  };
}
