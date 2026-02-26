# Memory: features/budget/volume-architecture
Updated: now

## Volume Model

Each space (room) in the floor plan represents a **volume** (a cube/rectangular prism). Each volume has 6 faces (4 walls + floor + ceiling/roof), and each face can itself be composed of multiple layers (objects).

### Per-Room Overrides
- `height`: Individual room height, overrides the plan's `defaultHeight`
- `extWallThickness`: Override external wall thickness for this room
- `intWallThickness`: Override internal wall thickness for this room

When overrides are null/undefined, the plan-level defaults apply.

### Wall Layers (Multi-Layer Composition)
Each wall face can have multiple layers stored in `budget_floor_plan_wall_layers`:
- `layer_type`: bloque, revoco, aislamiento, placa_yeso, etc.
- `is_core`: true for the structural block layer (determines coordinate reference)
- `layer_order`: 0 = innermost, higher = more exterior
- `thickness_mm`: layer thickness in mm

The total wall thickness = sum of all layer thicknesses. Coordinates always reference the **core (block) layer** outer face.

### A-D Perimeter Corners
Main corners (A, B, C, D) are **user-editable** and represent the building's physical perimeter. They are auto-initialized from the bounding box only when first created (no main corners exist for the floor). After that, they are NOT overwritten by bounding box changes — the user can manually reposition them to exclude non-building elements (e.g., sidewalks, aceras). The dimension lines (AB, AD, etc.) use the **stored** corner positions, not the computed bounding box, ensuring distances reflect the actual building perimeter.
