import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, Trash2, ChevronDown, ChevronRight, Pencil, MapPin, Pentagon } from 'lucide-react';

export interface SectionPolygon {
  id: string;
  name: string;
  vertices: Array<{ x: number; y: number; z: number; label?: string }>;
}

export interface CustomSection {
  id: string;
  name: string;
  sectionType: 'vertical' | 'longitudinal' | 'transversal';
  axis: 'X' | 'Y' | 'Z';
  axisValue: number;
  polygons: SectionPolygon[];
}

export interface ScaleConfig {
  scaleX: number; // mm per unit X (default 625)
  scaleY: number; // mm per unit Y (default 625)
  scaleZ: number; // mm per unit Z (default 250)
  gridRange?: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
}

interface WorkspacePolygonData {
  id: string;
  name: string;
  vertices: Array<{ x: number; y: number }>;
  widthM: number;
  lengthM: number;
}

/** Cross-section projection of a workspace in longitudinal/transversal views */
export interface SectionWallProjection {
  workspaceId: string;
  workspaceName: string;
  /** Start on horizontal axis (X for longitudinal, Y for transversal) */
  hStart: number;
  /** End on horizontal axis */
  hEnd: number;
  /** Z base (in Z grid units) */
  zBase: number;
  /** Z top = zBase + height (in Z grid units) */
  zTop: number;
}

interface CustomSectionManagerProps {
  sectionType: 'vertical' | 'longitudinal' | 'transversal';
  sections: CustomSection[];
  onSectionsChange: (sections: CustomSection[]) => void;
  scaleConfig?: ScaleConfig;
  /** Workspace polygons grouped by vertical_section_id (for vertical sections) */
  workspacesBySection?: Map<string, WorkspacePolygonData[]>;
  /** Workspace wall projections per section id (for longitudinal/transversal sections) */
  wallProjectionsBySection?: Map<string, SectionWallProjection[]>;
}

const AXIS_MAP: Record<string, { axis: 'X' | 'Y' | 'Z'; label: string; placeholder: string }[]> = {
  vertical: [{ axis: 'Z', label: 'Eje Z', placeholder: 'Ej: 0 (Nivel 1)' }],
  longitudinal: [{ axis: 'Y', label: 'Eje Y', placeholder: 'Ej: 0 (Cara Superior)' }],
  transversal: [{ axis: 'X', label: 'Eje X', placeholder: 'Ej: 0 (Cara Izquierda)' }],
};

const TYPE_LABELS: Record<string, string> = {
  vertical: 'Vertical',
  longitudinal: 'Longitudinal',
  transversal: 'Transversal',
};

function generateId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Compute 2D polygon metrics: area (m²), max width (largo), max height (alto) */
function computePolygonMetrics(
  vertices: Array<{ x: number; y: number; z: number }>,
  sectionType: string,
  scaleConfig?: ScaleConfig
) {
  if (vertices.length < 2) return { areaM2: 0, largoM: 0, altoM: 0 };

  // Map to 2D based on section type
  const get2D = (v: { x: number; y: number; z: number }): [number, number] => {
    if (sectionType === 'vertical') return [v.x, v.y];
    if (sectionType === 'longitudinal') return [v.x, v.z];
    return [v.y, v.z]; // transversal
  };

  // Scale factors (mm per grid unit → m per grid unit)
  const hScale = sectionType === 'transversal'
    ? (scaleConfig?.scaleY ?? 625) / 1000
    : (scaleConfig?.scaleX ?? 625) / 1000;
  const vScale = sectionType === 'vertical'
    ? (scaleConfig?.scaleY ?? 625) / 1000
    : (scaleConfig?.scaleZ ?? 250) / 1000;

  const pts = vertices.map(get2D);

  // Bounding box in meters
  const hs = pts.map(p => p[0]);
  const vs = pts.map(p => p[1]);
  const largoM = (Math.max(...hs) - Math.min(...hs)) * hScale;
  const altoM = (Math.max(...vs) - Math.min(...vs)) * vScale;

  // Shoelace formula for area (in real-world m²)
  let area = 0;
  if (pts.length >= 3) {
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      area += (pts[i][0] * hScale) * (pts[j][1] * vScale);
      area -= (pts[j][0] * hScale) * (pts[i][1] * vScale);
    }
    area = Math.abs(area) / 2;
  }

  return { areaM2: area, largoM, altoM };
}

// Colors for polygons
const POLY_COLORS = [
  'hsl(var(--primary))',
  'hsl(210, 70%, 50%)',
  'hsl(150, 60%, 40%)',
  'hsl(30, 80%, 50%)',
  'hsl(280, 60%, 50%)',
  'hsl(0, 70%, 50%)',
];

// SketchUp axis colors
const AXIS_COLORS = { X: '#c0392b', Y: '#27ae60', Z: '#2980b9' };

/** Renders an SVG grid for a custom section with its polygons */
function SectionGrid({ section, scaleConfig, workspaces, wallProjections }: { section: CustomSection; scaleConfig?: ScaleConfig; workspaces?: WorkspacePolygonData[]; wallProjections?: SectionWallProjection[] }) {
  const { sectionType, polygons } = section;

  const axisMapping = useMemo(() => {
    if (sectionType === 'vertical') return { hAxis: 'X', vAxis: 'Y', hLabel: 'X', vLabel: 'Y', flipV: false } as const;
    if (sectionType === 'longitudinal') return { hAxis: 'X', vAxis: 'Z', hLabel: 'X', vLabel: 'Z', flipV: true } as const;
    return { hAxis: 'Y', vAxis: 'Z', hLabel: 'Y', vLabel: 'Z', flipV: true } as const;
  }, [sectionType]);

  const hColor = AXIS_COLORS[axisMapping.hAxis];
  const vColor = AXIS_COLORS[axisMapping.vAxis];

  const bounds = useMemo(() => {
    const allH: number[] = [];
    const allV: number[] = [];

    polygons.forEach(p => p.vertices.forEach(v => {
      allH.push(v[axisMapping.hAxis.toLowerCase() as 'x' | 'y' | 'z']);
      allV.push(v[axisMapping.vAxis.toLowerCase() as 'x' | 'y' | 'z']);
    }));

    const defaultRange = scaleConfig?.gridRange;

    let minH = allH.length > 0 ? Math.min(...allH) : (defaultRange ? defaultRange[`min${axisMapping.hAxis}` as keyof typeof defaultRange] as number : 0);
    let maxH = allH.length > 0 ? Math.max(...allH) : (defaultRange ? defaultRange[`max${axisMapping.hAxis}` as keyof typeof defaultRange] as number : 10);
    let minV = allV.length > 0 ? Math.min(...allV) : (defaultRange ? defaultRange[`min${axisMapping.vAxis}` as keyof typeof defaultRange] as number : 0);
    let maxV = allV.length > 0 ? Math.max(...allV) : (defaultRange ? defaultRange[`max${axisMapping.vAxis}` as keyof typeof defaultRange] as number : 10);

    const hRange = maxH - minH || 10;
    const vRange = maxV - minV || 10;
    minH = Math.floor(minH - hRange * 0.1);
    maxH = Math.ceil(maxH + hRange * 0.1);
    minV = Math.floor(minV - vRange * 0.1);
    maxV = Math.ceil(maxV + vRange * 0.1);

    if (maxH - minH < 5) { minH -= 2; maxH += 3; }
    if (maxV - minV < 5) { minV -= 2; maxV += 3; }

    return { minH, maxH, minV, maxV };
  }, [polygons, axisMapping, scaleConfig]);

  const cellSize = 36;
  const padding = 48;
  const cols = bounds.maxH - bounds.minH;
  const rows = bounds.maxV - bounds.minV;
  const svgW = cols * cellSize + padding * 2;
  const svgH = rows * cellSize + padding * 2;

  const toSvgX = (val: number) => padding + (val - bounds.minH) * cellSize;
  const toSvgY = (val: number) => axisMapping.flipV
    ? padding + (bounds.maxV - val) * cellSize
    : padding + (val - bounds.minV) * cellSize;

  // Chess cells
  const chessCells: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isDark = (r + c) % 2 === 0;
      chessCells.push(
        <rect
          key={`cell-${r}-${c}`}
          x={padding + c * cellSize}
          y={padding + r * cellSize}
          width={cellSize}
          height={cellSize}
          fill={isDark ? '#e8e8e8' : '#ffffff'}
          stroke="#cccccc"
          strokeWidth={0.5}
        />
      );
    }
  }

  return (
    <div className="overflow-auto border-2 border-border rounded-lg bg-white my-2 shadow-sm">
      <svg width={Math.min(svgW, 960)} height={Math.min(svgH, 640)} viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ minHeight: 200 }}>
        {/* Title bar */}
        <rect x={0} y={0} width={svgW} height={28} fill="#2c3e50" />
        <text x={svgW / 2} y={18} textAnchor="middle" fontSize={13} fontWeight="bold" fill="#ffffff" fontFamily="system-ui, sans-serif">
          {section.name} — {section.axis}={section.axisValue}
        </text>

        {/* Chess pattern background */}
        {chessCells}

        {/* Border around grid area */}
        <rect x={padding} y={padding} width={cols * cellSize} height={rows * cellSize} fill="none" stroke="#555555" strokeWidth={1.5} />

        {/* Grid lines — H axis labels on top AND bottom */}
        {Array.from({ length: cols + 1 }, (_, i) => {
          const x = padding + i * cellSize;
          const val = bounds.minH + i;
          const isOrigin = val === 0;
          return (
            <g key={`h-${i}`}>
              <line x1={x} y1={padding} x2={x} y2={padding + rows * cellSize} stroke={isOrigin ? hColor : '#999999'} strokeWidth={isOrigin ? 2 : 0.5} />
              {/* Top label */}
              <text x={x} y={padding - 8} textAnchor="middle" fontSize={12} fontWeight="bold" fill={hColor} fontFamily="system-ui, sans-serif">
                {axisMapping.hLabel}{val}
              </text>
              {/* Bottom label */}
              <text x={x} y={padding + rows * cellSize + 16} textAnchor="middle" fontSize={12} fontWeight="bold" fill={hColor} fontFamily="system-ui, sans-serif">
                {axisMapping.hLabel}{val}
              </text>
            </g>
          );
        })}
        {/* Grid lines — V axis labels on left AND right */}
        {Array.from({ length: rows + 1 }, (_, i) => {
          const y = padding + i * cellSize;
          const val = axisMapping.flipV ? bounds.maxV - i : bounds.minV + i;
          const isOrigin = val === 0;
          return (
            <g key={`v-${i}`}>
              <line x1={padding} y1={y} x2={padding + cols * cellSize} y2={y} stroke={isOrigin ? vColor : '#999999'} strokeWidth={isOrigin ? 2 : 0.5} />
              {/* Left label */}
              <text x={padding - 8} y={y + 4} textAnchor="end" fontSize={12} fontWeight="bold" fill={vColor} fontFamily="system-ui, sans-serif">
                {axisMapping.vLabel}{val}
              </text>
              {/* Right label */}
              <text x={padding + cols * cellSize + 8} y={y + 4} textAnchor="start" fontSize={12} fontWeight="bold" fill={vColor} fontFamily="system-ui, sans-serif">
                {axisMapping.vLabel}{val}
              </text>
            </g>
          );
        })}

        {/* Origin marker */}
        {bounds.minH <= 0 && bounds.maxH >= 0 && bounds.minV <= 0 && bounds.maxV >= 0 && (
          <>
            <circle cx={toSvgX(0)} cy={toSvgY(0)} r={5} fill="#e74c3c" stroke="#ffffff" strokeWidth={1.5} />
            <text x={toSvgX(0) + 8} y={toSvgY(0) - 8} fontSize={10} fontWeight="bold" fill="#e74c3c" fontFamily="system-ui, sans-serif">
              O
            </text>
          </>
        )}

        {/* Polygons */}
        {polygons.map((poly, pi) => {
          if (poly.vertices.length < 2) return null;
          const color = POLY_COLORS[pi % POLY_COLORS.length];
          const hKey = axisMapping.hAxis.toLowerCase() as 'x' | 'y' | 'z';
          const vKey = axisMapping.vAxis.toLowerCase() as 'x' | 'y' | 'z';
          const points = poly.vertices.map(v => `${toSvgX(v[hKey])},${toSvgY(v[vKey])}`).join(' ');

          return (
            <g key={poly.id}>
              {poly.vertices.length >= 3 && (
                <polygon points={points} fill={color} fillOpacity={0.2} stroke={color} strokeWidth={2} />
              )}
              {poly.vertices.length === 2 && (
                <polyline points={points} fill="none" stroke={color} strokeWidth={2.5} />
              )}
              {poly.vertices.map((v, vi) => (
                <g key={vi}>
                  <circle cx={toSvgX(v[hKey])} cy={toSvgY(v[vKey])} r={4} fill={color} stroke="#fff" strokeWidth={1} />
                  <text
                    x={toSvgX(v[hKey]) + 6}
                    y={toSvgY(v[vKey]) - 6}
                    fontSize={10}
                    fill="#333333"
                    fontWeight="bold"
                    fontFamily="system-ui, sans-serif"
                  >
                    ({v.x},{v.y},{v.z})
                  </text>
                </g>
              ))}
              {poly.vertices.length >= 2 && (() => {
                const cx = poly.vertices.reduce((s, v) => s + v[hKey], 0) / poly.vertices.length;
                const cy = poly.vertices.reduce((s, v) => s + v[vKey], 0) / poly.vertices.length;
                return (
                  <text x={toSvgX(cx)} y={toSvgY(cy)} textAnchor="middle" fontSize={12} fontWeight="bold" fill={color} fontFamily="system-ui, sans-serif">
                    {poly.name}
                  </text>
                );
              })()}
            </g>
          );
        })}
        {/* Workspace polygons overlay */}
        {workspaces && workspaces.length > 0 && sectionType === 'vertical' && workspaces.map((ws) => {
          if (ws.vertices.length < 3) return null;
          const wsPoints = ws.vertices.map(v => `${toSvgX(v.x)},${toSvgY(v.y)}`).join(' ');
          const cx = ws.vertices.reduce((s, v) => s + v.x, 0) / ws.vertices.length;
          const cy = ws.vertices.reduce((s, v) => s + v.y, 0) / ws.vertices.length;
          // Compute area in m²
          const hScale = (scaleConfig?.scaleX ?? 625) / 1000;
          const vScale = (scaleConfig?.scaleY ?? 625) / 1000;
          let area = 0;
          for (let i = 0; i < ws.vertices.length; i++) {
            const j = (i + 1) % ws.vertices.length;
            area += (ws.vertices[i].x * hScale) * (ws.vertices[j].y * vScale);
            area -= (ws.vertices[j].x * hScale) * (ws.vertices[i].y * vScale);
          }
          area = Math.abs(area) / 2;
          return (
            <g key={`ws-${ws.id}`}>
              <polygon
                points={wsPoints}
                fill="hsl(200, 80%, 50%)"
                fillOpacity={0.15}
                stroke="hsl(200, 80%, 50%)"
                strokeWidth={2}
                strokeDasharray="6 3"
              />
              <text x={toSvgX(cx)} y={toSvgY(cy) - 4} textAnchor="middle" fontSize={11} fontWeight="bold" fill="hsl(200, 80%, 50%)" fontFamily="system-ui, sans-serif">
                {ws.name}
              </text>
              <text x={toSvgX(cx)} y={toSvgY(cy) + 10} textAnchor="middle" fontSize={9} fill="hsl(200, 80%, 50%)" fontFamily="system-ui, sans-serif" opacity={0.8}>
                {area.toFixed(2)} m²
              </text>
            </g>
          );
        })}
        {/* Workspace wall projections for longitudinal/transversal sections */}
        {wallProjections && wallProjections.length > 0 && (sectionType === 'longitudinal' || sectionType === 'transversal') && (() => {
          const grouped = new Map<string, SectionWallProjection[]>();
          wallProjections.forEach(wp => {
            if (!grouped.has(wp.workspaceId)) grouped.set(wp.workspaceId, []);
            grouped.get(wp.workspaceId)!.push(wp);
          });

          return Array.from(grouped.entries()).map(([wsId, projections]) => {
            const wsName = projections[0].workspaceName;
            const allH = projections.flatMap(p => [p.hStart, p.hEnd]);
            const allV = projections.flatMap(p => [p.zBase, p.zTop]);
            const hMin = Math.min(...allH);
            const hMax = Math.max(...allH);
            const vMin = Math.min(...allV);
            const vMax = Math.max(...allV);

            return (
              <g key={`wp-${wsId}`}>
                {/* Filled interior */}
                <rect
                  x={toSvgX(hMin)}
                  y={toSvgY(vMax)}
                  width={toSvgX(hMax) - toSvgX(hMin)}
                  height={toSvgY(vMin) - toSvgY(vMax)}
                  fill="hsl(200, 80%, 50%)"
                  fillOpacity={0.1}
                  stroke="none"
                />
                {/* Wall lines */}
                {projections.map((p, pi) => (
                  <g key={`wall-${pi}`}>
                    <line x1={toSvgX(p.hStart)} y1={toSvgY(p.zBase)} x2={toSvgX(p.hStart)} y2={toSvgY(p.zTop)} stroke="hsl(200, 80%, 50%)" strokeWidth={2.5} />
                    {p.hEnd !== p.hStart && (
                      <line x1={toSvgX(p.hEnd)} y1={toSvgY(p.zBase)} x2={toSvgX(p.hEnd)} y2={toSvgY(p.zTop)} stroke="hsl(200, 80%, 50%)" strokeWidth={2.5} />
                    )}
                    <line x1={toSvgX(p.hStart)} y1={toSvgY(p.zTop)} x2={toSvgX(p.hEnd)} y2={toSvgY(p.zTop)} stroke="hsl(200, 80%, 50%)" strokeWidth={1.5} strokeDasharray="4 2" />
                    <line x1={toSvgX(p.hStart)} y1={toSvgY(p.zBase)} x2={toSvgX(p.hEnd)} y2={toSvgY(p.zBase)} stroke="hsl(200, 80%, 50%)" strokeWidth={1.5} strokeDasharray="4 2" />
                  </g>
                ))}
                {/* Label */}
                <text x={toSvgX((hMin + hMax) / 2)} y={toSvgY((vMin + vMax) / 2) - 4} textAnchor="middle" fontSize={11} fontWeight="bold" fill="hsl(200, 80%, 50%)" fontFamily="system-ui, sans-serif">
                  {wsName}
                </text>
              </g>
            );
          });
        })()}
      </svg>
    </div>
  );
}

export function CustomSectionManager({ sectionType, sections, onSectionsChange, scaleConfig, workspacesBySection, wallProjectionsBySection }: CustomSectionManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAxisValue, setNewAxisValue] = useState('0');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [editingPolygonOf, setEditingPolygonOf] = useState<string | null>(null);
  const [polygonName, setPolygonName] = useState('');
  const [polygonVertices, setPolygonVertices] = useState('');
  const [editingPolygonId, setEditingPolygonId] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAxisValue, setEditAxisValue] = useState('0');

  const axisConfig = AXIS_MAP[sectionType][0];
  const filtered = sections.filter(s => s.sectionType === sectionType);

  const handleAdd = () => {
    if (!newName.trim()) return;
    const val = parseFloat(newAxisValue) || 0;
    const section: CustomSection = {
      id: generateId(),
      name: newName.trim(),
      sectionType,
      axis: axisConfig.axis,
      axisValue: val,
      polygons: [],
    };
    const newSections = [...sections, section];
    onSectionsChange(newSections);
    // Auto-expand the new section
    setExpandedSections(prev => new Set([...prev, section.id]));
    setNewName('');
    setNewAxisValue('0');
    setShowAddForm(false);
  };

  const handleDelete = (id: string) => {
    onSectionsChange(sections.filter(s => s.id !== id));
  };

  const handleRename = (id: string) => {
    if (!editName.trim()) return;
    const val = parseFloat(editAxisValue) || 0;
    onSectionsChange(sections.map(s => s.id === id ? { ...s, name: editName.trim(), axisValue: val } : s));
    setEditingSectionId(null);
  };

  const toggleExpand = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  /** Get the two free axes for a section type */
  const getFreeAxes = (section: CustomSection): { first: 'x' | 'y' | 'z'; second: 'x' | 'y' | 'z'; fixedAxis: 'x' | 'y' | 'z' } => {
    const fixedAxis = section.axis.toLowerCase() as 'x' | 'y' | 'z';
    if (fixedAxis === 'z') return { first: 'x', second: 'y', fixedAxis };
    if (fixedAxis === 'y') return { first: 'x', second: 'z', fixedAxis };
    return { first: 'y', second: 'z', fixedAxis };
  };

  const parseVertices2D = (text: string, section: CustomSection): Array<{ x: number; y: number; z: number }> => {
    const { first, second, fixedAxis } = getFreeAxes(section);
    return text.split(';').map(v => {
      const parts = v.trim().split(',').map(Number);
      if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
      const vertex = { x: 0, y: 0, z: 0 };
      vertex[first] = parts[0];
      vertex[second] = parts[1];
      vertex[fixedAxis] = section.axisValue;
      return vertex;
    }).filter((v): v is { x: number; y: number; z: number } => v !== null);
  };

  const addPolygon = (sectionId: string) => {
    if (!polygonName.trim() || !polygonVertices.trim()) return;
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;
    const vertices = parseVertices2D(polygonVertices, section);
    if (vertices.length < 2) return;

    if (editingPolygonId) {
      // Update existing polygon
      onSectionsChange(sections.map(s =>
        s.id === sectionId
          ? { ...s, polygons: s.polygons.map(p => p.id === editingPolygonId ? { ...p, name: polygonName.trim(), vertices } : p) }
          : s
      ));
    } else {
      // Add new polygon
      const polygon: SectionPolygon = {
        id: generateId(),
        name: polygonName.trim(),
        vertices,
      };
      onSectionsChange(sections.map(s =>
        s.id === sectionId ? { ...s, polygons: [...s.polygons, polygon] } : s
      ));
    }
    setPolygonName('');
    setPolygonVertices('');
    setEditingPolygonOf(null);
    setEditingPolygonId(null);
  };

  const startEditPolygon = (sectionId: string, poly: SectionPolygon) => {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;
    const { first, second } = getFreeAxes(section);
    setEditingPolygonOf(sectionId);
    setEditingPolygonId(poly.id);
    setPolygonName(poly.name);
    setPolygonVertices(poly.vertices.map(v => `${v[first]},${v[second]}`).join('; '));
  };

  const deletePolygon = (sectionId: string, polygonId: string) => {
    onSectionsChange(sections.map(s =>
      s.id === sectionId
        ? { ...s, polygons: s.polygons.filter(p => p.id !== polygonId) }
        : s
    ));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" />
          Secciones {TYPE_LABELS[sectionType]}
          <Badge variant="outline" className="text-[9px] h-4">{filtered.length}</Badge>
        </h4>
        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setShowAddForm(!showAddForm)}>
          <Plus className="h-3 w-3 mr-1" /> Nueva Sección
        </Button>
      </div>

      {showAddForm && (
        <Card className="border-dashed border-primary/30">
          <CardContent className="pt-3 pb-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Nombre de la Sección</Label>
                <Input
                  className="h-7 text-xs"
                  placeholder="Ej: Cara Superior"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
              </div>
              <div>
                <Label className="text-[10px]">{axisConfig.label} (valor)</Label>
                <Input
                  className="h-7 text-xs"
                  type="number"
                  placeholder={axisConfig.placeholder}
                  value={newAxisValue}
                  onChange={e => setNewAxisValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
              </div>
            </div>
            <div className="flex gap-1 justify-end">
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setShowAddForm(false)}>Cancelar</Button>
              <Button size="sm" className="h-6 text-[10px]" onClick={handleAdd} disabled={!newName.trim()}>Crear</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {filtered.length === 0 && !showAddForm && (
        <p className="text-[10px] text-muted-foreground italic py-2">No hay secciones definidas. Pulse "Nueva Sección" para crear una.</p>
      )}

      {filtered.map(section => {
        const isExpanded = expandedSections.has(section.id);
        const isEditing = editingSectionId === section.id;
        return (
          <div key={section.id} className="border-2 border-border rounded-xl overflow-hidden shadow-sm">
            {/* Section header */}
            <div
              className="flex items-center justify-between px-3 py-2 cursor-pointer bg-muted/60 hover:bg-muted/80"
              onClick={() => !isEditing && toggleExpand(section.id)}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                {isEditing ? (
                  <div className="flex items-center gap-2 flex-1" onClick={e => e.stopPropagation()}>
                    <Input
                      className="h-7 text-xs w-36"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRename(section.id); if (e.key === 'Escape') setEditingSectionId(null); }}
                      autoFocus
                      placeholder="Nombre"
                    />
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">{axisConfig.label}=</span>
                      <Input
                        className="h-7 text-xs w-16"
                        type="number"
                        value={editAxisValue}
                        onChange={e => setEditAxisValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRename(section.id); if (e.key === 'Escape') setEditingSectionId(null); }}
                      />
                    </div>
                    <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => handleRename(section.id)}>Guardar</Button>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setEditingSectionId(null)}>Cancelar</Button>
                  </div>
                ) : (
                  <>
                    <span className="text-xs font-semibold truncate">{section.name}</span>
                    <Badge variant="secondary" className="text-[9px] h-4 shrink-0">
                      {section.axis}={section.axisValue}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] h-4 shrink-0">
                      <Pentagon className="h-2.5 w-2.5 mr-0.5" />{section.polygons.length}
                    </Badge>
                  </>
                )}
              </div>
              {!isEditing && (
                <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setEditingSectionId(section.id); setEditName(section.name); setEditAxisValue(String(section.axisValue)); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(section.id)}>
                    <Trash2 className="h-4.5 w-4.5" />
                  </Button>
                </div>
              )}
            </div>

            {/* Section content — always show grid when expanded */}
            {isExpanded && (
              <div className="px-3 py-2 space-y-2 bg-background">
                {/* SVG Grid for THIS section only */}
                <SectionGrid section={section} scaleConfig={scaleConfig} workspaces={workspacesBySection?.get(section.id)} wallProjections={wallProjectionsBySection?.get(section.id)} />

                {/* Polygons list */}
                {section.polygons.length === 0 && (
                  <p className="text-[10px] text-muted-foreground italic">Sin polígonos definidos. La cuadrícula se muestra vacía.</p>
                )}
                {section.polygons.map(poly => {
                  const metrics = computePolygonMetrics(poly.vertices, section.sectionType, scaleConfig);
                  return (
                    <div key={poly.id} className="bg-muted/30 rounded px-2 py-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Pentagon className="h-3 w-3 text-primary" />
                          <span className="text-[11px] font-medium">{poly.name}</span>
                          <span className="text-[9px] text-muted-foreground">
                            {poly.vertices.length} vértices
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => startEditPolygon(section.id, poly)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10" onClick={() => deletePolygon(section.id, poly.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-1 ml-5 text-[10px] text-muted-foreground">
                        <span title="Superficie">📐 {metrics.areaM2.toFixed(2)} m²</span>
                        <span title="Largo máximo (horizontal)">↔ {metrics.largoM.toFixed(2)} m</span>
                        <span title="Alto máximo (vertical)">↕ {metrics.altoM.toFixed(2)} m</span>
                      </div>
                    </div>
                  );
                })}

                {/* Add/Edit polygon form */}
                {editingPolygonOf === section.id ? (
                  <div className="border border-dashed border-primary/30 rounded p-2 space-y-1.5">
                    <div>
                      <Label className="text-[10px]">Nombre del polígono</Label>
                      <Input className="h-6 text-xs" placeholder="Ej: Muro principal" value={polygonName} onChange={e => setPolygonName(e.target.value)} />
                    </div>
                    {(() => {
                      const { first, second, fixedAxis } = getFreeAxes(section);
                      const fixedLabel = fixedAxis.toUpperCase();
                      const firstLabel = first.toUpperCase();
                      const secondLabel = second.toUpperCase();
                      return (
                        <div>
                          <Label className="text-[10px]">
                            Vértices ({firstLabel},{secondLabel} separados por ;)
                            <span className="ml-1 text-muted-foreground">— {fixedLabel}={section.axisValue} (fijo)</span>
                          </Label>
                          <Input className="h-6 text-xs" placeholder={`Ej: 0,0; 5,0; 5,10; 0,10`} value={polygonVertices} onChange={e => setPolygonVertices(e.target.value)} />
                        </div>
                      );
                    })()}
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={() => { setEditingPolygonOf(null); setEditingPolygonId(null); }}>Cancelar</Button>
                      <Button size="sm" className="h-5 text-[10px]" onClick={() => addPolygon(section.id)} disabled={!polygonName.trim() || !polygonVertices.trim()}>
                        {editingPolygonId ? 'Guardar' : 'Añadir'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="h-6 text-[10px] w-full" onClick={() => setEditingPolygonOf(section.id)}>
                    <Plus className="h-3 w-3 mr-1" /> Añadir Polígono
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
