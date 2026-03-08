# Memory: features/budget/workspace-section-drawing
Updated: now

## Draw Workspace Faces Directly on Sections

New workflow that coexists with the original (create workspace → assign section). The key concept: **workspace name is unique and global** — drawing on different sections defines different **faces** (Suelo, Paredes, Techo) of the **same** workspace.

### Flow
1. User opens a Section grid (Z, Y, or X)
2. Clicks "**+ Dibujar Cara**" in the grid toolbar
3. **Selects workspace**: dropdown with existing workspace names + option to type new name
4. **Selects face type**: auto-detected by section type, but editable
   - Z section → pre-selects "Suelo" (options: Suelo, Techo, Pared)
   - Y section → pre-selects "Pared"
   - X section → pre-selects "Pared"
5. Clicks "Dibujar [face]" → enters drawing mode
6. Clicks on grid to place vertices, double-click to close
7. Edit panel shows vertex coords, name, and save/cancel
8. Walls auto-number: P1, P2, P3...

### Naming Convention
- Suelo: `{workspace} (Suelo)` → ID: `ws_{name}_suelo`
- Techo: `{workspace} (Techo)` → ID: `ws_{name}_techo`
- Pared: `{workspace} P{n}` → ID: `ws_{name}_pared{n}`

### Polygon List
- "Caras (N)" button shows all faces grouped by workspace name
- Each face: click to edit geometry, pencil to edit, trash to delete

### Data Storage
- All faces stored as `SectionPolygon` entries in `section.polygons[]`
- Persisted in `custom_corners.customSections[].polygons[]` JSONB
- Workspace names collected from: rooms, wallProjections, and all section polygons
