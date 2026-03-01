# Memory: features/budget/volume-measurement-sync
Updated: now

Las mediciones calculadas en 'Volúmenes' se sincronizan automáticamente con `budget_measurements` (source: 'volumen_auto') en tres niveles de granularidad:

### Niveles de medición
1. **Por estancia** (`source_classification`: `vol_<tipo>_room_<roomId>`): Medición individual de cada espacio/habitación. Ej: "Suelo Hab. Mediana 1", "Paredes externas Salón".
2. **Por nivel** (`source_classification`: `vol_<tipo>_<floorId>`): Totales agregados por planta. Ej: "Suelos Nivel 1", "Paredes internas Nivel 1". Paredes compartidas se cuentan al 50%.
3. **Total vivienda** (`source_classification`: `vol_<tipo>_total`): Suma global de todos los niveles.

### Tipos de superficie sincronizados
- `suelo`: m² de suelo
- `techo`: m² de techo (plano o inclinado)
- `ext`: m² de paredes externas
- `int`: m² de paredes internas
- `roof`: m² de cubierta (solo bajo cubierta)
- `volumen`: m³ de volumen (solo por estancia)

### Vista "Por Tipo Superficie"
En la pestaña Mediciones, la vista "Por Tipo Superficie" agrupa estos registros por categoría y muestra tres filas por tipo: Estancia → Nivel → Total. Esto permite en QUÉ? (Actividades) seleccionar una medición concreta de una estancia o una agrupada de nivel/total.
