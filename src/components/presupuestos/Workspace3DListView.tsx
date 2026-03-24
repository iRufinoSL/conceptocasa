import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Canvas, ThreeEvent, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import { InfiniteAxes3D } from './InfiniteAxes3D';
import { computeVertexTopPositions } from './workspace3dUtils';
import { getWallCode } from '@/utils/wallCodeUtils';
import type { CustomSection } from './CustomSectionManager';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Minimize2, Maximize2, Home, Layers, SortAsc, X, Eye, EyeOff, RotateCcw, ZoomIn, Building2 } from 'lucide-react';

interface PolygonVertex { x: number; y: number; }
interface WallData { id: string; room_id: string; wall_index: number; wall_type: string; height: number | null; }

interface WorkspaceEntry {
  id: string;
  name: string;
  polygon: PolygonVertex[];
  height: number;
  walls: WallData[];
  zBase: number;
  sectionName?: string;
  hasFloor?: boolean;
  hasCeiling?: boolean;
}

interface FaceInfo {
  workspaceId: string;
  workspaceName: string;
  faceType: string;
  faceIndex: number;
  label: string;
}

interface Workspace3DListViewProps {
  workspaces: WorkspaceEntry[];
  scaleXY: number;
  scaleZ: number;
  onClose: () => void;
  onFaceDoubleClick?: (info: FaceInfo) => void;
  allSections?: CustomSection[];
}

const FACE_COLORS: Record<string, string> = {
  suelo: '#d4a574',
  techo: '#7ab8e0',
  tejado: '#c45c5c',
  pared_exterior: '#8bc48b',
  pared_interior: '#e0c87a',
  pared_invisible: '#cccccc',
  pared_default: '#b0b0b0',
  selected: '#ff6b6b',
};

function getWallColor(wallType?: string): string {
  if (!wallType) return FACE_COLORS.pared_default;
  if (wallType === 'suelo') return '#a0522d';
  if (wallType === 'tejado') return FACE_COLORS.tejado;
  if (wallType.includes('exterior')) return FACE_COLORS.pared_exterior;
  if (wallType.includes('interior')) return FACE_COLORS.pared_interior;
  if (wallType.includes('invisible')) return FACE_COLORS.pared_invisible;
  return FACE_COLORS.pared_default;
}

function calcFaceAreaM2(vertices: THREE.Vector3[]): number {
  if (vertices.length < 3) return 0;
  let area = 0;
  const v0 = vertices[0];
  for (let i = 1; i < vertices.length - 1; i++) {
    const a = new THREE.Vector3().subVectors(vertices[i], v0);
    const b = new THREE.Vector3().subVectors(vertices[i + 1], v0);
    area += a.cross(b).length() / 2;
  }
  return area;
}

function EdgeLabel({ from, to, lengthMm, axisStart, axisEnd }: {
  from: THREE.Vector3; to: THREE.Vector3; lengthMm: number;
  axisStart: string; axisEnd: string;
}) {
  const mid = useMemo(() => new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5), [from, to]);
  const displayLen = lengthMm >= 1000 ? `${(lengthMm / 1000).toFixed(2)}m` : `${Math.round(lengthMm)}mm`;
  const label = `${displayLen}\n${axisStart}→${axisEnd}`;
  return (
    <Text position={[mid.x, mid.y + 0.04, mid.z]} fontSize={0.045} color="#0066cc" fontWeight={600}
      anchorX="center" anchorY="bottom" outlineWidth={0.005} outlineColor="#ffffff" textAlign="center" lineHeight={1.3}>
      {label}
    </Text>
  );
}

function CornerLabel({ position, text }: { position: THREE.Vector3; text: string }) {
  return (
    <Text position={position} fontSize={0.06} color="#1a1a1a" fontWeight={600}
      anchorX="center" anchorY="bottom" outlineWidth={0.006} outlineColor="#ffffff" fillOpacity={0.95}>
      {text}
    </Text>
  );
}

/** Interactive face mesh with proximity transparency */
function InteractiveFace({ vertices, color, label, labelPos, labelRot, onDoubleClick, globalOpacity = 1 }: {
  vertices: THREE.Vector3[]; color: string; label: string; labelPos: THREE.Vector3;
  labelRot?: [number, number, number]; onDoubleClick: () => void; globalOpacity?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const { camera } = useThree();

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    if (vertices.length < 3) return geo;
    const positions: number[] = [];
    for (let j = 1; j < vertices.length - 1; j++) {
      positions.push(vertices[0].x, vertices[0].y, vertices[0].z);
      positions.push(vertices[j].x, vertices[j].y, vertices[j].z);
      positions.push(vertices[j + 1].x, vertices[j + 1].y, vertices[j + 1].z);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
  }, [vertices]);

  useFrame(() => {
    if (!meshRef.current || !matRef.current) return;
    const center = new THREE.Vector3();
    vertices.forEach(v => center.add(v));
    center.divideScalar(vertices.length);
    const dist = camera.position.distanceTo(center);
    const proximityFade = THREE.MathUtils.clamp((dist - 1.0) / 3.0, 0, 1);
    const baseOpacity = hovered ? 0.8 : 0.6;
    matRef.current.opacity = baseOpacity * proximityFade * globalOpacity;
    meshRef.current.visible = proximityFade > 0.05 && globalOpacity > 0.05;
  });

  return (
    <group>
      <mesh
        ref={meshRef}
        geometry={geometry}
        onDoubleClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onDoubleClick(); }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <meshStandardMaterial
          ref={matRef}
          color={hovered ? '#ffaa44' : color}
          transparent
          opacity={hovered ? 0.8 : 0.6}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {vertices.length > 1 && (
        <Line points={[...vertices, vertices[0]]} color={hovered ? '#ff6600' : '#333333'} lineWidth={hovered ? 2 : 1} />
      )}
      <Text position={labelPos} rotation={labelRot} fontSize={0.07} color="#000000" fontWeight={700}
        anchorX="center" anchorY="middle" outlineWidth={0.006} outlineColor="#ffffff" textAlign="center" lineHeight={1.4}>
        {label}
      </Text>
    </group>
  );
}

/** Ground plane for context */
function GroundPlane({ size }: { size: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[size / 2, -0.005, size / 2]} receiveShadow>
      <planeGeometry args={[size * 2, size * 2]} />
      <meshStandardMaterial color="#e8e4dc" roughness={0.95} transparent opacity={0.4} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Auto-frame camera with the same spatial reading as Z0:
 * origin at lower-left, X grows to the right, Y grows towards the background/top.
 */
function AutoFrameCamera({ bounds, resetTrigger, controlsRef }: {
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  resetTrigger: number;
  controlsRef: React.RefObject<any>;
}) {
  const { camera } = useThree();
  const hasFramed = useRef(false);

  useEffect(() => {
    hasFramed.current = false;
  }, [resetTrigger]);

  useEffect(() => {
    if (hasFramed.current) return;
    hasFramed.current = true;

    const dx = bounds.maxX - bounds.minX;
    const dy = bounds.maxY - bounds.minY;
    const dz = bounds.maxZ - bounds.minZ;
    const maxPlanDim = Math.max(dx, dz, 1);
    const maxDim = Math.max(dx, dy, dz, 1);
    const dist = Math.max(maxPlanDim * 1.9, maxDim * 1.45);

    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    const center = new THREE.Vector3(cx, cy, cz);

    // Put the camera in the negative X / negative Y-plan quadrant (world Z here),
    // and above the model. This makes the front-left-lower corner correspond to
    // the plan origin, so Z0 reads naturally: X→right and plan Y→up/back.
    const cameraOffset = new THREE.Vector3(-1.15, 0.95, -1.15)
      .normalize()
      .multiplyScalar(dist);

    camera.up.set(0, 1, 0);
    camera.position.copy(center.clone().add(cameraOffset));
    camera.lookAt(center);
    camera.updateProjectionMatrix();

    if (controlsRef.current) {
      controlsRef.current.target.set(cx, cy, cz);
      controlsRef.current.update();
    }
  }, [bounds, camera, resetTrigger, controlsRef]);

  return null;
}

/** Single workspace prism for multi-workspace scene */
function MultiPrism({ ws, scaleXY, scaleZ, offsetX, offsetZ, onFaceDoubleClick, allSections, opacity, showLabels }: {
  ws: WorkspaceEntry; scaleXY: number; scaleZ: number; offsetX: number; offsetZ: number;
  onFaceDoubleClick?: (info: FaceInfo) => void;
  allSections?: CustomSection[];
  opacity?: number;
  showLabels?: boolean;
}) {
  const sMxy = scaleXY / 1000;
  const zScaleM = scaleZ / 1000;
  const globalOpacity = opacity ?? 1;

  const { baseVerts, topVerts, faces, cornerLabels, edgeLabels } = useMemo(() => {
    const base = ws.polygon.map(v => new THREE.Vector3(v.x * sMxy + offsetX, ws.zBase * zScaleM, v.y * sMxy + offsetZ));

    const topYMeters = (allSections && allSections.length > 0)
      ? computeVertexTopPositions(ws.polygon, ws.walls, ws.zBase, ws.height, scaleXY, scaleZ, allSections, ws.id)
      : null;

    const top = base.map((v, i) => {
      if (topYMeters) {
        return new THREE.Vector3(v.x, topYMeters[i], v.z);
      }
      const wall = ws.walls.find(w => w.wall_index === i + 1);
      const h = wall?.height != null ? wall.height : ws.height;
      const zTopUnits = ws.zBase + Math.round(h / zScaleM);
      return new THREE.Vector3(v.x, zTopUnits * zScaleM, v.z);
    });

    const n = ws.polygon.length;

    const labels: { pos: THREE.Vector3; text: string }[] = [];
    for (let i = 0; i < n; i++) {
      const vx = ws.polygon[i].x;
      const vy = ws.polygon[i].y;
      labels.push({ pos: new THREE.Vector3(base[i].x, base[i].y - 0.04, base[i].z), text: `(X${vx},Y${vy},Z${ws.zBase})` });
      const zTopVal = Math.round(top[i].y / zScaleM);
      labels.push({ pos: new THREE.Vector3(top[i].x, top[i].y + 0.06, top[i].z), text: `(X${vx},Y${vy},Z${zTopVal})` });
    }

    const edges: { from: THREE.Vector3; to: THREE.Vector3; lengthMm: number; axisStart: string; axisEnd: string }[] = [];
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      const dx = (ws.polygon[next].x - ws.polygon[i].x) * scaleXY;
      const dy = (ws.polygon[next].y - ws.polygon[i].y) * scaleXY;
      const len = Math.sqrt(dx * dx + dy * dy);
      edges.push({ from: base[i], to: base[next], lengthMm: len,
        axisStart: `X${ws.polygon[i].x},Y${ws.polygon[i].y}`, axisEnd: `X${ws.polygon[next].x},Y${ws.polygon[next].y}` });
      edges.push({ from: top[i], to: top[next], lengthMm: len,
        axisStart: `X${ws.polygon[i].x},Y${ws.polygon[i].y}`, axisEnd: `X${ws.polygon[next].x},Y${ws.polygon[next].y}` });
    }
    for (let i = 0; i < n; i++) {
      const hDiff = top[i].y - base[i].y;
      const zTopVal = Math.round(top[i].y / zScaleM);
      edges.push({ from: base[i], to: top[i], lengthMm: Math.abs(hDiff) * 1000,
        axisStart: `Z${ws.zBase}`, axisEnd: `Z${zTopVal}` });
    }

    const facesList: { vertices: THREE.Vector3[]; color: string; label: string; labelPos: THREE.Vector3; labelRot?: [number, number, number]; faceType: string; faceIndex: number }[] = [];

    // Floor
    if (ws.hasFloor !== false) {
      const floorCenter = new THREE.Vector3(
        base.reduce((s, v) => s + v.x, 0) / n, base[0].y - 0.01,
        base.reduce((s, v) => s + v.z, 0) / n
      );
      const floorArea = calcFaceAreaM2(base);
      facesList.push({ vertices: [...base], color: FACE_COLORS.suelo, label: `S1\n${ws.name}\n${floorArea.toFixed(2)} m²`, labelPos: floorCenter, labelRot: [-Math.PI / 2, 0, 0], faceType: 'suelo', faceIndex: 1 });
    }

    // Walls
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      const wallVerts = [base[i], base[next], top[next], top[i]];
      const wc = new THREE.Vector3(
        (base[i].x + base[next].x + top[i].x + top[next].x) / 4,
        (base[i].y + base[next].y + top[i].y + top[next].y) / 4,
        (base[i].z + base[next].z + top[i].z + top[next].z) / 4
      );
      const wall = ws.walls.find(w => w.wall_index === i + 1);
      const areaM2 = calcFaceAreaM2(wallVerts);
      const wallCode = getWallCode(wall?.wall_type, i + 1);
      facesList.push({ vertices: wallVerts, color: getWallColor(wall?.wall_type), label: `${wallCode}\n${ws.name}\n${areaM2.toFixed(2)} m²`, labelPos: wc, faceType: wall?.wall_type === 'tejado' ? 'tejado' : 'pared', faceIndex: i + 1 });
    }

    // Ceiling
    if (ws.hasCeiling !== false) {
      const topCenter = new THREE.Vector3(
        top.reduce((s, v) => s + v.x, 0) / n,
        top.reduce((s, v) => s + v.y, 0) / n + 0.01,
        top.reduce((s, v) => s + v.z, 0) / n
      );
      const ceilArea = calcFaceAreaM2(top);
      facesList.push({ vertices: [...top], color: FACE_COLORS.techo, label: `T1\n${ws.name}\n${ceilArea.toFixed(2)} m²`, labelPos: topCenter, labelRot: [-Math.PI / 2, 0, 0], faceType: 'techo', faceIndex: 1 });
    }

    return { baseVerts: base, topVerts: top, faces: facesList, cornerLabels: labels, edgeLabels: edges };
  }, [ws, sMxy, zScaleM, offsetX, offsetZ, scaleXY, allSections]);

  const handleFaceDblClick = useCallback((faceType: string, faceIndex: number, faceLabel: string) => {
    onFaceDoubleClick?.({
      workspaceId: ws.id,
      workspaceName: ws.name,
      faceType,
      faceIndex,
      label: faceLabel,
    });
  }, [ws.id, ws.name, onFaceDoubleClick]);

  return (
    <group>
      {faces.map((f, i) => (
        <InteractiveFace
          key={i}
          vertices={f.vertices}
          color={f.color}
          label={f.label}
          labelPos={f.labelPos}
          labelRot={f.labelRot}
          onDoubleClick={() => handleFaceDblClick(f.faceType, f.faceIndex, f.label.split('\n')[0])}
          globalOpacity={globalOpacity}
        />
      ))}
      {baseVerts.map((bv, i) => (
        <Line key={`ve-${i}`} points={[bv, topVerts[i]]} color="#555555" lineWidth={1} />
      ))}
      {showLabels !== false && edgeLabels.map((el, i) => (
        <EdgeLabel key={`el-${i}`} from={el.from} to={el.to} lengthMm={el.lengthMm} axisStart={el.axisStart} axisEnd={el.axisEnd} />
      ))}
      {showLabels !== false && cornerLabels.map((cl, i) => (
        <CornerLabel key={`cl-${i}`} position={cl.pos} text={cl.text} />
      ))}
    </group>
  );
}

type ViewMode = 'complete' | 'by-section' | 'by-workspace';

export function Workspace3DListView({ workspaces, scaleXY, scaleZ, onClose, onFaceDoubleClick, allSections }: Workspace3DListViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('complete');
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [selectedWs, setSelectedWs] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [wallOpacity, setWallOpacity] = useState(80);
  const [showLabels, setShowLabels] = useState(true);
  const [hiddenSections, setHiddenSections] = useState<Set<string>>(new Set());
  const [cameraResetTrigger, setCameraResetTrigger] = useState(0);
  const orbitControlsRef = useRef<any>(null);

  const sections = useMemo(() => {
    const map = new Map<number, { zBase: number; sectionName: string; items: WorkspaceEntry[] }>();
    workspaces.forEach(ws => {
      const key = ws.zBase;
      if (!map.has(key)) map.set(key, { zBase: key, sectionName: ws.sectionName || `Z=${key}`, items: [] });
      map.get(key)!.items.push(ws);
    });
    return Array.from(map.values()).sort((a, b) => a.zBase - b.zBase);
  }, [workspaces]);

  const sortedWs = useMemo(() => [...workspaces].sort((a, b) => a.name.localeCompare(b.name)), [workspaces]);

  const currentItems = useMemo(() => {
    let items: WorkspaceEntry[];
    if (viewMode === 'complete') {
      items = workspaces.filter(ws => {
        const secName = ws.sectionName || `Z=${ws.zBase}`;
        return !hiddenSections.has(secName);
      });
    } else if (viewMode === 'by-section') {
      if (selectedSection !== null) {
        const sec = sections.find(s => s.sectionName === selectedSection);
        items = sec?.items || [];
      } else {
        items = [];
      }
    } else if (viewMode === 'by-workspace') {
      items = selectedWs ? workspaces.filter(w => w.id === selectedWs) : [];
    } else {
      items = [];
    }
    return items;
  }, [viewMode, workspaces, sections, selectedSection, selectedWs, hiddenSections]);

  // Compute scene bounds for camera framing
  const sceneBounds = useMemo(() => {
    if (currentItems.length === 0) return { minX: 0, maxX: 5, minY: 0, maxY: 3, minZ: 0, maxZ: 5 };
    const sMxy = scaleXY / 1000;
    const zScaleM = scaleZ / 1000;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    currentItems.forEach(ws => {
      ws.polygon.forEach(v => {
        const wx = v.x * sMxy;
        const wz = v.y * sMxy;
        minX = Math.min(minX, wx);
        maxX = Math.max(maxX, wx);
        minZ = Math.min(minZ, wz);
        maxZ = Math.max(maxZ, wz);
      });
      const baseY = ws.zBase * zScaleM;
      minY = Math.min(minY, baseY);
      const maxWallH = ws.walls.reduce((m, w) => Math.max(m, w.height ?? ws.height), ws.height);
      const topY = (ws.zBase + Math.round(maxWallH / zScaleM)) * zScaleM;
      maxY = Math.max(maxY, topY);
    });
    return { minX, maxX, minY, maxY, minZ, maxZ };
  }, [currentItems, scaleXY, scaleZ]);

  // Building stats
  const buildingStats = useMemo(() => {
    const totalSpaces = workspaces.length;
    const totalLevels = sections.length;
    const sMxy = scaleXY / 1000;
    let totalFloorArea = 0;
    workspaces.forEach(ws => {
      if (ws.polygon.length < 3) return;
      const verts = ws.polygon.map(v => new THREE.Vector3(v.x * sMxy, 0, v.y * sMxy));
      totalFloorArea += calcFaceAreaM2(verts);
    });
    return { totalSpaces, totalLevels, totalFloorArea };
  }, [workspaces, sections, scaleXY]);

  const toggleSectionVisibility = useCallback((secName: string) => {
    setHiddenSections(prev => {
      const next = new Set(prev);
      if (next.has(secName)) next.delete(secName);
      else next.add(secName);
      return next;
    });
  }, []);

  const resetCamera = useCallback(() => {
    setCameraResetTrigger(t => t + 1);
  }, []);

  const containerClass = isFullscreen
    ? 'fixed inset-0 z-50 bg-background flex flex-col'
    : 'space-y-2 border rounded-lg p-2';

  const groundSize = Math.max(
    sceneBounds.maxX - sceneBounds.minX,
    sceneBounds.maxZ - sceneBounds.minZ,
    3
  );

  return (
    <div className={containerClass}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b bg-muted/30 flex-wrap">
        <Building2 className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold">Vista 3D Global</span>

        {/* Stats */}
        <div className="hidden sm:flex items-center gap-2 text-[9px] text-muted-foreground border-l pl-2 ml-1">
          <span>{buildingStats.totalLevels} nivel(es)</span>
          <span>·</span>
          <span>{buildingStats.totalSpaces} espacio(s)</span>
          <span>·</span>
          <span>{buildingStats.totalFloorArea.toFixed(1)} m² total</span>
        </div>

        {/* View mode buttons */}
        <div className="flex gap-1 ml-2">
          <Button variant={viewMode === 'complete' ? 'default' : 'outline'} size="sm" className="h-6 text-[10px] gap-1"
            onClick={() => { setViewMode('complete'); setSelectedSection(null); setSelectedWs(null); resetCamera(); }}>
            <Home className="h-3 w-3" /> Edificio completo
          </Button>
          <Button variant={viewMode === 'by-section' ? 'default' : 'outline'} size="sm" className="h-6 text-[10px] gap-1"
            onClick={() => { setViewMode('by-section'); setSelectedWs(null); if (!selectedSection && sections.length) setSelectedSection(sections[0].sectionName); resetCamera(); }}>
            <Layers className="h-3 w-3" /> Por nivel
          </Button>
          <Button variant={viewMode === 'by-workspace' ? 'default' : 'outline'} size="sm" className="h-6 text-[10px] gap-1"
            onClick={() => { setViewMode('by-workspace'); setSelectedSection(null); if (!selectedWs && sortedWs.length) setSelectedWs(sortedWs[0].id); resetCamera(); }}>
            <SortAsc className="h-3 w-3" /> Por espacio
          </Button>
        </div>

        {/* Section/workspace selectors */}
        {viewMode === 'by-section' && (
          <div className="flex gap-1 ml-2">
            {sections.map(s => (
              <Badge key={s.sectionName} variant={selectedSection === s.sectionName ? 'default' : 'outline'}
                className="text-[10px] cursor-pointer" onClick={() => { setSelectedSection(s.sectionName); resetCamera(); }}>
                {s.sectionName} ({s.items.length})
              </Badge>
            ))}
          </div>
        )}

        {viewMode === 'by-workspace' && (
          <div className="flex gap-1 ml-2 flex-wrap max-h-16 overflow-y-auto">
            {sortedWs.map(ws => (
              <Badge key={ws.id} variant={selectedWs === ws.id ? 'default' : 'outline'}
                className="text-[10px] cursor-pointer" onClick={() => { setSelectedWs(ws.id); resetCamera(); }}>
                {ws.name}
              </Badge>
            ))}
          </div>
        )}

        {/* Right controls */}
        <div className="ml-auto flex gap-1 items-center">
          <Button variant="outline" size="sm" className="h-6 text-[9px] gap-1" onClick={resetCamera}>
            <RotateCcw className="h-3 w-3" /> Centrar
          </Button>
          <Button variant="outline" size="sm" className="h-6 text-[9px] gap-1"
            onClick={() => setIsFullscreen(f => !f)}>
            {isFullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            {isFullscreen ? 'Ventana' : 'Completa'}
          </Button>
          <Button variant="ghost" size="sm" className="h-6 text-[9px] gap-1" onClick={onClose}>
            <X className="h-3 w-3" /> Cerrar
          </Button>
        </div>
      </div>

      {/* Secondary controls bar */}
      <div className="flex items-center gap-3 px-3 py-1 border-b bg-muted/10 flex-wrap">
        {/* Opacity slider */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-muted-foreground whitespace-nowrap">Opacidad paredes:</span>
          <Slider
            value={[wallOpacity]}
            onValueChange={([v]) => setWallOpacity(v)}
            min={10}
            max={100}
            step={5}
            className="w-20"
          />
          <span className="text-[9px] text-muted-foreground w-7">{wallOpacity}%</span>
        </div>

        {/* Labels toggle */}
        <Button variant={showLabels ? 'default' : 'outline'} size="sm" className="h-5 text-[9px] gap-1 px-2"
          onClick={() => setShowLabels(v => !v)}>
          {showLabels ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          Cotas
        </Button>

        {/* Section visibility (complete view) */}
        {viewMode === 'complete' && sections.length > 1 && (
          <div className="flex items-center gap-1 border-l pl-2">
            <span className="text-[9px] text-muted-foreground">Niveles:</span>
            {sections.map(s => (
              <Button
                key={s.sectionName}
                variant={hiddenSections.has(s.sectionName) ? 'outline' : 'default'}
                size="sm"
                className="h-5 text-[9px] gap-1 px-2"
                onClick={() => toggleSectionVisibility(s.sectionName)}
              >
                {hiddenSections.has(s.sectionName) ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
                {s.sectionName}
              </Button>
            ))}
          </div>
        )}

        {/* Info */}
        <span className="text-[9px] text-muted-foreground ml-auto">
          {currentItems.length} espacio(s) · Doble clic en cara → editar
        </span>
      </div>

      {/* 3D Canvas */}
      <div className={`${isFullscreen ? 'flex-1' : 'h-[500px]'} rounded-lg border bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 overflow-hidden mx-2 mb-2`}>
        {currentItems.length > 0 ? (
          <Canvas camera={{ position: [6, 6, 6], fov: 50 }} shadows>
            <ambientLight intensity={0.5} />
            <directionalLight position={[8, 12, 8]} intensity={0.9} castShadow />
            <directionalLight position={[-5, 6, -5]} intensity={0.3} />
            <hemisphereLight args={['#b1e1ff', '#b97a20', 0.2]} />

            <AutoFrameCamera bounds={sceneBounds} resetTrigger={cameraResetTrigger} controlsRef={orbitControlsRef} />

            {currentItems.map(ws => (
              <MultiPrism
                key={ws.id}
                ws={ws}
                scaleXY={scaleXY}
                scaleZ={scaleZ}
                offsetX={0}
                offsetZ={0}
                onFaceDoubleClick={onFaceDoubleClick}
                allSections={allSections}
                opacity={wallOpacity / 100}
                showLabels={showLabels}
              />
            ))}

            <GroundPlane size={groundSize} />

            <OrbitControls
              ref={orbitControlsRef}
              enableDamping
              dampingFactor={0.15}
              zoomSpeed={0.5}
              rotateSpeed={0.8}
              panSpeed={0.6}
              minDistance={0.5}
              maxDistance={80}
            />
            <gridHelper args={[groundSize * 2, Math.round(groundSize * 2 / 0.625), '#aaaaaa', '#dddddd']} position={[groundSize, 0, groundSize]} />
            <InfiniteAxes3D labelDistance={1.8} />
          </Canvas>
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Selecciona un nivel o espacio de trabajo para ver el modelo 3D
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-[9px] px-2 pb-2">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: FACE_COLORS.suelo }} /> Suelo</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: FACE_COLORS.techo }} /> Techo</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: FACE_COLORS.pared_exterior }} /> Pared ext.</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: FACE_COLORS.pared_interior }} /> Pared int.</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: FACE_COLORS.tejado }} /> Tejado</span>
      </div>
    </div>
  );
}
