/**
 * Utility to compute per-vertex top Z positions from section polygon data.
 * This ensures non-rectangular shapes (triangles, pentagons, etc.) drawn in
 * transversal/longitudinal sections are correctly reflected in 3D.
 */

interface PolygonVertex { x: number; y: number; }
interface WallData { id: string; room_id: string; wall_index: number; wall_type: string; height: number | null; }

interface SectionPolygon {
  id: string;
  name: string;
  vertices: Array<{ x: number; y: number; z: number; label?: string }>;
}

interface CustomSection {
  id: string;
  name: string;
  sectionType: 'vertical' | 'longitudinal' | 'transversal' | 'inclined';
  axis: 'X' | 'Y' | 'Z';
  axisValue: number;
  polygons: SectionPolygon[];
}

/**
 * Get the max Z value from a section polygon at a given horizontal position.
 */
function getMaxZAtPosition(verts: Array<{ x: number; y: number }>, projPos: number): number | null {
  const zValues: number[] = [];

  for (let i = 0; i < verts.length; i++) {
    const j = (i + 1) % verts.length;
    const a = verts[i], b = verts[j];

    // Check if vertex itself is at the position
    if (Math.abs(a.x - projPos) < 0.5) {
      zValues.push(a.y);
    }

    // Check edge intersection
    if (Math.abs(a.x - b.x) > 0.001) {
      const lo = Math.min(a.x, b.x);
      const hi = Math.max(a.x, b.x);
      if (projPos >= lo - 0.3 && projPos <= hi + 0.3) {
        const t = (projPos - a.x) / (b.x - a.x);
        if (t >= -0.1 && t <= 1.1) {
          zValues.push(a.y + t * (b.y - a.y));
        }
      }
    }
  }

  if (zValues.length === 0) return null;
  return Math.max(...zValues);
}

/**
 * Compute per-vertex top Z (in Three.js Y meters) for each floor polygon vertex,
 * using section polygon data when available. Falls back to wall.height if no
 * section data matches.
 */
export function computeVertexTopPositions(
  polygon: PolygonVertex[],
  walls: WallData[],
  zBase: number,
  defaultHeight: number,
  scaleXY: number,
  scaleZ: number,
  allSections: CustomSection[],
  roomId: string,
): number[] {
  const zScaleM = scaleZ / 1000; // meters per Z grid unit
  const n = polygon.length;
  const topYMeters = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const vx = polygon[i].x; // X grid coordinate
    const vy = polygon[i].y; // Y grid coordinate

    let bestZ: number | null = null;

    // Search transversal sections (cut at X=val, horizontal=Y, vertical=Z)
    for (const section of allSections) {
      if (section.sectionType !== 'transversal' && section.sectionType !== 'longitudinal') continue;
      if (!section.polygons || section.polygons.length === 0) continue;

      const isTransversal = section.sectionType === 'transversal';
      // For transversal: cut axis = X, proj axis = Y
      // For longitudinal: cut axis = Y, proj axis = X
      const vertexCutValue = isTransversal ? vx : vy;

      if (Math.abs(vertexCutValue - section.axisValue) > 1) continue;

      const projPos = isTransversal ? vy : vx;

      // Find workspace polygon in this section (main polygon or wall sub-polygons)
      for (const sp of section.polygons) {
        if (sp.id !== roomId && !sp.id.startsWith(`${roomId}_wall`)) continue;
        if (!sp.vertices || sp.vertices.length < 2) continue;

        const maxZ = getMaxZAtPosition(sp.vertices, projPos);
        if (maxZ !== null && (bestZ === null || maxZ > bestZ)) {
          bestZ = maxZ;
        }
      }
    }

    if (bestZ !== null) {
      // bestZ is in Z grid units; convert to meters for Three.js Y
      topYMeters[i] = bestZ * zScaleM;
    } else {
      // Fallback: use wall.height
      const wall = walls.find(w => w.wall_index === i + 1);
      const h = wall?.height != null ? wall.height : defaultHeight;
      const zTopUnits = zBase + Math.round(h / zScaleM);
      topYMeters[i] = zTopUnits * zScaleM;
    }
  }

  return topYMeters;
}
