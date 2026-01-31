# Memory: features/budget-buying-list-view
Updated: now

## Descripción General
Existen dos ubicaciones de 'Lista compra':
1. **CUÁNDO? (Fases)**: Vista original con jerarquía Fase → ActividadID → Recursos
2. **CÓMO? (Recursos)**: Nueva vista con jerarquía Área trabajo → ActividadID → Fecha real inicio → Recursos

## Vista en CÓMO? (ResourcesWorkAreaBuyingView)

### Jerarquía
- **Área de trabajo** → Obtenida de la tabla budget_work_area_activities
- **ActividadID** → Código completo con fase y nombre
- **Fecha real inicio** → actual_start_date de la actividad (badge visual)
- **Recurso** → Campos de lista de compra

### Campos Mostrados por Recurso
- Nombre del recurso
- Tipo de recurso (badge de color)
- Suministrador (nombre del contacto CRM)
- Uds calculadas (manual_units ?? related_units)
- Coste ud externa (external_unit_cost)
- Subtotal

### Filtro por Rango de Fechas
- Permite filtrar actividades por fecha real de inicio (actual_start_date)
- Inputs manuales para "Desde" y "Hasta"
- Solo aparecen recursos cuya actividad tiene fecha dentro del rango
- Botón "Limpiar" para resetear filtros

### Componente
- `ResourcesWorkAreaBuyingView.tsx`: Vista en CÓMO? con filtro por fechas

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

## Conversión de Unidades de Compra

Los recursos pueden tener dos tipos de unidades:
1. **Unidades calculadas** (del presupuesto): m2 de solera, metros lineales, etc.
2. **Unidades de compra** (para el proveedor): m3 de hormigón, kg de material, etc.

### Campos en budget_activity_resources:
- `purchase_unit`: Unidad de compra (ej: 'm3')
- `purchase_unit_quantity`: Cantidad convertida a comprar
- `purchase_unit_cost`: Coste por unidad de compra
- `conversion_factor`: Factor de conversión (ej: 0.15 para 15cm de altura)

## Componentes
- `BuyingListView.tsx`: Vista en CUÁNDO? con toggle entre modos
- `SupplierBuyingListView.tsx`: Vista agrupada por proveedor con filtros
- `ResourcesWorkAreaBuyingView.tsx`: Vista en CÓMO? por área de trabajo
- `PurchaseUnitDialog.tsx`: Diálogo para editar unidades de compra
