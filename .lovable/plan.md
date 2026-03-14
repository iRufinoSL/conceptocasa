

## Plan: Completar migración de "Áreas de trabajo" a "Espacios de trabajo"

### Cambios pendientes identificados

El componente principal `BudgetActivitiesTab.tsx` ya migró correctamente al nuevo sistema de `WorkspaceInlineSelect` y `budget_activity_workspaces`. Sin embargo, quedan dos áreas por actualizar:

### 1. `ActivitiesWorkAreaGroupedView.tsx` — Sigue usando el antiguo sistema de WorkArea

Este componente (vista "Por Área") aún importa y usa `WorkAreaInlineSelect` (el antiguo componente basado en áreas de trabajo), con interfaces `WorkArea` y `WorkAreaRelation` que usan `work_area_id`. Necesita:

- Cambiar las interfaces internas (`WorkArea` → estructura compatible con `WorkspaceRoom`, `WorkAreaRelation` → `WorkspaceRelation` con `workspace_id`)
- Reemplazar import de `WorkAreaInlineSelect` por `WorkspaceInlineSelect`
- Actualizar la lógica de agrupación (actualmente agrupa por `level` de las áreas de trabajo; debe agruparse de forma compatible con los espacios/rooms del plano)
- Actualizar props del componente para recibir `workspaces` y `workspaceRelations` en lugar de `workAreas` y `workAreaRelations`
- Actualizar las columnas "Áreas" → "Espacios" y la referencia `work_area_id` → `workspace_id`

### 2. `BudgetActivitiesTab.tsx` — Ajustes menores de integración

- Líneas 3256-3257: Quitar los casts `as any` al pasar props a `ActivitiesWorkAreaGroupedView`
- Línea 2121: Cambiar label del botón "Por Área" → "Por Espacio"
- Línea 3267: Quitar cast `as any` en `onUpdateWorkAreas`

### 3. Herencia padre→hijo en el save

Cuando se guarda una actividad padre con `workspace_ids`, propagar automáticamente esos workspace_ids a todas las actividades hijas (las que tienen `parent_activity_id` apuntando a esta actividad). Esto se hará en `handleSave` tras guardar las relaciones del padre.

### Archivos a modificar

- `src/components/presupuestos/ActivitiesWorkAreaGroupedView.tsx` — Migrar completo a WorkspaceInlineSelect y nuevas interfaces
- `src/components/presupuestos/BudgetActivitiesTab.tsx` — Ajustes de props, labels y herencia en save

