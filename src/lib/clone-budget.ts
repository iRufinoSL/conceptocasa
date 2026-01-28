import { supabase } from "@/integrations/supabase/client";

interface CloneResult {
  success: boolean;
  newBudgetId?: string;
  error?: string;
  stats?: {
    phases: number;
    activities: number;
    resources: number;
    measurements: number;
    measurementRelations: number;
    predesigns: number;
    spaces: number;
    workAreas: number;
    workAreaMeasurements: number;
    workAreaActivities: number;
    budgetContacts: number;
    budgetItems: number;
    budgetConcepts: number;
  };
}

type NewBudgetData = {
  nombre: string;
  version: string;
  poblacion: string;
  provincia?: string;
  coordenadas_lat?: number;
  coordenadas_lng?: number;
  project_id?: string | null;
};

type CloneOptions = {
  /** true = clon completo (incluye valores), false = plantilla */
  preserveMeasurementValues?: boolean;
};

function safeExtFromFilename(filename: string | null | undefined) {
  if (!filename) return "";
  const parts = filename.split(".");
  if (parts.length < 2) return "";
  const ext = parts.pop()?.trim();
  return ext ? `.${ext}` : "";
}

/**
 * Clona el contenido de un presupuesto origen a un presupuesto destino existente.
 * Añade todo el contenido sin borrar lo que ya exista en el destino.
 */
export async function cloneContentToExistingBudget(
  sourceBudgetId: string,
  targetBudgetId: string,
  options: CloneOptions = {}
): Promise<CloneResult> {
  const { preserveMeasurementValues = false } = options;

  const stats: NonNullable<CloneResult["stats"]> = {
    phases: 0,
    activities: 0,
    resources: 0,
    measurements: 0,
    measurementRelations: 0,
    predesigns: 0,
    spaces: 0,
    workAreas: 0,
    workAreaMeasurements: 0,
    workAreaActivities: 0,
    budgetContacts: 0,
    budgetItems: 0,
    budgetConcepts: 0,
  };

  try {
    // Verify both budgets exist
    const { data: sourceBudget, error: sourceError } = await supabase
      .from("presupuestos")
      .select("id")
      .eq("id", sourceBudgetId)
      .maybeSingle();

    if (sourceError || !sourceBudget) {
      throw new Error("Presupuesto origen no encontrado");
    }

    const { data: targetBudget, error: targetError } = await supabase
      .from("presupuestos")
      .select("id")
      .eq("id", targetBudgetId)
      .maybeSingle();

    if (targetError || !targetBudget) {
      throw new Error("Presupuesto destino no encontrado");
    }

    // Clone phases and build ID mapping
    const { data: sourcePhases, error: phasesError } = await supabase
      .from("budget_phases")
      .select("*")
      .eq("budget_id", sourceBudgetId)
      .order("order_index");

    if (phasesError) throw new Error(phasesError.message);

    const phaseIdMap = new Map<string, string>();

    if (sourcePhases?.length) {
      for (const phase of sourcePhases) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { estimated_end_date, ...phaseInsertable } = phase as any;

        const { data: newPhase, error: phaseError } = await supabase
          .from("budget_phases")
          .insert({
            ...phaseInsertable,
            id: undefined,
            created_at: undefined,
            updated_at: undefined,
            budget_id: targetBudgetId,
            parent_id: null,
          })
          .select("*")
          .single();

        if (phaseError || !newPhase) throw new Error(phaseError?.message);
        phaseIdMap.set(phase.id, newPhase.id);
        stats.phases++;
      }

      // Update parent_id references
      for (const phase of sourcePhases) {
        if (!phase.parent_id) continue;
        const newPhaseId = phaseIdMap.get(phase.id);
        const newParentId = phaseIdMap.get(phase.parent_id);
        if (!newPhaseId || !newParentId) continue;
        await supabase.from("budget_phases").update({ parent_id: newParentId }).eq("id", newPhaseId);
      }
    }

    // Clone measurements
    const { data: sourceMeasurements, error: measurementsError } = await supabase
      .from("budget_measurements")
      .select("*")
      .eq("budget_id", sourceBudgetId);

    if (measurementsError) throw new Error(measurementsError.message);

    const measurementIdMap = new Map<string, string>();

    if (sourceMeasurements?.length) {
      for (const measurement of sourceMeasurements) {
        const { data: newMeasurement, error: measurementError } = await supabase
          .from("budget_measurements")
          .insert({
            ...measurement,
            id: undefined,
            created_at: undefined,
            updated_at: undefined,
            budget_id: targetBudgetId,
            manual_units: preserveMeasurementValues ? measurement.manual_units : null,
          })
          .select("*")
          .single();

        if (measurementError || !newMeasurement) throw new Error(measurementError?.message);
        measurementIdMap.set(measurement.id, newMeasurement.id);
        stats.measurements++;
      }

      // Clone measurement relations
      const { data: sourceRelations, error: relationsError } = await supabase
        .from("budget_measurement_relations")
        .select("*")
        .in("measurement_id", sourceMeasurements.map((m) => m.id));

      if (relationsError) throw new Error(relationsError.message);

      if (sourceRelations?.length) {
        for (const rel of sourceRelations) {
          const newMeasurementId = measurementIdMap.get(rel.measurement_id);
          const newRelatedId = measurementIdMap.get(rel.related_measurement_id);
          if (!newMeasurementId || !newRelatedId) continue;
          const { error } = await supabase.from("budget_measurement_relations").insert({
            measurement_id: newMeasurementId,
            related_measurement_id: newRelatedId,
          });
          if (!error) stats.measurementRelations++;
        }
      }
    }

    // Clone activities
    const { data: sourceActivities, error: activitiesError } = await supabase
      .from("budget_activities")
      .select("*")
      .eq("budget_id", sourceBudgetId);

    if (activitiesError) throw new Error(activitiesError.message);

    const activityIdMap = new Map<string, string>();

    if (sourceActivities?.length) {
      for (const activity of sourceActivities) {
        const newPhaseId = activity.phase_id ? phaseIdMap.get(activity.phase_id) : null;
        const newMeasurementId = activity.measurement_id ? measurementIdMap.get(activity.measurement_id) : null;

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { end_date, ...activityInsertable } = activity as any;

        const { data: newActivity, error: activityError } = await supabase
          .from("budget_activities")
          .insert({
            ...activityInsertable,
            id: undefined,
            created_at: undefined,
            updated_at: undefined,
            budget_id: targetBudgetId,
            phase_id: newPhaseId,
            measurement_id: newMeasurementId,
          })
          .select("*")
          .single();

        if (activityError || !newActivity) throw new Error(activityError?.message);
        activityIdMap.set(activity.id, newActivity.id);
        stats.activities++;
      }
    }

    // Clone resources
    const { data: sourceResources, error: resourcesError } = await supabase
      .from("budget_activity_resources")
      .select("*")
      .eq("budget_id", sourceBudgetId);

    if (resourcesError) throw new Error(resourcesError.message);

    if (sourceResources?.length) {
      for (const resource of sourceResources) {
        const newActivityId = resource.activity_id ? activityIdMap.get(resource.activity_id) : null;

        const { error: resourceError } = await supabase.from("budget_activity_resources").insert({
          ...resource,
          id: undefined,
          created_at: undefined,
          updated_at: undefined,
          budget_id: targetBudgetId,
          activity_id: newActivityId,
          related_units: preserveMeasurementValues ? resource.related_units : null,
        });

        if (resourceError) throw new Error(resourceError.message);
        stats.resources++;
      }
    }

    // Clone spaces
    const { data: sourceSpaces, error: spacesError } = await supabase
      .from("budget_spaces")
      .select("*")
      .eq("budget_id", sourceBudgetId);

    if (spacesError) throw new Error(spacesError.message);

    const spaceIdMap = new Map<string, string>();

    if (sourceSpaces?.length) {
      for (const space of sourceSpaces) {
        const { data: newSpace, error: spaceError } = await supabase
          .from("budget_spaces")
          .insert({
            ...space,
            id: undefined,
            created_at: undefined,
            updated_at: undefined,
            budget_id: targetBudgetId,
            m2_built: preserveMeasurementValues ? space.m2_built : null,
            m2_livable: preserveMeasurementValues ? space.m2_livable : null,
          })
          .select("*")
          .single();

        if (spaceError || !newSpace) throw new Error(spaceError?.message);
        spaceIdMap.set(space.id, newSpace.id);
        stats.spaces++;
      }
    }

    // Clone work areas
    const { data: sourceWorkAreas, error: workAreasError } = await supabase
      .from("budget_work_areas")
      .select("*")
      .eq("budget_id", sourceBudgetId);

    if (workAreasError) throw new Error(workAreasError.message);

    const workAreaIdMap = new Map<string, string>();

    if (sourceWorkAreas?.length) {
      for (const workArea of sourceWorkAreas) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { area_id, ...workAreaInsertable } = workArea as any;

        const { data: newWorkArea, error: workAreaError } = await supabase
          .from("budget_work_areas")
          .insert({
            ...workAreaInsertable,
            id: undefined,
            created_at: undefined,
            updated_at: undefined,
            budget_id: targetBudgetId,
          })
          .select("*")
          .single();

        if (workAreaError || !newWorkArea) throw new Error(workAreaError?.message);
        workAreaIdMap.set(workArea.id, newWorkArea.id);
        stats.workAreas++;
      }

      // Clone work area measurements
      const { data: sourceWorkAreaMeasurements, error: wamError } = await supabase
        .from("budget_work_area_measurements")
        .select("*")
        .in("work_area_id", sourceWorkAreas.map((wa) => wa.id));

      if (wamError) throw new Error(wamError.message);

      if (sourceWorkAreaMeasurements?.length) {
        for (const wam of sourceWorkAreaMeasurements) {
          const newWorkAreaId = workAreaIdMap.get(wam.work_area_id);
          const newMeasurementId = measurementIdMap.get(wam.measurement_id);
          if (!newWorkAreaId || !newMeasurementId) continue;
          const { error } = await supabase.from("budget_work_area_measurements").insert({
            ...wam,
            id: undefined,
            created_at: undefined,
            work_area_id: newWorkAreaId,
            measurement_id: newMeasurementId,
          });
          if (!error) stats.workAreaMeasurements++;
        }
      }

      // Clone work area activities
      const { data: sourceWorkAreaActivities, error: waaError } = await supabase
        .from("budget_work_area_activities")
        .select("*")
        .in("work_area_id", sourceWorkAreas.map((wa) => wa.id));

      if (waaError) throw new Error(waaError.message);

      if (sourceWorkAreaActivities?.length) {
        for (const waa of sourceWorkAreaActivities) {
          const newWorkAreaId = workAreaIdMap.get(waa.work_area_id);
          const newActivityId = activityIdMap.get(waa.activity_id);
          if (!newWorkAreaId || !newActivityId) continue;
          const { error } = await supabase.from("budget_work_area_activities").insert({
            ...waa,
            id: undefined,
            created_at: undefined,
            work_area_id: newWorkAreaId,
            activity_id: newActivityId,
          });
          if (!error) stats.workAreaActivities++;
        }
      }
    }

    // Clone budget_contacts
    const { data: sourceBudgetContacts, error: budgetContactsError } = await supabase
      .from("budget_contacts")
      .select("*")
      .eq("budget_id", sourceBudgetId);

    if (budgetContactsError) throw new Error(budgetContactsError.message);

    if (sourceBudgetContacts?.length) {
      for (const bc of sourceBudgetContacts) {
        const { error } = await supabase.from("budget_contacts").insert({
          ...bc,
          id: undefined,
          created_at: undefined,
          budget_id: targetBudgetId,
        });
        if (!error) stats.budgetContacts++;
      }
    }

    // Clone budget_items
    const { data: sourceBudgetItems, error: budgetItemsError } = await supabase
      .from("budget_items")
      .select("*")
      .eq("budget_id", sourceBudgetId);

    if (budgetItemsError) throw new Error(budgetItemsError.message);

    if (sourceBudgetItems?.length) {
      for (const item of sourceBudgetItems) {
        const { error } = await supabase.from("budget_items").insert({
          ...item,
          id: undefined,
          created_at: undefined,
          updated_at: undefined,
          budget_id: targetBudgetId,
        });
        if (!error) stats.budgetItems++;
      }
    }

    // Clone budget_concepts
    const { data: sourceBudgetConcepts, error: conceptsError } = await supabase
      .from("budget_concepts")
      .select("*")
      .eq("budget_id", sourceBudgetId);

    if (conceptsError) throw new Error(conceptsError.message);

    if (sourceBudgetConcepts?.length) {
      for (const concept of sourceBudgetConcepts) {
        const newPhaseId = concept.phase_id ? phaseIdMap.get(concept.phase_id) : null;
        const newMeasurementId = concept.measurement_id ? measurementIdMap.get(concept.measurement_id) : null;

        const { error } = await supabase.from("budget_concepts").insert({
          ...concept,
          id: undefined,
          created_at: undefined,
          updated_at: undefined,
          budget_id: targetBudgetId,
          phase_id: newPhaseId,
          measurement_id: newMeasurementId,
        });
        if (!error) stats.budgetConcepts++;
      }
    }

    // Clone predesigns (texts only, no files)
    const { data: sourcePredesigns, error: predesignsError } = await supabase
      .from("budget_predesigns")
      .select("*")
      .eq("budget_id", sourceBudgetId);

    if (predesignsError) throw new Error(predesignsError.message);

    if (sourcePredesigns?.length) {
      for (const predesign of sourcePredesigns) {
        const { error } = await supabase.from("budget_predesigns").insert({
          ...predesign,
          id: undefined,
          created_at: undefined,
          updated_at: undefined,
          budget_id: targetBudgetId,
          file_name: null,
          file_path: null,
          file_type: null,
          file_size: null,
          uploaded_by: null,
        });
        if (!error) stats.predesigns++;
      }
    }

    return { success: true, newBudgetId: targetBudgetId, stats };
  } catch (error: any) {
    console.error("Error cloning content to existing budget:", error);
    return {
      success: false,
      error: error.message || "Error desconocido al clonar contenido",
    };
  }
}

/**
 * Clona solo las áreas de trabajo (DÓNDE?) de un presupuesto origen a uno destino.
 * Incluye las relaciones con actividades existentes en el destino que coincidan por código.
 */
export async function cloneWorkAreasOnly(
  sourceBudgetId: string,
  targetBudgetId: string
): Promise<CloneResult> {
  const stats: NonNullable<CloneResult["stats"]> = {
    phases: 0,
    activities: 0,
    resources: 0,
    measurements: 0,
    measurementRelations: 0,
    predesigns: 0,
    spaces: 0,
    workAreas: 0,
    workAreaMeasurements: 0,
    workAreaActivities: 0,
    budgetContacts: 0,
    budgetItems: 0,
    budgetConcepts: 0,
  };

  try {
    // Verify both budgets exist
    const [sourceRes, targetRes] = await Promise.all([
      supabase.from("presupuestos").select("id").eq("id", sourceBudgetId).maybeSingle(),
      supabase.from("presupuestos").select("id").eq("id", targetBudgetId).maybeSingle(),
    ]);

    if (sourceRes.error || !sourceRes.data) {
      throw new Error("Presupuesto origen no encontrado");
    }
    if (targetRes.error || !targetRes.data) {
      throw new Error("Presupuesto destino no encontrado");
    }

    // Fetch source work areas and their activity links
    const [workAreasRes, workAreaActivitiesRes, sourceActivitiesRes, targetActivitiesRes] = await Promise.all([
      supabase.from("budget_work_areas").select("*").eq("budget_id", sourceBudgetId),
      supabase.from("budget_work_area_activities").select("*"),
      supabase.from("budget_activities").select("id, code").eq("budget_id", sourceBudgetId),
      supabase.from("budget_activities").select("id, code").eq("budget_id", targetBudgetId),
    ]);

    if (workAreasRes.error) throw new Error(workAreasRes.error.message);
    if (workAreaActivitiesRes.error) throw new Error(workAreaActivitiesRes.error.message);
    if (sourceActivitiesRes.error) throw new Error(sourceActivitiesRes.error.message);
    if (targetActivitiesRes.error) throw new Error(targetActivitiesRes.error.message);

    const sourceWorkAreas = workAreasRes.data || [];
    const allWorkAreaActivities = workAreaActivitiesRes.data || [];
    const sourceActivities = sourceActivitiesRes.data || [];
    const targetActivities = targetActivitiesRes.data || [];

    // Build activity code mapping from source to target
    const targetActivityByCode = new Map<string, string>();
    targetActivities.forEach((a) => {
      if (a.code) targetActivityByCode.set(a.code, a.id);
    });

    const sourceActivityCodeMap = new Map<string, string>();
    sourceActivities.forEach((a) => {
      if (a.code) sourceActivityCodeMap.set(a.id, a.code);
    });

    // Clone work areas
    const workAreaIdMap = new Map<string, string>();

    for (const workArea of sourceWorkAreas) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { area_id, ...workAreaInsertable } = workArea as any;

      const { data: newWorkArea, error: workAreaError } = await supabase
        .from("budget_work_areas")
        .insert({
          ...workAreaInsertable,
          id: undefined,
          created_at: undefined,
          updated_at: undefined,
          budget_id: targetBudgetId,
        })
        .select("*")
        .single();

      if (workAreaError || !newWorkArea) throw new Error(workAreaError?.message);
      workAreaIdMap.set(workArea.id, newWorkArea.id);
      stats.workAreas++;
    }

    // Clone work area activity links (matching by activity code)
    const sourceWorkAreaIds = sourceWorkAreas.map((wa) => wa.id);
    const relevantLinks = allWorkAreaActivities.filter((l) => sourceWorkAreaIds.includes(l.work_area_id));

    for (const link of relevantLinks) {
      const newWorkAreaId = workAreaIdMap.get(link.work_area_id);
      if (!newWorkAreaId) continue;

      // Find the activity code from source and map to target activity
      const sourceActivityCode = sourceActivityCodeMap.get(link.activity_id);
      if (!sourceActivityCode) continue;

      const targetActivityId = targetActivityByCode.get(sourceActivityCode);
      if (!targetActivityId) continue;

      const { error } = await supabase.from("budget_work_area_activities").insert({
        work_area_id: newWorkAreaId,
        activity_id: targetActivityId,
      });
      if (!error) stats.workAreaActivities++;
    }

    return { success: true, newBudgetId: targetBudgetId, stats };
  } catch (error: any) {
    console.error("Error cloning work areas only:", error);
    return {
      success: false,
      error: error.message || "Error desconocido al clonar áreas de trabajo",
    };
  }
}

export async function cloneBudget(
  sourceBudgetId: string,
  newBudgetData: NewBudgetData,
  options: CloneOptions = {}
): Promise<CloneResult> {
  const { preserveMeasurementValues = false } = options;

  const stats: NonNullable<CloneResult["stats"]> = {
    phases: 0,
    activities: 0,
    resources: 0,
    measurements: 0,
    measurementRelations: 0,
    predesigns: 0,
    spaces: 0,
    workAreas: 0,
    workAreaMeasurements: 0,
    workAreaActivities: 0,
    budgetContacts: 0,
    budgetItems: 0,
    budgetConcepts: 0,
  };

  let newBudgetId: string | undefined;

  try {
    // 0) Load source presupuesto (so we can clone ALL fields)
    const { data: sourceBudget, error: sourceBudgetError } = await supabase
      .from("presupuestos")
      .select("*")
      .eq("id", sourceBudgetId)
      .maybeSingle();

    if (sourceBudgetError || !sourceBudget) {
      throw new Error(
        `No se pudo cargar el presupuesto origen: ${sourceBudgetError?.message || "no encontrado"}`
      );
    }

    // 1) Get next correlative code
    const { data: maxCodeData } = await supabase
      .from("presupuestos")
      .select("codigo_correlativo")
      .order("codigo_correlativo", { ascending: false })
      .limit(1);

    const nextCode = (maxCodeData?.[0]?.codigo_correlativo || 0) + 1;

    // 2) Create new presupuesto: clone ALL fields from source, override only what's explicitly set
    const { data: newBudget, error: budgetError } = await supabase
      .from("presupuestos")
      .insert({
        ...sourceBudget,
        id: undefined,
        created_at: undefined,
        updated_at: undefined,
        codigo_correlativo: nextCode,
        nombre: newBudgetData.nombre,
        version: newBudgetData.version,
        poblacion: newBudgetData.poblacion,
        provincia: newBudgetData.provincia ?? sourceBudget.provincia ?? null,
        coordenadas_lat: newBudgetData.coordenadas_lat ?? sourceBudget.coordenadas_lat ?? null,
        coordenadas_lng: newBudgetData.coordenadas_lng ?? sourceBudget.coordenadas_lng ?? null,
        project_id: newBudgetData.project_id ?? sourceBudget.project_id ?? null,
      })
      .select("*")
      .single();

    if (budgetError || !newBudget) {
      throw new Error(`Error creando presupuesto: ${budgetError?.message}`);
    }

    newBudgetId = newBudget.id as string;
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (userId) {
        const { data: accessRow } = await supabase
          .from("user_presupuestos")
          .select("role")
          .eq("user_id", userId)
          .eq("presupuesto_id", sourceBudgetId)
          .maybeSingle();

        if (accessRow?.role) {
          await supabase.from("user_presupuestos").insert({
            user_id: userId,
            presupuesto_id: newBudgetId,
            role: accessRow.role,
          });
        }
      }
    } catch {
      // silent
    }

    // 3) Clone phases and build ID mapping
    const { data: sourcePhases, error: phasesError } = await supabase
      .from("budget_phases")
      .select("*")
      .eq("budget_id", sourceBudgetId)
      .order("order_index");

    if (phasesError) throw new Error(phasesError.message);

    const phaseIdMap = new Map<string, string>();

    if (sourcePhases?.length) {
      for (const phase of sourcePhases) {
        // NOTE: budget_phases.estimated_end_date es una columna GENERATED ALWAYS, no se puede insertar.
        // Extraemos campos permitidos y omitimos los generados.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { estimated_end_date, ...phaseInsertable } = phase as any;

        const { data: newPhase, error: phaseError } = await supabase
          .from("budget_phases")
          .insert({
            ...phaseInsertable,
            id: undefined,
            created_at: undefined,
            updated_at: undefined,
            budget_id: newBudgetId,
            parent_id: null,
          })
          .select("*")
          .single();


        if (phaseError || !newPhase) throw new Error(phaseError?.message);
        phaseIdMap.set(phase.id, newPhase.id);
        stats.phases++;
      }

      for (const phase of sourcePhases) {
        if (!phase.parent_id) continue;
        const newPhaseId = phaseIdMap.get(phase.id);
        const newParentId = phaseIdMap.get(phase.parent_id);
        if (!newPhaseId || !newParentId) continue;
        await supabase.from("budget_phases").update({ parent_id: newParentId }).eq("id", newPhaseId);
      }
    }

    // 4) Clone measurements and build ID mapping
    const { data: sourceMeasurements, error: measurementsError } = await supabase
      .from("budget_measurements")
      .select("*")
      .eq("budget_id", sourceBudgetId);

    if (measurementsError) throw new Error(measurementsError.message);

    const measurementIdMap = new Map<string, string>();

    if (sourceMeasurements?.length) {
      for (const measurement of sourceMeasurements) {
        const { data: newMeasurement, error: measurementError } = await supabase
          .from("budget_measurements")
          .insert({
            ...measurement,
            id: undefined,
            created_at: undefined,
            updated_at: undefined,
            budget_id: newBudgetId,
            manual_units: preserveMeasurementValues ? measurement.manual_units : null,
          })
          .select("*")
          .single();

        if (measurementError || !newMeasurement) throw new Error(measurementError?.message);
        measurementIdMap.set(measurement.id, newMeasurement.id);
        stats.measurements++;
      }

      // Clone measurement relations
      const { data: sourceRelations, error: relationsError } = await supabase
        .from("budget_measurement_relations")
        .select("*")
        .in(
          "measurement_id",
          sourceMeasurements.map((m) => m.id)
        );

      if (relationsError) throw new Error(relationsError.message);

      if (sourceRelations?.length) {
        for (const rel of sourceRelations) {
          const newMeasurementId = measurementIdMap.get(rel.measurement_id);
          const newRelatedId = measurementIdMap.get(rel.related_measurement_id);
          if (!newMeasurementId || !newRelatedId) continue;
          const { error } = await supabase.from("budget_measurement_relations").insert({
            measurement_id: newMeasurementId,
            related_measurement_id: newRelatedId,
          });
          if (!error) stats.measurementRelations++;
        }
      }
    }

    // 5) Clone activities and build ID mapping
    const { data: sourceActivities, error: activitiesError } = await supabase
      .from("budget_activities")
      .select("*")
      .eq("budget_id", sourceBudgetId);

    if (activitiesError) throw new Error(activitiesError.message);

    const activityIdMap = new Map<string, string>();

    if (sourceActivities?.length) {
      for (const activity of sourceActivities) {
        const newPhaseId = activity.phase_id ? phaseIdMap.get(activity.phase_id) : null;
        const newMeasurementId = activity.measurement_id
          ? measurementIdMap.get(activity.measurement_id)
          : null;

        // NOTE: budget_activities.end_date es una columna GENERATED ALWAYS, no se puede insertar.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { end_date, ...activityInsertable } = activity as any;

        const { data: newActivity, error: activityError } = await supabase
          .from("budget_activities")
          .insert({
            ...activityInsertable,
            id: undefined,
            created_at: undefined,
            updated_at: undefined,
            budget_id: newBudgetId,
            phase_id: newPhaseId,
            measurement_id: newMeasurementId,
          })
          .select("*")
          .single();

        if (activityError || !newActivity) throw new Error(activityError?.message);
        activityIdMap.set(activity.id, newActivity.id);
        stats.activities++;
      }
    }

    // 6) Clone resources (linked to new activities)
    const { data: sourceResources, error: resourcesError } = await supabase
      .from("budget_activity_resources")
      .select("*")
      .eq("budget_id", sourceBudgetId);

    if (resourcesError) throw new Error(resourcesError.message);

    if (sourceResources?.length) {
      for (const resource of sourceResources) {
        const newActivityId = resource.activity_id ? activityIdMap.get(resource.activity_id) : null;

        const { error: resourceError } = await supabase.from("budget_activity_resources").insert({
          ...resource,
          id: undefined,
          created_at: undefined,
          updated_at: undefined,
          budget_id: newBudgetId,
          activity_id: newActivityId,
          related_units: preserveMeasurementValues ? resource.related_units : null,
        });

        if (resourceError) throw new Error(resourceError.message);
        stats.resources++;
      }
    }

    // 7) Clone spaces (budget_spaces) + map space IDs (for work areas area_id)
    const { data: sourceSpaces, error: spacesError } = await supabase
      .from("budget_spaces")
      .select("*")
      .eq("budget_id", sourceBudgetId);

    if (spacesError) throw new Error(spacesError.message);

    const spaceIdMap = new Map<string, string>();

    if (sourceSpaces?.length) {
      for (const space of sourceSpaces) {
        const { data: newSpace, error: spaceError } = await supabase
          .from("budget_spaces")
          .insert({
            ...space,
            id: undefined,
            created_at: undefined,
            updated_at: undefined,
            budget_id: newBudgetId,
            m2_built: preserveMeasurementValues ? space.m2_built : null,
            m2_livable: preserveMeasurementValues ? space.m2_livable : null,
          })
          .select("*")
          .single();

        if (spaceError || !newSpace) throw new Error(spaceError?.message);
        spaceIdMap.set(space.id, newSpace.id);
        stats.spaces++;
      }
    }

    // 8) Clone work areas and build ID mapping
    const { data: sourceWorkAreas, error: workAreasError } = await supabase
      .from("budget_work_areas")
      .select("*")
      .eq("budget_id", sourceBudgetId);

    if (workAreasError) throw new Error(workAreasError.message);

    const workAreaIdMap = new Map<string, string>();

    const isUuid = (v: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

    if (sourceWorkAreas?.length) {
      for (const workArea of sourceWorkAreas) {
        // NOTE: budget_work_areas.area_id es una columna GENERATED ALWAYS, no se puede insertar.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { area_id, ...workAreaInsertable } = workArea as any;

        const { data: newWorkArea, error: workAreaError } = await supabase
          .from("budget_work_areas")
          .insert({
            ...workAreaInsertable,
            id: undefined,
            created_at: undefined,
            updated_at: undefined,
            budget_id: newBudgetId,
          })
          .select("*")
          .single();

        if (workAreaError || !newWorkArea) throw new Error(workAreaError?.message);
        workAreaIdMap.set(workArea.id, newWorkArea.id);
        stats.workAreas++;
      }

      // Clone work area measurements
      const { data: sourceWorkAreaMeasurements, error: wamError } = await supabase
        .from("budget_work_area_measurements")
        .select("*")
        .in(
          "work_area_id",
          sourceWorkAreas.map((wa) => wa.id)
        );

      if (wamError) throw new Error(wamError.message);

      if (sourceWorkAreaMeasurements?.length) {
        for (const wam of sourceWorkAreaMeasurements) {
          const newWorkAreaId = workAreaIdMap.get(wam.work_area_id);
          const newMeasurementId = measurementIdMap.get(wam.measurement_id);
          if (!newWorkAreaId || !newMeasurementId) continue;
          const { error } = await supabase.from("budget_work_area_measurements").insert({
            ...wam,
            id: undefined,
            created_at: undefined,
            work_area_id: newWorkAreaId,
            measurement_id: newMeasurementId,
          });
          if (!error) stats.workAreaMeasurements++;
        }
      }

      // Clone work area activities
      const { data: sourceWorkAreaActivities, error: waaError } = await supabase
        .from("budget_work_area_activities")
        .select("*")
        .in(
          "work_area_id",
          sourceWorkAreas.map((wa) => wa.id)
        );

      if (waaError) throw new Error(waaError.message);

      if (sourceWorkAreaActivities?.length) {
        for (const waa of sourceWorkAreaActivities) {
          const newWorkAreaId = workAreaIdMap.get(waa.work_area_id);
          const newActivityId = activityIdMap.get(waa.activity_id);
          if (!newWorkAreaId || !newActivityId) continue;
          const { error } = await supabase.from("budget_work_area_activities").insert({
            ...waa,
            id: undefined,
            created_at: undefined,
            work_area_id: newWorkAreaId,
            activity_id: newActivityId,
          });
          if (!error) stats.workAreaActivities++;
        }
      }
    }

    // 9) Clone budget_contacts
    const { data: sourceBudgetContacts, error: budgetContactsError } = await supabase
      .from("budget_contacts")
      .select("*")
      .eq("budget_id", sourceBudgetId);

    if (budgetContactsError) throw new Error(budgetContactsError.message);

    if (sourceBudgetContacts?.length) {
      for (const bc of sourceBudgetContacts) {
        const { error } = await supabase.from("budget_contacts").insert({
          ...bc,
          id: undefined,
          created_at: undefined,
          budget_id: newBudgetId,
        });
        if (!error) stats.budgetContacts++;
      }
    }

    // 10) Clone budget_items
    const { data: sourceBudgetItems, error: budgetItemsError } = await supabase
      .from("budget_items")
      .select("*")
      .eq("budget_id", sourceBudgetId);

    if (budgetItemsError) throw new Error(budgetItemsError.message);

    if (sourceBudgetItems?.length) {
      for (const item of sourceBudgetItems) {
        const { error } = await supabase.from("budget_items").insert({
          ...item,
          id: undefined,
          created_at: undefined,
          updated_at: undefined,
          budget_id: newBudgetId,
        });
        if (!error) stats.budgetItems++;
      }
    }

    // 11) Clone budget_concepts (map phase + measurement)
    const { data: sourceBudgetConcepts, error: conceptsError } = await supabase
      .from("budget_concepts")
      .select("*")
      .eq("budget_id", sourceBudgetId);

    if (conceptsError) throw new Error(conceptsError.message);

    if (sourceBudgetConcepts?.length) {
      for (const concept of sourceBudgetConcepts) {
        const newPhaseId = concept.phase_id ? phaseIdMap.get(concept.phase_id) : null;
        const newMeasurementId = concept.measurement_id ? measurementIdMap.get(concept.measurement_id) : null;

        const { error } = await supabase.from("budget_concepts").insert({
          ...concept,
          id: undefined,
          created_at: undefined,
          updated_at: undefined,
          budget_id: newBudgetId,
          phase_id: newPhaseId,
          measurement_id: newMeasurementId,
        });
        if (!error) stats.budgetConcepts++;
      }
    }

    // 12) Clone predesigns (texts always, files excluded per user request)
    const { data: sourcePredesigns, error: predesignsError } = await supabase
      .from("budget_predesigns")
      .select("*")
      .eq("budget_id", sourceBudgetId);

    if (predesignsError) throw new Error(predesignsError.message);

    if (sourcePredesigns?.length) {
      for (const predesign of sourcePredesigns) {
        // Clone predesign entry without files (files excluded from clone)
        const { error } = await supabase.from("budget_predesigns").insert({
          ...predesign,
          id: undefined,
          created_at: undefined,
          updated_at: undefined,
          budget_id: newBudgetId,
          file_name: null,
          file_path: null,
          file_type: null,
          file_size: null,
          uploaded_by: null,
        });
        if (!error) stats.predesigns++;
      }
    }

    return { success: true, newBudgetId, stats };
  } catch (error: any) {
    console.error("Error cloning budget:", error);

    // Si el proceso falla a mitad, puede quedar una copia parcial.
    // Intentamos limpiar el presupuesto nuevo (best-effort).
    if (newBudgetId) {
      try {
        await supabase.from("user_presupuestos").delete().eq("presupuesto_id", newBudgetId);
        await supabase.from("presupuestos").delete().eq("id", newBudgetId);
      } catch {
        // silent
      }
    }

    return {
      success: false,
      error: error.message || "Error desconocido al clonar",
    };
  }
}
