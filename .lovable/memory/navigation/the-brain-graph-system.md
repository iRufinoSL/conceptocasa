# Memory: navigation/the-brain-graph-system
Updated: now

The application features a global graphical navigation system (at '/brain') inspired by 'TheBrain' software. It uses a 'Plex' layout where the active node is centered, parents appear above, children below, and siblings to the sides. Parent-child connections use solid gradient lines, while siblings use dashed lines.

## Budget Hierarchy
The "Presupuestos" node has three sub-category nodes: 'Activos', 'En Ejecución', and 'Archivados'. Each individual budget node contains:

### Primary Sub-levels (6 key questions):
1. **QUÉ?** → actividades tab
2. **CÓMO?** → recursos tab
3. **DÓNDE?** → donde tab (unified with 3 collapsible sub-sections)
4. **CUÁNDO?** → fases tab
5. **CUÁNTO?** → cuanto-cuesta tab
6. **QUIÉN?** → contactos tab

### DÓNDE? Sub-items (3 collapsible sections, all collapsed by default):
1. **Planos** → Cuadrículas por nivel
2. **Áreas de trabajo** → Zonas de trabajo
3. **Espacios** → Espacios con coordenadas XYZ

### Secondary Menu ('Más...'):
Urbanismo, Ante-proyecto, Mediciones, Documentos, Agenda, Comunicaciones, Administración, Resumen

## Persistence
The system persists both the active node and the expanded/collapsed state of categories in localStorage. Double-clicking a node opens a side panel with module content. The `ensureBudgetSublevels` function automatically creates missing sub-levels for budget nodes.
