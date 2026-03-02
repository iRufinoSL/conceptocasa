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

### Selector en QUÉ? (TO.LO.SA.systems)
En TO.LO.SA.systems, la pestaña Mediciones de cada actividad (QUÉ?) usa exclusivamente mediciones de Volúmenes (`source: 'volumen_auto'`), organizadas en dos vistas:
- **Por Nivel**: Agrupa mediciones por planta, mostrando primero los totales de nivel y luego las mediciones por espacio agrupadas por tipo de superficie.
- **Por Espacio**: Agrupa mediciones por habitación/estancia individual.

Las actividades pueden **heredar mediciones del padre**: si una actividad no tiene mediciones propias vinculadas, se buscan automáticamente las del ancestro más cercano que las tenga (badge "heredadas del padre").

El panel permite vincular/desvincular mediciones con un click. Las mediciones heredadas son de solo lectura.
