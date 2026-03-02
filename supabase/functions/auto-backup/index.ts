import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TABLES_TO_BACKUP = [
  'company_settings',
  'profiles',
  'user_roles',
  'projects',
  'project_contacts',
  'project_documents',
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
  'budget_work_areas',
  'budget_work_area_activities',
  'budget_work_area_measurements',
  'budget_spaces',
  'budget_tasks',
  'budget_contacts',
  'budget_messages',
  'budget_floor_plans',
  'budget_floors',
  'budget_floor_plan_rooms',
  'budget_floor_plan_walls',
  'budget_floor_plan_openings',
  'budget_floor_plan_wall_layers',
  'budget_volume_layers',
  'crm_contacts',
  'crm_activities',
  'crm_professional_activities',
  'crm_contact_activities',
  'crm_contact_professional_activities',
  'crm_contact_relations',
  'crm_managements',
  'crm_management_contacts',
  'crm_opportunities',
  'accounting_accounts',
  'accounting_entries',
  'accounting_entry_lines',
  'accounting_documents',
  'invoices',
  'invoice_lines',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Record backup start
    const { data: historyRecord, error: historyError } = await supabase
      .from('backup_history')
      .insert({
        backup_type: 'automatic',
        module: 'all',
        status: 'running',
      })
      .select('id')
      .single();

    if (historyError) {
      console.error('Failed to create history record:', historyError);
    }

    const backupData: Record<string, any> = {
      exportDate: new Date().toISOString(),
      module: 'all',
      version: '1.0',
      type: 'automatic',
      tables: {},
    };

    let totalRecords = 0;
    let totalTables = 0;

    for (const tableName of TABLES_TO_BACKUP) {
      try {
        // Fetch all records (handle >1000 rows with pagination)
        let allData: any[] = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .range(from, from + pageSize - 1);

          if (error) {
            console.warn(`Error fetching ${tableName}:`, error.message);
            break;
          }

          if (data && data.length > 0) {
            allData = allData.concat(data);
            from += pageSize;
            hasMore = data.length === pageSize;
          } else {
            hasMore = false;
          }
        }

        backupData.tables[tableName] = allData;
        if (allData.length > 0) {
          totalRecords += allData.length;
          totalTables++;
        }
      } catch (err) {
        console.warn(`Skipping ${tableName}:`, err);
        backupData.tables[tableName] = [];
      }
    }

    // Generate filename with timestamp
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const filePath = `auto/${dateStr}/backup_${dateStr}_${timeStr}.json`;

    // Upload to storage
    const jsonBlob = new Blob([JSON.stringify(backupData)], { type: 'application/json' });
    const { error: uploadError } = await supabase.storage
      .from('backups')
      .upload(filePath, jsonBlob, {
        contentType: 'application/json',
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);

      // Update history with failure
      if (historyRecord?.id) {
        await supabase.from('backup_history').update({
          status: 'failed',
          error_message: uploadError.message,
        }).eq('id', historyRecord.id);
      }

      return new Response(JSON.stringify({ error: uploadError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate file size
    const fileSizeBytes = new Blob([JSON.stringify(backupData)]).size;

    // Update history record
    if (historyRecord?.id) {
      await supabase.from('backup_history').update({
        status: 'completed',
        file_path: filePath,
        file_size_bytes: fileSizeBytes,
        total_records: totalRecords,
        total_tables: totalTables,
      }).eq('id', historyRecord.id);
    }

    // Clean up old backups (keep last 14 days = 28 backups at 2x/day)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 14);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    const { data: oldFolders } = await supabase.storage
      .from('backups')
      .list('auto');

    if (oldFolders) {
      for (const folder of oldFolders) {
        if (folder.name < cutoffStr) {
          const { data: files } = await supabase.storage
            .from('backups')
            .list(`auto/${folder.name}`);
          
          if (files && files.length > 0) {
            const filePaths = files.map(f => `auto/${folder.name}/${f.name}`);
            await supabase.storage.from('backups').remove(filePaths);
          }
        }
      }
    }

    console.log(`Auto-backup completed: ${totalRecords} records in ${totalTables} tables`);

    return new Response(JSON.stringify({
      success: true,
      totalRecords,
      totalTables,
      filePath,
      fileSizeBytes,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Auto-backup error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
