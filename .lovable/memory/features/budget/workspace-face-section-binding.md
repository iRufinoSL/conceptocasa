# Memory: features/budget/workspace-face-section-binding
Updated: now

## Face-to-Section Architecture

Each workspace face (floor, walls, ceiling) belongs to a specific section:

### Floor (Suelo)
- Drawn as a polygon in a **Vertical Section (Z=?)**
- User draws vertices on the Z section grid (X,Y plane)
- This is always the starting point for workspace definition

### Walls (Paredes)
- Each wall edge of the floor polygon is **clickable** in the Z section
- Clicking a wall opens an assignment panel
- **Horizontal walls** (run along X) → assigned to **Longitudinal sections (Y=?)**
- **Vertical walls** (run along Y) → assigned to **Transversal sections (X=?)**
- Auto-generates a **rectangle** (wall length × room height in blocks) in the target section
- If no suitable section exists, user can create one inline

### Ceiling (Techo)
- A "T" button on each workspace in the Z section opens ceiling assignment
- Ceiling is assigned to a **different Vertical Section (Z=?)**
- Initially copies the floor polygon coordinates
- Can be independently edited afterward in its target Z section

### Data Storage
- Wall assignments stored as `SectionPolygon` entries with IDs: `{roomId}_wall{index}`
- Ceiling stored as `SectionPolygon` with ID: `{roomId}_ceiling`
- All stored in `customSections[].polygons[]` within `custom_corners` JSONB
