import { supabase } from "@/integrations/supabase/client";
import { cloneContentToExistingBudget } from "./clone-budget";
import { toast } from "sonner";

/**
 * Get the global Model Budget (the one with is_model = true).
 * Returns null if none exists.
 */
export async function getModelBudget(): Promise<{ id: string; nombre: string } | null> {
  const { data } = await supabase
    .from("presupuestos")
    .select("id, nombre")
    .eq("is_model", true)
    .limit(1)
    .maybeSingle();
  return data || null;
}

/**
 * Creates a Model Budget by cloning from an existing budget.
 * Steps:
 * 1. Clone the source budget as a new "Presupuesto Modelo"
 * 2. Mark it with is_model = true, status = 'modelo'
 * 3. Link the source budget to the model via model_budget_id
 * 4. Link all other non-archived budgets to the model
 */
export async function createModelBudget(sourceBudgetId: string): Promise<{ success: boolean; modelId?: string; error?: string }> {
  try {
    // Check if a model already exists
    const existing = await getModelBudget();
    if (existing) {
      return { success: false, error: "Ya existe un Presupuesto Modelo. Solo puede haber uno." };
    }

    // Get source budget info
    const { data: source, error: sourceErr } = await supabase
      .from("presupuestos")
      .select("nombre, poblacion, provincia, version, codigo_correlativo")
      .eq("id", sourceBudgetId)
      .single();

    if (sourceErr || !source) {
      return { success: false, error: "Presupuesto origen no encontrado" };
    }

    // Get next correlative code
    const { data: maxCode } = await supabase
      .from("presupuestos")
      .select("codigo_correlativo")
      .order("codigo_correlativo", { ascending: false })
      .limit(1);
    const nextCode = ((maxCode?.[0]?.codigo_correlativo) || 0) + 1;

    // Create the model budget entry
    const { data: modelBudget, error: createErr } = await supabase
      .from("presupuestos")
      .insert({
        nombre: `MODELO - ${source.nombre}`,
        poblacion: source.poblacion,
        provincia: source.provincia,
        version: "9.0",
        codigo_correlativo: nextCode,
        status: "modelo",
        is_model: true,
        archived: false,
      } as any)
      .select("id")
      .single();

    if (createErr || !modelBudget) {
      return { success: false, error: createErr?.message || "Error al crear presupuesto modelo" };
    }

    // Clone full content from source to model
    const cloneResult = await cloneContentToExistingBudget(sourceBudgetId, modelBudget.id, {
      preserveMeasurementValues: true,
    });

    if (!cloneResult.success) {
      // Cleanup: delete the empty model
      await supabase.from("presupuestos").delete().eq("id", modelBudget.id);
      return { success: false, error: cloneResult.error || "Error al clonar contenido al modelo" };
    }

    // Link source budget to the model
    await supabase
      .from("presupuestos")
      .update({ model_budget_id: modelBudget.id } as any)
      .eq("id", sourceBudgetId);

    // Link all non-archived, non-model budgets to the model
    await supabase
      .from("presupuestos")
      .update({ model_budget_id: modelBudget.id } as any)
      .neq("id", modelBudget.id)
      .neq("status", "archivado")
      .is("is_model", false);

    return { success: true, modelId: modelBudget.id };
  } catch (err: any) {
    console.error("Error creating model budget:", err);
    return { success: false, error: err.message || "Error desconocido" };
  }
}

/**
 * Syncs a working budget's full content to the global Model Budget.
 * Replaces all content in the model with the current state of the working budget.
 */
export async function syncToModelBudget(workingBudgetId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const model = await getModelBudget();
    if (!model) {
      return { success: false, error: "No existe Presupuesto Modelo" };
    }

    // Delete existing content from model before re-cloning
    const modelId = model.id;
    
    // Delete in correct order (dependencies first)
    await supabase.from("budget_work_area_activities").delete().in(
      "work_area_id",
      (await supabase.from("budget_work_areas").select("id").eq("budget_id", modelId)).data?.map(w => w.id) || []
    );
    await supabase.from("budget_work_area_measurements").delete().in(
      "work_area_id",
      (await supabase.from("budget_work_areas").select("id").eq("budget_id", modelId)).data?.map(w => w.id) || []
    );
    await supabase.from("budget_activity_destinations").delete().in(
      "activity_id",
      (await supabase.from("budget_activities").select("id").eq("budget_id", modelId)).data?.map(a => a.id) || []
    );
    await supabase.from("budget_activity_workspaces").delete().in(
      "activity_id",
      (await supabase.from("budget_activities").select("id").eq("budget_id", modelId)).data?.map(a => a.id) || []
    );
    await supabase.from("budget_activity_resources").delete().eq("budget_id", modelId);
    await supabase.from("budget_activities").delete().eq("budget_id", modelId);
    await supabase.from("budget_phases").delete().eq("budget_id", modelId);
    await supabase.from("budget_measurements").delete().eq("budget_id", modelId);
    await supabase.from("budget_spaces").delete().eq("budget_id", modelId);
    await supabase.from("budget_work_areas").delete().eq("budget_id", modelId);
    await supabase.from("budget_items").delete().eq("budget_id", modelId);
    await supabase.from("budget_concepts").delete().eq("budget_id", modelId);
    await supabase.from("budget_contacts").delete().eq("budget_id", modelId);
    await supabase.from("budget_predesigns").delete().eq("budget_id", modelId);
    await supabase.from("budget_document_links").delete().eq("budget_id", modelId);

    // Clone fresh content from working budget
    const result = await cloneContentToExistingBudget(workingBudgetId, modelId, {
      preserveMeasurementValues: true,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Update model's timestamp
    await supabase
      .from("presupuestos")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", modelId);

    return { success: true };
  } catch (err: any) {
    console.error("Error syncing to model:", err);
    return { success: false, error: err.message || "Error al sincronizar" };
  }
}

/**
 * Debounced auto-sync: call this after significant budget changes.
 * Uses a simple timer approach for periodic syncing.
 */
const syncTimers = new Map<string, ReturnType<typeof setTimeout>>();
const SYNC_DELAY_MS = 30_000; // 30 seconds after last change

export function scheduleSyncToModel(workingBudgetId: string) {
  // Clear previous timer for this budget
  const existing = syncTimers.get(workingBudgetId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    syncTimers.delete(workingBudgetId);
    const result = await syncToModelBudget(workingBudgetId);
    if (result.success) {
      console.log(`[ModelSync] Synced budget ${workingBudgetId} to model`);
    } else {
      console.warn(`[ModelSync] Failed to sync: ${result.error}`);
    }
  }, SYNC_DELAY_MS);

  syncTimers.set(workingBudgetId, timer);
}
