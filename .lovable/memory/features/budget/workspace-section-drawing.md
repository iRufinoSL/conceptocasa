# Memory: features/budget/workspace-section-drawing
Updated: now

## Draw Workspaces Directly on Sections

New alternative workflow that coexists with the original (create workspace → assign section):

### Flow
1. User opens a Section grid (any type: Z, Y, X)
2. Clicks "**+ Nuevo Espacio**" button in the grid toolbar
3. Types a name in the inline input field
4. Clicks "**Dibujar**" → enters drawing mode (crosshair cursor)
5. Clicks on grid intersections to place vertices
6. Double-clicks to close the figure
7. Edit panel appears with vertex coordinates, name field, and save/cancel
8. Can draw multiple workspaces without leaving the section

### Edit Existing
- **Click on polygon**: Selects it for editing (vertices become draggable)
- **Polygon list button**: "Espacios (N)" in toolbar shows list of all standalone polygons
- From list: can edit (pencil icon) or delete (trash icon) each polygon
- Renaming via the edit panel's name input field

### Data Storage
- Standalone polygons stored as `SectionPolygon` entries in `section.polygons[]`
- IDs prefixed with `section_poly_` to distinguish from workspace-bound polygons
- Persisted in `custom_corners.customSections[].polygons[]` JSONB

### Coexistence
Both flows work simultaneously:
- Original: workspace projections from `wallProjectionsBySection` (existing rooms)
- New: standalone polygons drawn directly on sections (no room record needed)
