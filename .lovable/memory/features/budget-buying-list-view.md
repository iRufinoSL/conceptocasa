# Memory: features/budget-buying-list-view
Updated: now

## Descripción General
La 'Lista compra' (Buying List) es una funcionalidad dentro de la pestaña 'CUÁNDO? (Fases)' que permite gestionar las unidades de compra de recursos del proyecto, diferenciándolas de las unidades de cálculo del presupuesto.

## Vistas Disponibles

### 1. Vista por Actividad (Por Actividad)
Organización jerárquica en tres niveles:
- **Fase** → Agrupación expansible por fases del proyecto
- **ActividadID** → Agrupación por código de actividad dentro de cada fase
- **Recursos** → Listado de recursos con cantidades, costes y proveedores

### 2. Vista por Proveedor (Por Proveedor)
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

### Ejemplo de Conversión:
- Hormigón para solera de 15cm de altura
- Unidades calculadas: 100 m2 × coste/m2
- Factor de conversión: 0.15 (15cm = 0.15m)
- Unidades de compra: 100 × 0.15 = 15 m3 de hormigón

## Interfaz de Usuario

### Botón de Edición
Cada recurso muestra un botón de lápiz (hover) para abrir el diálogo de unidades de compra.

### Diálogo de Unidades de Compra (PurchaseUnitDialog)
- Muestra unidades calculadas del presupuesto
- Input para factor de conversión
- Selector de unidad de compra
- Input para coste por unidad de compra
- Vista previa del resumen de compra (cantidad y coste total)

### Indicador Visual
Los recursos con unidades de compra configuradas muestran un badge verde "Ud. Compra".

## Componentes

- `BuyingListView.tsx`: Vista principal con toggle entre modos
- `SupplierBuyingListView.tsx`: Vista agrupada por proveedor con filtros
- `PurchaseUnitDialog.tsx`: Diálogo para editar unidades de compra
