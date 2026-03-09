# Memory: features/budget/workspace-3d-viewer
Updated: now

The 3D workspace viewer (Three.js/@react-three/fiber) renders each workspace as a solid prism with:

### Face labeling & colors
- S1 (Suelo/Brown), P1-Pn (Paredes/Green|Orange|Gray by type), T1 (Techo/Blue)
- Selected faces highlighted in red; hover shows orange

### XYZ corner coordinate labels
Each vertex of the prism displays its real-world coordinate as `(Xn,Yn,Zn)` where:
- X,Y come from the polygon vertices (grid units)
- Z-base comes from the workspace's vertical section axisValue
- Z-top is computed from zBase + height/scaleZ

### Double-click face editing
Double-clicking any face opens a `FaceEditPanel` below the 3D canvas showing:
- Real vertex coordinates of that face
- Wall type selector (for paredes only)
- Height editor (for paredes only)
- Save persists changes to `budget_floor_plan_walls` table

### Props
- `zBase`: Z axis value from workspace's vertical section (default 0)
- `scaleZ`: mm per Z grid unit (default 250)
- `onFaceEdit`: callback for persisting wall type/height changes
