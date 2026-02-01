# Memory: features/budget-buying-list-view
Updated: now

## Descripción General
Existen dos ubicaciones de 'Lista compra':
1. **CUÁNDO? (Fases)**: Vista original con jerarquía Fase → ActividadID → Recursos
2. **CÓMO? (Recursos)**: Nueva vista con jerarquía Nivel → Área trabajo → ActividadID → Recursos

## Vista en CÓMO? (ResourcesWorkAreaBuyingView)

### Jerarquía Completa
- **Nivel** → Primer agrupamiento (Planta Baja, Planta 1, etc.)
- **Área de trabajo** → Segundo nivel de agrupación
- **ActividadID** → Código completo con fase y nombre
- **Recurso** → Campos de lista de compra con botón editar

### Filtro de Actividades
- **IMPORTANTE**: Solo aparecen actividades donde `uses_measurement = true`
- Las actividades con "Uso Pres. = No" se excluyen automáticamente del listado
- Este campo ahora se llama "Uso en Presupuesto" (antes "Usa Medición")

### Campos Mostrados por Recurso
- Nombre del recurso
- Tipo de recurso (badge de color)
- Suministrador (nombre del contacto CRM)
- Uds calculadas (manual_units ?? related_units)
- Coste ud externa (external_unit_cost)
- Subtotal
- **Botón Editar**: Abre formulario del recurso y vuelve a este listado

### Fechas en la Fila de Actividad
- **Fecha real inicio** (actual_start_date) - Editable inline
- **Fecha real fin** (actual_end_date) - Editable inline
- Ambas fechas usan InlineDatePicker con calendario en español

### Filtro por Rango de Fechas
- Permite filtrar actividades por fecha real de inicio (actual_start_date)
- Inputs manuales para "Desde" y "Hasta"
- Solo aparecen recursos cuya actividad tiene fecha dentro del rango
- Botón "Limpiar" para resetear filtros

### Componente
- `ResourcesWorkAreaBuyingView.tsx`: Vista en CÓMO? con:
  - Jerarquía Nivel → Área → Actividad → Recurso
  - Filtro automático por uses_measurement = true
  - Filtro manual por fechas
  - Edición inline de fechas reales (inicio y fin)
  - Botón editar en recursos
  - Callbacks: onEditResource, onRefresh

## Vista en CUÁNDO? (BuyingListView)

### Vistas Disponibles

#### 1. Vista por Actividad (Por Actividad)
Organización jerárquica en tres niveles:
- **Fase** → Agrupación expansible por fases del proyecto
- **ActividadID** → Agrupación por código de actividad dentro de cada fase
- **Recursos** → Listado de recursos con cantidades, costes y proveedores

#### 2. Vista por Proveedor (Por Proveedor)
Organización jerárquica alternativa:
- **Fase** → Agrupación por fases
- **Suministrador** → Agrupación por proveedor/suministrador
- **Recursos** → Con unidades de compra convertidas

Esta vista incluye:
- Filtro por proveedor específico
- Filtro por período de fechas (fecha real de inicio/fin)

## Columna "Uso Pres." en QUÉ? Por Fase
- Columna añadida en el listado "Por Fase" de la pestaña QUÉ? (Actividades)
- Posición: después de la columna "Opciones"
- **Editable inline**: Click para alternar entre Sí/No
- Badge visual: "Sí" (default) / "No" (secondary)
- Actualiza `uses_measurement` en `budget_activities`
- Renombrado de "Usa Med." a "Uso Pres." (Uso en Presupuesto)

## Campos de Lista de Compra

Los recursos tienen campos específicos para la lista de compra:

### Campos en budget_activity_resources:
- `purchase_unit_cost`: €Coste ud compra (por defecto = external_unit_cost)
- `purchase_vat_percent`: %IVA compra (por defecto = 21%)
- `purchase_units`: Uds lista compra (por defecto = manual_units ?? related_units)
- `purchase_unit_measure`: Ud medida lista compra (por defecto = unit)
- `purchase_unit`: Unidad de compra legacy (ej: 'm3')
- `purchase_unit_quantity`: Cantidad convertida legacy
- `conversion_factor`: Factor de conversión (ej: 0.15 para 15cm de altura)

### Campos Calculados:
- **€Importe IVA Recurso** = `purchase_unit_cost × purchase_units × (purchase_vat_percent / 100)`
- **€SubTotal lista compra Recurso** = `(purchase_unit_cost × purchase_units) + €Importe IVA Recurso`

### Valores por Defecto:
- Los campos de compra heredan automáticamente los valores base si no se especifican
- El usuario puede modificar cualquiera de estos campos de forma independiente

## Componente Unificado (BuyingListUnified.tsx)

### Características
- Usado tanto en Agenda como en CÓMO? (Recursos)
- **Persistencia de fechas**: El rango de fechas se guarda en localStorage por presupuesto
- Las fechas persisten al salir y volver a entrar en la aplicación

### Vistas Disponibles
- **Por Actividad**: Agrupado por ActividadID con fechas inline
- **Por Proveedor**: Agrupado por proveedor con edición inline
- **Por Recurso**: Lista plana de todos los recursos

### Acciones por Recurso
- **Lápiz**: Edición inline de coste, unidad y cantidad de compra
- **Carrito**: Diálogo completo para unidad de compra
- **Edit**: Acceso al formulario completo del recurso

### Edición Inline de Proveedor
- Click en el nombre del proveedor abre selector
- Recursos sin proveedor muestran "Sin proveedor" clickeable
- Actualización inmediata sin recargar

## Componentes
- `BuyingListUnified.tsx`: Componente unificado para Agenda y CÓMO?
- `BuyingListView.tsx`: Vista en CUÁNDO? con toggle entre modos
- `SupplierBuyingListView.tsx`: Vista agrupada por proveedor con filtros
- `ResourcesWorkAreaBuyingView.tsx`: Vista en CÓMO? por área de trabajo
- `PurchaseUnitDialog.tsx`: Diálogo para editar unidades de compra
