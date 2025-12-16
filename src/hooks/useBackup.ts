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

interface BackupData {
  exportDate: string;
  module: BackupModule;
  version: string;
  tables: Record<string, any[]>;
}

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

const MODULE_NAMES: Record<BackupModule, string> = {
  all: 'Backup Completo',
  projects: 'Proyectos',
  budgets: 'Presupuestos',
  crm: 'CRM',
  documents: 'Documentos',
  resources: 'Recursos',
  users: 'Usuarios',
};

export function useBackup() {
  const [isExporting, setIsExporting] = useState(false);

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

  return {
    exportBackup,
    isExporting,
  };
}
